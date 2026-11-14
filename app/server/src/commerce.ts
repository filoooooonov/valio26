import { explainPurchase } from "./explain";
import { z } from 'zod';
import { audit } from './audit';
import type { Principal } from './auth';
import { scopeBasket } from './auth';
import { buildBasket, HttpError, type Basket } from './plan';
import { placeOrder } from './orders';
import { getMandate } from './policy';
import { orders, persistStore } from './store';
import { orderRevision, validatePurchase } from './validation';

export const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s,'Invalid calendar date');
export const ItemSchema=z.object({query:z.string().trim().min(1).max(200),quantity:z.number().positive().max(1000000),unit:z.enum(['l','kg','pcs'])}).strict();
export const PurchaseSchema=z.object({request:z.string().trim().min(1).max(8000),date:DateSchema,people:z.number().int().min(1).max(2000).optional(),delivery:z.object({placeId:z.string().min(1).max(100),address:z.string().min(1).max(300),time:z.string().min(1).max(80)}).strict().optional(),items:z.array(ItemSchema).min(1).max(40).optional(),forbiddenAllergens:z.array(z.string().min(1).max(40)).max(30).optional()}).strict();
export type PurchaseInput=z.infer<typeof PurchaseSchema>;
export const PolicySchema=z.object({maxOrderEur:z.number().nonnegative().max(1000000),maxDailyEur:z.number().nonnegative().max(10000000),autoSwapSameUse:z.boolean(),substitutionsPermitted:z.boolean().default(true),forbiddenAllergens:z.array(z.string().min(1).max(40)).max(30),allowedCategories:z.array(z.string().min(1).max(30)).max(100),requireApproval:z.boolean(),maxSubstituteIncreasePct:z.number().min(0).max(100),allowedDeliveryWeekdays:z.array(z.number().int().min(0).max(6)).max(7)}).strict();
export const ApprovalSchema=z.object({revision:z.string().regex(/^[a-f0-9]{64}$/),decision:z.enum(['approve','reject']),note:z.string().max(1000).optional()}).strict();

export async function createPurchase(p:Principal, input:PurchaseInput) {
  const b=await buildBasket({...input,customer:p.customer});
  audit(b.id,p.actor,'identity',`Request initiated by ${p.actor} for account ${p.customer}.`,{customer:p.customer,role:p.role,source:'authenticated',simulated:true});
  audit(b.id,"gateway","validation",validatePurchase(b).length ? "Purchasing requires intervention: " + validatePurchase(b).map(c=>c.message).join(" ") : "Products, customer pricing, known stock and delivery date passed deterministic validation.",{checks:validatePurchase(b),revision:orderRevision(b),policy:getMandate(p.customer),constraints:{forbiddenAllergens:b.forbiddenAllergens,delivery:b.delivery},sources:{catalogue:"sponsor_data",priceAndAvailability:b.factSource ?? "unknown",deliveryAddress:"user_supplied_unverified",order:"local_simulation"}});
  persistStore();
  return purchaseView(b);
}
export function purchaseView(b:Basket) {
  const latest=[...orders.values()].filter(o=>o.basketId===b.id).at(-1);
  const o=latest?.status==='rejected' && latest.revision!==orderRevision(b) ? undefined : latest;
  const checks=validatePurchase(b);
  return {id:b.id,intent:b.intent ?? (b.dishes.length?'MENU_PLANNING':'DIRECT_PURCHASE'),state:o?.status==='rejected'?'REJECTED':o?.status==='placed'?'CONFIRMED':o?.status==='pending_approval'?'PENDING_APPROVAL':checks.length || b.openIssues?'DRAFT':b.mandate.state==='needs_approval'?'PENDING_APPROVAL':'VALIDATED',revision:o?.revision ?? orderRevision(b),simulated:true,basket:b,order:o,checks,decisions:explainPurchase(b)};
}
export async function submitPurchase(p:Principal,id:string) {
  const b=scopeBasket(p,id);
  const existing=[...orders.values()].find(o=>o.basketId===id && o.status!=='rejected');
  if (!existing) {
    const r=await placeOrder(id,p.actor);
    if (!r.ok && ![...orders.values()].some(o=>o.basketId===id && o.status!=='rejected')) throw new HttpError(r.status,r.mandate?.reasons.join(' ') ?? r.error);
  }
  return purchaseView(b);
}

