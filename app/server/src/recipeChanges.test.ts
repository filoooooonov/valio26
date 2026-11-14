import {beforeAll,beforeEach,afterEach,expect,test} from 'bun:test';
import {app} from './app';
import {buildBasket,checkReplacements,proposeRecipeChange,applyRecipeChange,editLine} from './plan';
import {loadCatalog,getProduct} from './catalog';
import {setLlm,type Draft} from './llm';
import {setFetcher} from './valio';
import {baskets,resetStore,orders} from './store';
const need=(id:string,dishId:string,item:string):Draft['needs'][number]=>({id,dishId,item,queries:[item],totalQty:1,totalUnit:'kg',perPortion:null,perPortionUnit:null,diet:[]});
let available=false,calls=0;
beforeAll(()=>{loadCatalog();process.env.VALIO_API_KEY ??= 'test';});
beforeEach(()=>{
 resetStore();available=false;calls=0;
 setFetcher((async(url:string,init:RequestInit)=>{
 calls++;const {products:ids}=JSON.parse(init.body as string);
 return new Response(JSON.stringify({timeNow:new Date().toISOString(),products:ids.map((id:string)=>String(url).endsWith('/price')?{productId:id,netPriceFound:true,error:false,catalogPrice:{value:10,valueWithTax:11.35,validTo:'2026-12-31'},comparisonPrice:{value:10},comparisonUnit:'KG',tax:{taxRate:13.5}}:{productId:id,logisticModel:'Stock',salesBlock:false,closingTime:'2099-01-01T12:00:00+0200',scheduleLines:!available&&/blueber|mustik/i.test((getProduct(id)?.en??'')+' '+(getProduct(id)?.fi??''))?[]:[{salesBlock:false,availableAmount:99999,availableDate:'2026-11-16',salesUnit:'ST'}]})}));
 }) as typeof fetch);
 setLlm({draft:async request=>request.includes('Prepare ONLY ONE')?{people:50,dishes:[{id:'apple',name:'Apple pie',portions:50,basis:'one serving',diet:[]}],needs:[need('apple','apple','apple')],assumed:['flour','sugar']}:{people:50,dishes:[{id:'pie',name:'Blueberry pie',portions:50,basis:'one serving',diet:[]},{id:'bread',name:'Rye bread',portions:50,basis:'one slice',diet:[]}],needs:[need('berries','pie','blueberry'),need('bread','bread','rye bread')],assumed:[]},pick:async(_r,needs)=>({picks:needs.map(n=>({needId:n.id,ranked:n.candidates.slice(0,1).map(c=>c.id)}))})});
});
afterEach(()=>{setLlm(null);resetStore();});
const build=()=>buildBasket({request:'Blueberry pie and rye bread for 50 people',date:'2026-11-20'});
test('fresh replacement check can recover original without replanning',async()=>{
 const b=await build();const l=b.lines.find(l=>l.issue)!;expect(l).toBeDefined();const id=b.id, dishes=structuredClone(b.dishes);available=true;const before=calls;await checkReplacements(id,l.id);expect(calls).toBeGreaterThan(before);expect(l.issue).toBeUndefined();expect(b.id).toBe(id);expect(b.dishes).toEqual(dishes);
});
test('recipe proposal leaves source intact, explicit apply changes only that dish in same basket',async()=>{
 const b=await build(),l=b.lines.find(l=>l.issue)!;expect(l).toBeDefined();const side=b.lines.find(l=>l.dishId==='bread')!;editLine(b.id,side.id,{qty:7});const untouched=structuredClone(side),original=structuredClone(b);const p=await proposeRecipeChange(b.id,l.id);expect(p.from).toBe('Blueberry pie');expect(p.to).toBe('Apple pie');expect(b).toEqual(original);const next=applyRecipeChange(b.id,p.id);expect(next.id).toBe(b.id);expect(next.lines.find(l=>l.id===side.id)).toEqual(untouched);expect(next.dishes.map(d=>d.name)).toEqual(['Apple pie','Rye bread']);expect(next.openIssues).toBe(0);expect(baskets.size).toBe(1);expect(()=>applyRecipeChange(b.id,p.id)).toThrow('expired');
});
test('stale and locked recipe proposals are rejected without overwriting edits',async()=>{
 const b=await build(),l=b.lines.find(l=>l.issue)!;const p=await proposeRecipeChange(b.id,l.id);const side=b.lines.find(l=>l.dishId==='bread')!;editLine(b.id,side.id,{qty:9});expect(()=>applyRecipeChange(b.id,p.id)).toThrow('Basket changed');expect(side.qty).toBe(9);
 const p2=await proposeRecipeChange(b.id,l.id);orders.set('lock',{basketId:b.id,status:'pending_approval',id:'lock'} as any);expect(()=>applyRecipeChange(b.id,p2.id)).toThrow('waiting for approval');
});
test('no recipe is invented when language planner is unavailable; route reports missing basket',async()=>{
 const b=await build(),l=b.lines.find(l=>l.issue)!;setLlm(null);await expect(proposeRecipeChange(b.id,l.id)).rejects.toThrow('no complete available alternative');const r=await app.request('/api/basket/missing/lines/missing/replacements/check',{method:'POST'});expect(r.status).toBe(404);
});

test('shared ingredients retain the quantity required by the other recipe',async()=>{
 setLlm({draft:async request=>request.includes('Prepare ONLY ONE')?{people:50,dishes:[{id:'apple',name:'Apple pie',portions:50,basis:'one serving',diet:[]}],needs:[need('apple','apple','apple')],assumed:[]}:{people:50,dishes:[{id:'pie',name:'Blueberry pie',portions:50,basis:'one serving',diet:[]},{id:'bread',name:'Bread and butter',portions:50,basis:'one serving',diet:[]}],needs:[need('berries','pie','blueberry'),need('pie-butter','pie','butter'),need('bread-butter','bread','butter'),need('bread','bread','rye bread')],assumed:[]},pick:async(_r,needs)=>({picks:needs.map(n=>({needId:n.id,ranked:n.candidates.slice(0,1).map(c=>c.id)}))})});
 const b=await build(),l=b.lines.find(l=>l.issue)!;const shared=b.lines.find(l=>l.usedIn?.length===2)!;expect(shared).toBeDefined();const originalQty=shared.qty;const p=await proposeRecipeChange(b.id,l.id);const next=applyRecipeChange(b.id,p.id);const kept=next.lines.find(l=>l.id===shared.id)!;expect(kept.qty).toBeGreaterThan(0);expect(kept.qty).toBeLessThanOrEqual(originalQty);expect(kept.requestedAmount!.qty).toBeLessThan(shared.requestedAmount!.qty);expect(kept.dishId).toBe('bread');expect(kept.needIds).toHaveLength(1);
});
