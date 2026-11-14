#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

// Each take gets a separate persisted ledger so previous daily spending cannot affect reproducibility.
process.env.COMMERCE_LEDGER_PATH ??= join('data','commerce',`demo-${Date.now()}.json`);
const agent=randomBytes(32).toString('hex'),approver=randomBytes(32).toString('hex');
process.env.COMMERCE_PRINCIPALS_JSON=JSON.stringify([{token:agent,actor:'agent:demo',customer:'demo',role:'agent'},{token:approver,actor:'Mikko L.',customer:'demo',role:'approver'}]);
const {loadCatalog}=await import('../app/server/src/catalog.ts');loadCatalog();
const {setLlm}=await import('../app/server/src/llm.ts');
const {app}=await import('../app/server/src/app.ts');
const synthetic=!process.argv.includes('--live');let fixture;
if(synthetic){process.env.VALIO_API_KEY??='synthetic-fixture-only';setLlm(null);fixture=(await import('../app/server/src/demo-fixture.ts')).installSyntheticFacts();}
const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch:app.fetch});
const base=`http://127.0.0.1:${server.port}`;
console.log(synthetic?'SOURCE: real sponsor catalogue IDs; explicitly SYNTHETIC price/stock fixture.':'SOURCE: sponsor mock pricing/availability; no production systems.');
console.log('All confirmations are LOCAL SIMULATIONS. Ledger:',process.env.COMMERCE_LEDGER_PATH);
async function call(path,body,token=agent,expected){
  const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const result=await r.json();if(expected)assert.equal(r.status,expected,JSON.stringify(result));else assert(r.ok,JSON.stringify(result));return result;
}
const report=(label,r)=>console.log(JSON.stringify({scenario:label,id:r.id,intent:r.intent,state:r.state,total:r.order?.total ?? r.basket?.total,confirmation:r.order?.confirmationReference,checks:r.checks?.map(c=>c.code),simulated:r.simulated},null,2));
try{
  const menu=await call('/api/menu',{request:'Catering for 50 people on Saturday. No peanuts. Budget EUR500.'});
  assert(menu.items.length>0);
  const catering=await call('/api/v1/purchase-requests',{request:'Catering for 50 people: salmon soup, rye bread, blueberry pie. No peanuts. Budget EUR500.',people:50,date:'2026-11-20',forbiddenAllergens:['AP']});
  report('1: menu approved; products prepared; missing safety evidence escalates',catering);
  console.log('WHY:',catering.decisions.intervention.slice(0,3).join(' '));
  assert.equal(catering.intent,'MENU_PLANNING');assert(catering.basket.lines.length>0);
  if(catering.checks.length)await call(`/api/v1/purchase-requests/${catering.id}/submit`,{},agent,409);

  const milk=await call('/api/v1/purchase-requests',{request:'1000 litres of lactose-free milk delivered Monday',date:'2026-11-16',items:[{query:'lactose-free milk',quantity:1000,unit:'l'}]});
  assert.equal(milk.intent,'DIRECT_PURCHASE');assert.equal(milk.basket.dishes.length,0);
  if(milk.checks.length){report('2: live mock data requires intervention (no fabricated success)',milk);}
  else{
    const submitted=await call(`/api/v1/purchase-requests/${milk.id}/submit`,{});report('2: independent HTTP client, same engine',submitted);console.log('WHY:',submitted.decisions.authorization.join(' '));
    if(submitted.state==='PENDING_APPROVAL'){
      await call(`/api/v1/purchase-requests/${milk.id}/approve`,{decision:'approve',revision:submitted.revision},agent,403);
      const done=await call(`/api/v1/purchase-requests/${milk.id}/approve`,{decision:'approve',revision:submitted.revision},approver);report('2: authorized human approval',done);
      assert.equal(done.state,'CONFIRMED');
    }
    const replay=await call(`/api/v1/purchase-requests/${milk.id}/submit`,{});assert(replay.order.simulated);
  }

  const unavailableSku=milk.basket.lines[0].sku;
  if(fixture)fixture.blocked.add(unavailableSku);
  const exception=await call('/api/v1/purchase-requests',{request:'20 litres lactose-free milk',date:'2026-11-16',items:[{query:'lactose-free milk',quantity:20,unit:'l'}]});
  report('3: unavailable candidate excluded; remaining quoted products compared',exception);
  if(synthetic){assert.notEqual(exception.basket.lines[0].sku,unavailableSku);assert.equal(exception.basket.lines[0].comparison.candidates.find(c=>c.line.sku===unavailableSku)?.status,'excluded');assert.equal(exception.checks.length,0);}
  console.log('WHY:',JSON.stringify(exception.decisions,null,2));
  if(!exception.checks.length && !exception.basket.openIssues){const done=await call(`/api/v1/purchase-requests/${exception.id}/submit`,{});report('3: exception resolved within policy',done);}
  const audit=await call(`/api/v1/purchase-requests/${exception.id}/audit`);assert(audit.some(e=>e.kind==='choice'));
  console.log('PASS: all three scenarios used the shared purchasing engine over HTTP.');
}finally{server.stop(true);}
