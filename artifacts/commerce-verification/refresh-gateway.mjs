import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {orderRevision} from '../../app/server/src/validation.ts';
const read=async path=>{const r=await fetch('http://localhost:8787'+path);if(!r.ok)throw Error('Cannot back up '+path);return r.json();};
const orders=await read('/api/orders'), audit=await read('/api/audit?limit=1000');
const scopes=[...new Set([...orders.map(o=>o.basketId),...audit.map(e=>e.scope)])];
const baskets=[];for(const id of scopes){const r=await fetch('http://localhost:8787/api/basket/'+id);if(r.ok)baskets.push(await r.json());}
const snapshot={at:new Date().toISOString(),orders,baskets,audit};
writeFileSync('artifacts/commerce-verification/pre-refresh-backup.json',JSON.stringify(snapshot,null,2));
const path=process.env.COMMERCE_LEDGER_PATH?resolve('app/server',process.env.COMMERCE_LEDGER_PATH):resolve('app/server/data/commerce/ledger.json');
if(existsSync(path))throw Error('Existing ledger found; refusing to overwrite it.');
const auditByScope=new Map();for(const {scope,...event} of audit){const events=auditByScope.get(scope)??[];events.push(event);auditByScope.set(scope,events);}
for(const list of auditByScope.values())list.sort((a,b)=>a.at.localeCompare(b.at));
for(const b of baskets){if(!orders.some(o=>o.basketId===b.id&&o.status==='placed'))b.validationGaps=[...(b.validationGaps??[]),'Older gateway draft: rebuild this request to apply current safety validation.'];}
for(const o of orders){o.simulated=true;o.deliveryDate=baskets.find(b=>b.id===o.basketId)?.date;o.revision=orderRevision(baskets.find(b=>b.id===o.basketId));if(o.status==='placed')o.confirmationReference??='SIM-'+o.id;}
mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify({baskets:baskets.map(b=>[b.id,b]),orders:orders.map(o=>[o.id,o]),audit:[...auditByScope]},null,2));
console.log(JSON.stringify({backedUpBaskets:baskets.length,backedUpOrders:orders.length,auditEvents:audit.length,persisted:true}));
