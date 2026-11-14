import { afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';
import { app } from './app';
import { loadCatalog, getProduct } from './catalog';
import { resetStore, baskets } from './store';
import { resetAudit } from './audit';
import { setFetcher } from './valio';
import { setLlm } from './llm';
import { setMandate } from './policy';
import { orderRevision, validatePurchase } from './validation';
import { purchasingIntent } from './intent';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packOf, salesQty } from './plan';

const agent='test-agent-credential-00000000001', approver='test-approver-credential-00000001', foreign='test-foreign-credential-000000001';
let price=1, amount:number|undefined=100000, delivered=true, customerPrice=true, cutoff=true;
let pricesCalled=0;
const request=(path:string,body?:unknown,token=agent,method=body===undefined?'GET':'POST')=>app.request(path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},...(body!==undefined?{body:JSON.stringify(body)}:{})});
const milk=(quantity=20)=>({request:`${quantity} litres lactose-free milk`,date:'2026-11-16',items:[{query:'lactose-free milk',quantity,unit:'l'}]});
async function create(quantity=20){const r=await request('/api/v1/purchase-requests',milk(quantity));expect(r.status).toBe(201);return r.json();}

beforeAll(()=>{loadCatalog();process.env.VALIO_API_KEY??='test';});
beforeEach(()=>{
  resetStore();resetAudit();setLlm(null);
  setMandate('secure-demo',{maxOrderEur:500,maxDailyEur:1500,forbiddenAllergens:[],requireApproval:false,autoSwapSameUse:true,substitutionsPermitted:true,allowedCategories:[],allowedDeliveryWeekdays:[],maxSubstituteIncreasePct:20});
  process.env.COMMERCE_PRINCIPALS_JSON=JSON.stringify([{token:agent,actor:'agent:chef',customer:'secure-demo',role:'agent'},{token:approver,actor:'Mikko L.',customer:'secure-demo',role:'approver'},{token:foreign,actor:'agent:other',customer:'other',role:'agent'}]);
  price=1;amount=100000;delivered=true;customerPrice=true;cutoff=true;pricesCalled=0;
  setFetcher((async(url:string,init:RequestInit)=>{
    const ids=JSON.parse(String(init.body)).products as string[];
    const pricing=String(url).endsWith('/price');if(pricing)pricesCalled++;
    const products=ids.map(productId=>pricing?{productId,netPriceFound:customerPrice,catalogPrice:{value:price,valueWithTax:price*1.135},comparisonPrice:{value:price},comparisonUnit:'L',tax:{taxRate:13.5}}:{productId,closingTime:cutoff?'2099-01-01T12:00:00Z':undefined,scheduleLines:delivered?[{availableDate:'2026-11-16',availableAmount:amount,salesUnit:'ST'}]:[]});
    return new Response(JSON.stringify({timeNow:'2026-11-14T12:00:00Z',products}));
  }) as typeof fetch);
});
afterEach(()=>{delete process.env.COMMERCE_PRINCIPALS_JSON;setLlm(null);resetStore();});

test('direct request and website intent bypass menu and LLM; exact packaging and overbuy',async()=>{
  let drafts=0;setLlm({draft:async()=>{drafts++;throw Error('must not call');},pick:async()=>({picks:[]})});
  expect(purchasingIntent('I need 1,000 litres of lactose-free milk delivered Monday')).toBe('DIRECT_PURCHASE');
  expect(purchasingIntent('Catering for 50 people, no peanuts')).toBe('MENU_PLANNING');
  const b=await create(20.2);expect(drafts).toBe(0);expect(b.intent).toBe('DIRECT_PURCHASE');expect(b.basket.dishes).toHaveLength(0);
  expect(b.basket.lines[0].qty).toBe(21);expect(b.basket.lines[0].why).toContain('21');expect(b.checks).toHaveLength(0);
});
test('full flow enforces spending, separate approval identity, exact revision and safe duplicate replay',async()=>{
  const b=await create(1000);expect(b.basket.mandate.state).toBe('needs_approval');
  const sent=await (await request(`/api/v1/purchase-requests/${b.id}/submit`,{})).json();expect(sent.state).toBe('PENDING_APPROVAL');
  expect((await request(`/api/v1/purchase-requests/${b.id}/approve`,{decision:'approve',revision:sent.revision,by:'Mikko L.'})).status).toBe(403);
  const ok=await request(`/api/v1/purchase-requests/${b.id}/approve`,{decision:'approve',revision:sent.revision},approver);expect(ok.status).toBe(200);
  const done=await ok.json();expect(done.order.simulated).toBe(true);expect(done.order.confirmationReference).toStartWith('SIM-');expect(done.state).toBe('CONFIRMED');
  const replay=await (await request(`/api/v1/purchase-requests/${b.id}/submit`,{})).json();expect(replay.order.id).toBe(done.order.id);
  const audit=await (await request(`/api/v1/purchase-requests/${b.id}/audit`)).json();expect(audit.some((e:any)=>e.actor==='Mikko L.'&&e.kind==='decision')).toBe(true);
});
test('credentials bind account, identity and policy on both v1 and legacy paths',async()=>{
  expect((await app.request('/api/v1/policies')).status).toBe(401);
  expect((await request('/api/v1/purchase-requests',{...milk(),customer:'other',maxOrderEur:99999})).status).toBe(400);
  const b=await create();expect((await request(`/api/v1/purchase-requests/${b.id}`,undefined,foreign)).status).toBe(404);
  expect((await request(`/api/basket/${b.id}`,undefined,foreign)).status).toBe(404);
  expect((await request('/api/v1/policies',{maxOrderEur:99999},agent,'PUT')).status).toBe(403);
  expect((await app.request('/api/orders')).status).toBe(401);
  const large=await create(600);const sent=await (await request(`/api/v1/purchase-requests/${large.id}/submit`,{})).json();
  expect((await request(`/api/orders/${sent.order.id}/decision`,{decision:'approve',by:'Mikko L.'})).status).toBe(403);
});
test('allergen restrictions are hard constraints; empty lists never establish free-from safety',async()=>{
  for (const allergen of ['milk','peanuts']) {
    const r=await request('/api/v1/purchase-requests',{...milk(),forbiddenAllergens:[allergen]});const b=await r.json();
    expect(b.checks.some((c:any)=>c.code===(allergen==='milk'?'allergen_forbidden':'allergen_unknown'))).toBe(true);
    expect((await request(`/api/v1/purchase-requests/${b.id}/submit`,{})).status).toBe(409);
  }
});
test('unknown stock, missing delivery cutoff and missing customer price cannot be approved',async()=>{
  amount=999999;let b=await create();expect(b.checks.some((c:any)=>c.code==='stock_unknown')).toBe(true);
  expect((await request(`/api/v1/purchase-requests/${b.id}/submit`,{})).status).toBe(409);
  amount=100000;cutoff=false;b=await create();expect(b.checks.some((c:any)=>c.code==='delivery_unverified')).toBe(true);
  cutoff=true;customerPrice=false;b=await create();expect(b.checks.some((c:any)=>c.code==='price_unverified')).toBe(true);
});
test('unavailable products escalate and cannot result in a partial successful order',async()=>{
  delivered=false;const b=await create();expect(b.basket.openIssues).toBeGreaterThan(0);
  expect((await request(`/api/v1/purchase-requests/${b.id}/submit`,{})).status).toBe(409);
});
test('changed price invalidates approval and requires reviewing new revision',async()=>{
  const b=await create(600);const sent=await (await request(`/api/v1/purchase-requests/${b.id}/submit`,{})).json();price=1.1;
  expect((await request(`/api/v1/purchase-requests/${b.id}/approve`,{decision:'approve',revision:sent.revision},approver)).status).toBe(409);
  const updated=await (await request(`/api/v1/purchase-requests/${b.id}`)).json();expect(updated.revision).not.toBe(sent.revision);expect(updated.order.total).toBe(660);
  expect((await request(`/api/v1/purchase-requests/${b.id}/approve`,{decision:'approve',revision:sent.revision},approver)).status).toBe(409);
  expect((await request(`/api/v1/purchase-requests/${b.id}/approve`,{decision:'approve',revision:updated.revision},approver)).status).toBe(200);
});
test('customer, delivery, quantity and prices all contribute to exact order revision',async()=>{
  const b=(await create()).basket;const original=orderRevision(b);
  for(const alter of [(x:any)=>x.date='2026-11-17',(x:any)=>x.customer='other',(x:any)=>x.lines[0].qty++,(x:any)=>x.lines[0].stock.price++]){const copy=structuredClone(b);alter(copy);expect(orderRevision(copy)).not.toBe(original);}
});
test('concurrent submissions produce one simulated confirmation',async()=>{
  const b=await create();const replies=await Promise.all(Array.from({length:4},()=>request(`/api/v1/purchase-requests/${b.id}/submit`,{})));
  const values=await Promise.all(replies.map(r=>r.json()));expect(new Set(values.map(r=>r.order.id)).size).toBe(1);
});
test('policy allergen restrictions survive client request and later changes',async()=>{
  const b=await create();setMandate('secure-demo',{forbiddenAllergens:['milk']});
  expect(validatePurchase(baskets.get(b.id)!).some(c=>c.code==='allergen_forbidden')).toBe(true);
  expect((await request(`/api/v1/purchase-requests/${b.id}/submit`,{})).status).toBe(409);
});
test('OpenAPI publishes strict schemas and authenticated operations without credentials',async()=>{
  const r=await app.request('/api/v1/openapi.json');expect(r.status).toBe(200);const spec=await r.json();expect(spec.openapi).toBe('3.1.0');expect(spec.components.schemas.PurchaseRequest.additionalProperties).toBe(false);expect(JSON.stringify(spec)).not.toContain(agent);
});

test('cookie sessions preserve delegated identity and reject cross-origin mutations',async()=>{
  const login=await request('/api/v1/session',{});expect(login.status).toBe(200);
  const cookie=login.headers.get('set-cookie')!;expect(cookie).toContain('HttpOnly');expect(cookie).toContain('SameSite=Strict');
  expect(JSON.stringify(await login.json())).not.toContain(agent);
  const headers={'Content-Type':'application/json',cookie:cookie.split(';')[0]};
  expect((await app.request('/api/v1/purchase-requests',{method:'POST',headers:{...headers,Origin:'https://untrusted.example'},body:JSON.stringify(milk())})).status).toBe(403);
  expect((await app.request('/api/v1/purchase-requests',{method:'POST',headers:{...headers,Origin:'http://localhost'},body:JSON.stringify(milk())})).status).toBe(201);
});
test('delivery details and minimum sponsor lots are part of validation and revision',async()=>{
  const b=(await create()).basket;
  const copy=structuredClone(b);copy.delivery={placeId:'sample',address:'Different address',time:'10-12'};expect(orderRevision(copy)).not.toBe(orderRevision(b));
  const fish=getProduct('461814')!;const pack=packOf({...b.lines[0].stock,salesUnit:'KG'},fish);
  expect(salesQty({qty:7,unit:'KG'},pack).qty).toBe(10);
  const result=await create(20.2);expect(result.basket.lines[0].overbuy).toBeCloseTo(0.8);
});
test('hard substitution prohibition and category/delivery restrictions cannot be approved away',async()=>{
  const result=await create(),b=baskets.get(result.id)!;
  b.lines[0].replaced={sku:'464201',name:'original',originalTotal:20};
  setMandate('secure-demo',{substitutionsPermitted:false,allowedCategories:['not-this-category'],allowedDeliveryWeekdays:[2]});
  const codes=validatePurchase(b).map(c=>c.code);expect(codes).toContain('substitution_forbidden');expect(codes).toContain('category_forbidden');expect(codes).toContain('delivery_policy');
  expect((await request(`/api/v1/purchase-requests/${result.id}/submit`,{})).status).toBe(409);
});
test('rejection is explicit, and schema errors include invalid calendar dates and malformed JSON',async()=>{
  const b=await create(600);const sent=await (await request(`/api/v1/purchase-requests/${b.id}/submit`,{})).json();
  const rejected=await (await request(`/api/v1/purchase-requests/${b.id}/approve`,{decision:'reject',revision:sent.revision},approver)).json();expect(rejected.state).toBe('REJECTED');
  expect((await request('/api/v1/purchase-requests',{...milk(),date:'2026-02-30'})).status).toBe(400);
  expect((await app.request('/api/v1/purchase-requests',{method:'POST',headers:{Authorization:`Bearer ${agent}`,'Content-Type':'application/json'},body:'{'})).status).toBe(400);
});
test('explanations identify suggestion, evidence, packaging and financial decision',async()=>{
  const b=await create(600);expect(b.decisions.authorization.join(' ')).toContain('500');
  expect(b.decisions.products[0].quantity).toContain('Overbuy');expect(b.decisions.products[0].source.priceAndStock).toBe('synthetic_fixture');
  const audit=await (await request(`/api/v1/purchase-requests/${b.id}/audit`)).json();expect(audit.some((e:any)=>e.kind==='choice' && e.summary.includes('Selected'))).toBe(true);
});
test('simulated confirmations and audit survive process restart without persisting credentials',()=>{
  const ledger=join(mkdtempSync(join(tmpdir(),'aimo-commerce-')),'ledger.json');
  const cwd=fileURLToPath(new URL('.',import.meta.url));
  const env={...process.env,COMMERCE_LEDGER_PATH:ledger};
  const prepare=`import {app} from './app';import {loadCatalog} from './catalog';import {installSyntheticFacts} from './demo-fixture';loadCatalog();installSyntheticFacts();const h={Authorization:'Bearer ${agent}','Content-Type':'application/json'};const b=await (await app.request('/api/v1/purchase-requests',{method:'POST',headers:h,body:JSON.stringify(${JSON.stringify(milk())})})).json();const r=await app.request('/api/v1/purchase-requests/'+b.id+'/submit',{method:'POST',headers:h,body:'{}'});if(r.status!==200)throw Error(await r.text());console.log(JSON.stringify(await r.json()));`;
  const first=spawnSync(process.execPath,['-e',prepare],{cwd,env,encoding:'utf8'});expect(first.status).toBe(0);const original=JSON.parse(first.stdout.trim());expect(original.state).toBe('CONFIRMED');
  const replay=`import {app} from './app';import {loadCatalog} from './catalog';loadCatalog();const h={Authorization:'Bearer ${agent}','Content-Type':'application/json'};const r=await app.request('/api/v1/purchase-requests/${original.id}/submit',{method:'POST',headers:h,body:'{}'});if(r.status!==200)throw Error(await r.text());console.log(JSON.stringify(await r.json()));`;
  const second=spawnSync(process.execPath,['-e',replay],{cwd,env,encoding:'utf8'});expect(second.status).toBe(0);expect(JSON.parse(second.stdout.trim()).order.confirmationReference).toBe(original.order.confirmationReference);
  const disk=readFileSync(ledger,'utf8');expect(disk).toContain('Selected');expect(disk).not.toContain(agent);expect(disk).not.toContain(approver);
},15000);
