import { Hono } from 'hono';
import { z } from 'zod';
import { requirePrincipal, requireApprover, scopeBasket } from './auth';
import { events } from './audit';
import { ApprovalSchema, createPurchase, DateSchema, PolicySchema, PurchaseSchema, purchaseView, submitPurchase } from './commerce';
import { decide } from './orders';
import { getMandate, setMandate } from './policy';
import { HttpError, recompute } from './plan';
import { orders } from './store';

export const commerceApi=new Hono();
commerceApi.onError((error,c)=> {
  const status=error instanceof HttpError?error.status:error instanceof z.ZodError || error instanceof SyntaxError?400:502;
  return c.json({error:{code:status===400?'INVALID_REQUEST':status===401?'UNAUTHENTICATED':status===403?'FORBIDDEN':status===404?'NOT_FOUND':status===409?'REVIEW_REQUIRED':'UPSTREAM_FAILURE',message:error instanceof z.ZodError?'Request does not match the schema.':error instanceof HttpError?error.message:error instanceof SyntaxError?'Malformed JSON request.':'Purchasing service unavailable; no confirmation was issued.',...(error instanceof z.ZodError?{details:error.issues}:{})}},status as any);
});
commerceApi.get('/openapi.json',c=>c.json(openapi));
commerceApi.use('*',async(c,next)=>{requirePrincipal(c.req.raw);await next();});
commerceApi.post('/session',c=>{
  const p=requirePrincipal(c.req.raw);
  // Credentials are never returned in JSON, URLs or audit events.
  c.header('Set-Cookie',`commerce_session=${p.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${new URL(c.req.url).protocol==='https:'?'; Secure':''}`);
  return c.json({actor:p.actor,customer:p.customer,role:p.role});
});
commerceApi.post('/purchase-requests',async c=>c.json(await createPurchase(requirePrincipal(c.req.raw),PurchaseSchema.parse(await c.req.json())),201));
commerceApi.get('/purchase-requests/:id',c=>c.json(purchaseView(recompute(scopeBasket(requirePrincipal(c.req.raw),c.req.param('id'))))));
commerceApi.get('/purchase-requests/:id/audit',c=>{
  const b=scopeBasket(requirePrincipal(c.req.raw),c.req.param('id'));return c.json(events(b.id));
});
commerceApi.post('/purchase-requests/:id/submit',async c=>c.json(await submitPurchase(requirePrincipal(c.req.raw),c.req.param('id'))));
commerceApi.post('/purchase-requests/:id/approve',async c=>{
  const p=requirePrincipal(c.req.raw);requireApprover(p);
  const b=scopeBasket(p,c.req.param('id'));
  const d=ApprovalSchema.parse(await c.req.json());
  const o=[...orders.values()].find(o=>o.basketId===b.id && o.status==='pending_approval');
  if(!o)throw new HttpError(409,'No pending order to approve.');
  await decide(o.id,{...d,by:p.actor});return c.json(purchaseView(b));
});
commerceApi.get('/policies',c=>c.json(getMandate(requirePrincipal(c.req.raw).customer)));
commerceApi.put('/policies',async c=>{
  const p=requirePrincipal(c.req.raw);if(p.role!=='admin')throw new HttpError(403,'Only an account administrator may configure policy.');
  setMandate(p.customer,PolicySchema.parse(await c.req.json()));return c.json(getMandate(p.customer));
});

const schemas={PurchaseRequest:z.toJSONSchema(PurchaseSchema),Policy:z.toJSONSchema(PolicySchema),Approval:z.toJSONSchema(ApprovalSchema),Date:z.toJSONSchema(DateSchema)};
function operation(summary:string,schema?:keyof typeof schemas,id=false){return {summary,security:[{BearerAuth:[]}],...(id?{parameters:[{in:'path',name:'id',required:true,schema:{type:'string'}}]}:{}),...(schema?{requestBody:{required:true,content:{'application/json':{schema:{$ref:`#/components/schemas/${schema}`}}}}}:{}),responses:{'200':{description:'Evaluated purchase, policy or audit result',content:{'application/json':{schema:{type:['object','array']}}}},'201':{description:'Created'},'400':{description:'Schema validation failed'},'401':{description:'Authentication required'},'403':{description:'Insufficient delegated authority'},'404':{description:'Not found for authenticated customer'},'409':{description:'Validation, stale revision or approval intervention required'},'502':{description:'Upstream unavailable; no order confirmed'}}};}
const openapi={openapi:'3.1.0',info:{title:'Valio Aimo trusted commerce gateway',version:'1.0.0',description:'Shared purchasing engine. All order confirmations are local simulations; no Valio order API exists.'},paths:{
  '/api/v1/session':{post:operation('Exchange bearer for HttpOnly browser session')},
  '/api/v1/purchase-requests':{post:operation('Prepare and validate direct products or a menu','PurchaseRequest')},
  '/api/v1/purchase-requests/{id}':{get:operation('Read current revision',undefined,true)},
  '/api/v1/purchase-requests/{id}/audit':{get:operation('Read human-readable decision evidence',undefined,true)},
  '/api/v1/purchase-requests/{id}/submit':{post:operation('Recheck, authorize and persist a simulated order; safe replay',undefined,true)},
  '/api/v1/purchase-requests/{id}/approve':{post:operation('Human decision on exact revision','Approval',true)},
  '/api/v1/policies':{get:operation('Read server-owned customer policy'),put:operation('Configure policy as administrator','Policy')},
},components:{securitySchemes:{BearerAuth:{type:'http',scheme:'bearer'}},schemas}};
