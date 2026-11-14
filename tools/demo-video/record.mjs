import { chromium } from '../../video/node_modules/playwright/index.mjs';
import { installCursor, createMotion } from './motion.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const out=resolve(root,process.env.DEMO_VIDEO_OUT??'artifacts/demo-video/smooth');
const APP=process.env.APP_URL??'http://localhost:5173';
const API=process.env.GATEWAY??'http://localhost:8787';
mkdirSync(out,{recursive:true});
for(const url of [APP,API+'/api/health']) { const r=await fetch(url); if(!r.ok) throw Error(`Unavailable: ${url}: ${r.status}`); }
const get=async path=>{const r=await fetch(API+path);if(!r.ok)throw Error(`${path}: ${r.status}`);return r.json()};
const browser=await chromium.launch();
const clips=[]; const evidence={recordedAt:new Date().toISOString(),prototype:'Local in-memory orders; no sponsor order endpoint'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function capture(id,run){
 const context=await browser.newContext({viewport:{width:1600,height:900},recordVideo:{dir:out,size:{width:1600,height:900}},locale:'en-GB',timezoneId:'Europe/Helsinki'});
 await context.addInitScript(installCursor);
 const p=await context.newPage(); const t0=Date.now(); const video=p.video(); const events=[]; const motion=createMotion(p,event=>events.push({...event,at:(Date.now()-t0)/1000})); p.motion=motion;
 const stage=async(caption,fn,cap=7)=>{const start=(Date.now()-t0)/1000;await fn();await sleep(800);const end=(Date.now()-t0)/1000;clips.push({id,start,end,seconds:caption==='The gateway plans a basket and checks shortlisted products'?Math.min(cap,end-start):end-start,caption,events:events.filter(e=>e.at>=start&&e.at<=end).map(e=>({...e,at:e.at-start}))}); console.log(caption)};
 try{await run(p,stage);if(['intro','external','outro'].includes(id)){const still=resolve(out,id+'-still.png');await p.screenshot({path:still});for(const c of clips.filter(x=>x.id===id))c.still=still;}}finally{await context.close();const source=await video.path();for(const c of clips.filter(x=>x.id===id))c.source=source;}
}
const manager=async(p,stage,order)=>{
 await stage('Human approval: the same rules apply to outside agents',async()=>{await p.motion.goto(APP+'/?view=mikko');await p.getByRole('button',{name:'Approve and send'}).first().waitFor({timeout:20000});},3);
 const label='AIM-'+order.id.replace(/^o_/,'').toUpperCase();
 const pending=await get('/api/orders?status=pending_approval'); const orderIndex=pending.findIndex(x=>x.id===order.id); if(orderIndex<0)throw Error('Exact order missing from live approval queue'); const card=p.locator('article.approval:not(.approval--done)').nth(orderIndex);
 if(await card.count()!==1) throw Error(`Cannot identify exact approval card ${label}`);
 await stage('The approver reviews this exact order and its fixed-price total',async()=>{await p.motion.focus(card,1.2);await sleep(1700)},4);
 await stage('Price and stock are checked again when the human approves',async()=>{await p.motion.click(card.getByRole('button',{name:'Approve and send'}));await p.getByRole('heading',{name:'Approved and sent to Valio Aimo'}).waitFor({timeout:30000});await sleep(1200)},5);
 const decided=await get('/api/orders/'+order.id);if(decided.status!=='placed')throw Error('Approval did not place local order');
 return decided;
};
try{
 await capture('intro',async(p,stage)=>{await p.setContent(`<body style="margin:0;background:#003d3c;color:#fff;font:34px Arial;display:grid;place-content:center;height:100vh;padding:0 140px;box-sizing:border-box"><div style="color:#c2e32c;font-size:24px">VALIO AIMO · TRUSTED TRADE AGENTS</div><h1 style="font-size:74px;max-width:1200px">Catering for 50,<br>prepared in one request</h1><p>A buyer assistant · an open gateway · human control</p><p style="font-size:21px;opacity:.7">Hackathon prototype · local order and approval records</p></body>`);await stage('From a kitchen request to a priced basket and human approval',()=>sleep(3500),4)});
 await capture('buyer',async(p,stage)=>{
 await stage('Inside the webshop Anna already uses',async()=>{await p.motion.goto(APP);await p.getByRole('textbox').last().waitFor();await sleep(1200)},3);
 await stage('Ingredients for 50 people on Saturday, with a vegan option',async()=>{await p.motion.type(p.getByRole('textbox').last(),'Ingredients for a catering event for 50 people on Saturday, one vegan option');await sleep(1100);await p.motion.click(p.getByRole('button',{name:'Send',exact:true}));await p.motion.wide()},4);
 await stage('First agree on an editable menu; no products have been looked up yet',async()=>{await p.getByRole('heading',{name:"Let's agree on the menu first"}).waitFor();await p.motion.focus(p.locator('.menu-proposal'),1.15);await sleep(1100)},4);
 await stage('Anna adds fruit to the menu before choosing any products',async()=>{await p.motion.type(p.getByLabel('Add a menu category'),'Fruits');await p.motion.click(p.locator('.menu-add').getByRole('button',{name:'Add',exact:true}));await p.getByRole('checkbox',{name:'Include Fruits',exact:true}).waitFor();await sleep(600)},4);
 await stage('Only the approved menu is sent to the product planner',async()=>{await p.motion.click(p.getByRole('button',{name:'Find products for this menu',exact:true}));await p.motion.wide()},4);
 await stage('The gateway plans a basket and checks shortlisted products',()=>p.getByRole('button',{name:/Review and confirm/}).waitFor({timeout:120000}),4);
 let b=await get('/api/basket/'+new URL(p.url()).searchParams.get('b'));evidence.buyerInitial=b;
 await stage(`${b.lines.length} product lines, customer prices, quantities and delivery checks`,async()=>{await p.motion.wide();await sleep(2400)},4);
 for(let i=0;b.openIssues>0&&i<20;i++){
 const choice=p.locator('.chat').getByRole('button',{name:/^(Use |Take the |Don't order)/}).first();
 if(!await choice.count())throw Error('Open issue has no visible substitution choice');
 await stage('A delivery exception is resolved with an explicit buyer choice',async()=>{await p.motion.click(choice);await p.locator('.chat [aria-busy=true]').waitFor({state:'hidden',timeout:15000}).catch(()=>{});await sleep(1200)},5);
 const previous=b.openIssues; for(let poll=0;poll<20;poll++){b=await get('/api/basket/'+b.id);if(b.openIssues<previous)break;await sleep(400);} console.log('Open issues remaining: '+b.openIssues);
 }
 if(b.openIssues)throw Error('Unresolved basket issues');evidence.buyerResolved=b;
 await stage('Review the basket before committing any order',async()=>{await p.motion.click(p.getByRole('button',{name:/Review and confirm/}));await sleep(1400)},4);
 let response; await stage('The server enforces the spending mandate',async()=>{const button=p.getByRole('button',{name:/^(Place order|Send to .* for approval)/});response=await Promise.all([p.waitForResponse(r=>r.url().endsWith('/order')&&r.request().method()==='POST'),p.motion.click(button)]).then(x=>x[0].json());await sleep(1400)},5);
 const order=response.order??response;if(!order.id)throw Error('Order not created: '+JSON.stringify(response));evidence.buyerOrder=order;
 if(order.status==='pending_approval') evidence.buyerApproved=await manager(p,stage,order);
 await stage('A readable audit trail records the request, checks and decision',async()=>{await p.motion.goto(APP+'/?b='+b.id+'&o='+order.id);await p.motion.click(p.getByRole('button',{name:/View order/}));await p.getByRole('heading',{name:'Audit trail'}).waitFor();await sleep(2200)},5);
 evidence.buyerAudit=await get('/api/orders/'+order.id+'/audit');
 });
 let external;
 const rawExternal=execFileSync(process.execPath,['--no-warnings',resolve(root,'video/record/agent-milk.ts')],{cwd:resolve(root,'video'),encoding:'utf8',env:{...process.env,GATEWAY:API},timeout:180000});external=JSON.parse(rawExternal.trim().split('\n').pop());evidence.external=external;
 await capture('external',async(p,stage)=>{
 await stage('An external hotel procurement agent connects over open MCP',async()=>{

 const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
 await p.setContent(`<body style="margin:0;background:#0b2020;color:#dce9e5;padding:70px;font:23px Consolas;box-sizing:border-box"><h1 style="font:38px Arial;color:#c2e32c">External procurement agent · real MCP calls</h1>${external.lines.map(l=>`<p style="margin:15px 0;color:${l.kind==='err'?'#f9b484':l.kind==='cmd'?'#c2e32c':'#dce9e5'}">${escape(l.text)}</p>`).join('')}<small>Orders are stored in the prototype gateway, not submitted to a sponsor order API.</small></body>`);await sleep(6200);
 },7);
 });
 if(!external.orderId)throw Error('External MCP did not produce order');
 const externalOrder=await get('/api/orders/'+external.orderId);if(externalOrder.status!=='pending_approval')throw Error('Expected external order approval');
 await capture('approval',async(p,stage)=>{evidence.externalApproved=await manager(p,stage,externalOrder)});
 evidence.externalAudit=await get('/api/orders/'+external.orderId+'/audit');
 await capture('outro',async(p,stage)=>{await p.setContent(`<body style="margin:0;background:#003d3c;color:white;font:34px Arial;display:grid;place-content:center;height:100vh;padding:0 120px;box-sizing:border-box"><h1 style="font-size:65px;color:#c2e32c">Request → Lookup → Order → Approval</h1><p>One open MCP + REST gateway.<br>Spending rules enforced by the server.<br>Human decisions recorded in the audit trail.</p><p style="font-size:23px">Prototype local orders · sponsor price and stock adapter · no sponsor order API</p></body>`);await stage('A trusted gateway for the webshop and outside agents',()=>sleep(3500),4)});
 writeFileSync(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));
 writeFileSync(resolve(out,'timeline.json'),JSON.stringify({width:1920,height:1080,fps:30,clips},null,2));
 console.log('Recorded '+clips.length+' clips in '+out+'; render with matching DEMO_VIDEO_OUT. Planned seconds: '+clips.reduce((s,c)=>s+c.seconds,0).toFixed(1));
}finally{await browser.close()}
