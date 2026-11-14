#!/usr/bin/env node
// Standard HTTP external buyer: no imports from the gateway, no browser keys.
const base=process.env.COMMERCE_URL ?? 'http://localhost:8787';
const token=process.env.COMMERCE_TOKEN;
if(!token)throw Error('Set COMMERCE_TOKEN to a server-issued delegated credential.');
async function call(path,body){
  const r=await fetch(`${base}/api/v1${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const value=await r.json();
  if(!r.ok)throw Error(`${r.status}: ${value.error?.message ?? 'Request failed'}`);
  return value;
}
const [command='milk',id,date]=process.argv.slice(2);
let result;
if(command==='milk')result=await call('/purchase-requests',{request:'1000 litres of lactose-free milk',date:id ?? '2026-11-16',items:[{query:'lactose-free milk',quantity:1000,unit:'l'}]});
else if(command==='get')result=await call(`/purchase-requests/${encodeURIComponent(id)}`);
else if(command==='submit')result=await call(`/purchase-requests/${encodeURIComponent(id)}/submit`,{});
else if(command==='audit')result=await call(`/purchase-requests/${encodeURIComponent(id)}/audit`);
else if(command==='approve')result=await call(`/purchase-requests/${encodeURIComponent(id)}/approve`,{decision:'approve',revision:date});
else throw Error('Commands: milk [date], get|submit|audit ID, approve ID REVISION');
console.log(JSON.stringify(result,null,2));
