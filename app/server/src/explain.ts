import { comparisonReason } from "./comparison";
import { getProduct } from './catalog';
import type { Basket } from './plan';
import { getMandate } from './policy';
import { validatePurchase } from './validation';

/** Manager-facing reasoning from the recorded facts; no generated safety or delivery claims. */
export function explainPurchase(b:Basket) {
  const checks=validatePurchase(b),policy=getMandate(b.customer);
  const products=b.lines.filter(l=>l.qty>0).map(l=>{
    const p=getProduct(l.sku);
    const constraints=checks.filter(c=>c.sku===l.sku).map(c=>c.message);
    const selection=l.comparison ? `Selected ${l.name}. ${comparisonReason(l.comparison,l.sku)}` : l.replaced
      ? `Original ${l.replaced.name} could not be supplied as requested. Selected ${l.name}; ${l.issue?.decidedBy?.startsWith('gateway')?'the gateway same-use rule permits this substitution':'the buyer explicitly chose this alternative'}.`
      : `Selected ${l.name} from the catalogue shortlist ${b.planner==='llm'?'ranked by the language model':'matched to the requested product or recipe ingredient'}.`;
    const quantity=`${l.why}${l.overbuy != null && l.requestedAmount ? `. Overbuy versus planned need: ${l.overbuy} ${l.requestedAmount.unit.toLowerCase()}.` : '.'}`;
    const price=`EUR ${l.stock.price.toFixed(2)} per sales unit; EUR ${l.total.toFixed(2)} for ${l.qty} sales units, excluding VAT.`;
    const facts=`${l.stock.available == null?'Stock quantity unknown':`${l.stock.available} sales units reported available`}; availability date ${l.stock.availableDate ?? 'unknown'}; ordering cutoff ${l.stock.closingTime ?? 'unknown'}.`;
    const tradeoffs=l.replaced ? `Substitute price change: ${l.replaced.originalTotal ? ((l.total/l.replaced.originalTotal-1)*100).toFixed(1)+'%' : 'unknown'}. Policy allows ${policy.maxSubstituteIncreasePct}% autonomously. New product: ${p?.en ?? l.name}; dietary suitability is checked separately.` : undefined;
    return {sku:l.sku,name:l.name,selection,quantity,price,facts,tradeoffs,constraints,
      source:{selection:l.comparison?'deterministic comparison of quoted candidates':b.planner==='llm'?'AI-ranked suggestion, not an authorization':'deterministic shortlist',attributes:'sponsor catalogue',priceAndStock:b.factSource ?? 'unknown',deliveryAddress:'user supplied, unverified',order:'local simulation'},
      checkedAt:b.checkedAt};
  });
  return {products,authorization:b.mandate.reasons,intervention:checks.map(c=>c.message),simulated:true};
}
