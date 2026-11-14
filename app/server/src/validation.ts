import { createHash } from 'node:crypto';
import { getProduct } from './catalog';
import type { Basket } from './plan';
import { getMandate } from './policy';

export type Check = { code: string; message: string; sku?: string; evidence: 'catalogue' | 'mock_api' | 'user' | 'policy' };
const aliases: Record<string, string> = { milk:'AM', peanuts:'AP', nuts:'AN', fish:'AF', egg:'AE', eggs:'AE', soy:'AY', sesame:'AS', wheat:'UW', gluten:'AW', celery:'BC', mustard:'BM', crustaceans:'AC', molluscs:'UM', sulphites:'AU', lupin:'NL' };
export const allergenCode = (value: string) => aliases[value.toLowerCase()] ?? value.toUpperCase();

/** Checks that do not block: they route the order to the human approver, whose approval is the confirmation. */
export const SIGN_OFF_CODES = new Set(['stock_unknown']);
/** Checks that must be fixed before anything can be sent. */
export const blockingChecks = (b: Basket) => validatePurchase(b).filter(c => !SIGN_OFF_CODES.has(c.code));
/** Product names whose stock Valio cannot confirm (sign-off guardrail). */
export const stockToConfirm = (b: Basket) => [...new Set(validatePurchase(b).filter(c => c.code === 'stock_unknown').map(c => b.lines.find(l => l.sku === c.sku)?.name ?? c.sku ?? ''))].filter(Boolean);

/** Final order gate, independent of Claude, UI controls and approval authority. */
export function validatePurchase(b: Basket): Check[] {
  const checks: Check[] = [];
  const m = getMandate(b.customer);
  const forbidden = [...new Set([...m.forbiddenAllergens, ...(b.forbiddenAllergens ?? [])].map(allergenCode))];
  const add = (code: string, message: string, evidence: Check['evidence'], sku?: string) => checks.push({code,message,evidence,sku});
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !Number.isFinite(Date.parse(b.date))) add('delivery_unknown','A valid delivery date is required.','user');
  if (m.allowedDeliveryWeekdays.length && !m.allowedDeliveryWeekdays.includes(new Date(b.date+'T12:00:00Z').getUTCDay())) add('delivery_policy','Delivery weekday is outside customer policy.','policy');
  if (b.requestBudgetEur != null && b.total > b.requestBudgetEur) add('request_budget',`Order exceeds the requested budget of EUR ${b.requestBudgetEur}.`,'user');
  for (const gap of b.validationGaps ?? []) add('quantity_unknown',gap,'user');
  for (const l of b.lines.filter(l => l.qty > 0)) {
    const p = getProduct(l.sku), s = l.stock;
    if (!p) { add('unknown_product',`${l.name}: catalogue product missing.`,'catalogue',l.sku); continue; }
    if (!Number.isFinite(l.qty) || l.qty <= 0) add('quantity_invalid',`${l.name}: invalid quantity.`,'user',l.sku);
    if(l.quantityIssue)add('quantity_unknown',`${l.name}: ${l.quantityIssue}`,'catalogue',l.sku);
    const step = p.unit === 'KG' || s.salesUnit === 'KG' ? Math.max(0.5,p.lot ?? 0.5) : Math.max(1,p.lot ?? 1);
    if (Math.abs(l.qty / step - Math.round(l.qty / step)) > 1e-6) add('package_invalid',`${l.name}: quantity must follow sales lot ${step}.`,'catalogue',l.sku);
    if (!Number.isFinite(s.price) || s.price <= 0 || !Number.isFinite(s.priceWithTax) || s.priceWithTax <= 0 || !s.customerPrice) add('price_unverified',`${l.name}: customer-specific price is not verified.`,'mock_api',l.sku);
    if (!s.deliverable || s.cutoffPassed || !s.availableDate || s.availableDate > b.date || !s.closingTime || !Number.isFinite(Date.parse(s.closingTime))) add('delivery_unverified',`${l.name}: delivery and ordering cutoff are not verified.`,'mock_api',l.sku);
    if (s.available == null || !Number.isFinite(s.available)) add('stock_unknown',`${l.name}: Valio can't confirm stock for this quantity, so a person confirms it before the order is placed.`,'mock_api',l.sku);
    else if (s.available < l.qty) add('stock_short',`${l.name}: requested ${l.qty} sales units, only ${s.available} available.`,'mock_api',l.sku);
    if (m.allowedCategories.length && !m.allowedCategories.includes(p.cat)) add('category_forbidden',`${l.name}: category ${p.cat} is outside policy.`,'policy',l.sku);
    for (const a of forbidden) {
      if (p.contains.includes(a) || p.mayContain.includes(a)) add('allergen_forbidden',`${l.name}: contains or may contain restricted allergen ${a}. This cannot be approved.`,'catalogue',l.sku);
      else if (!p.freeFromAllergen?.includes(a)) add('allergen_unknown',`${l.name}: no explicit free-from evidence for ${a}; intervention required.`,'catalogue',l.sku);
    }
    const diets = l.requiredDiet ?? (b.intent === 'DIRECT_PURCHASE' ? b.requiredDiet ?? [] : b.dishes.find(d => d.id === l.dishId)?.diet ?? []);
    for(const [diet,claim] of [['vegan','VEGAN'],['vegetarian','VEGETARIAN'],['gluten-free','FREE_FROM_GLUTEN']]) {
      if(diets.includes(diet) && !p.claims.includes(claim) && !(diet==='vegetarian' && p.claims.includes('VEGAN')))add('diet_unverified',`${l.name}: ${diet} status is unverified.`,'catalogue',l.sku);
    }
    if(diets.includes('milk-free') && !p.freeFromAllergen?.includes('AM')) add('diet_unverified',`${l.name}: milk-free status is unverified.`,'catalogue',l.sku);
    if (diets.includes('lactose-free') && !p.claims.some(c => ['FREE_FROM_LACTOSE','LACTOSE_FREE'].includes(c)) && !p.freeFromAllergen?.includes('AM')) add('diet_unverified',`${l.name}: lactose-free status lacks authoritative evidence.`,'catalogue',l.sku);
    if (l.replaced) {
      if(!m.substitutionsPermitted)add("substitution_forbidden",`${l.name}: customer policy forbids substitutions.`,"policy",l.sku);
      const original = getProduct(l.replaced.sku);
      if (!m.autoSwapSameUse && l.issue?.decidedBy?.startsWith('gateway')) add('substitution_forbidden',`${l.name}: automatic substitutions are disabled.`,'policy',l.sku);
      if (!original || p.mayContain.some(a => !original.contains.includes(a) && !original.mayContain.includes(a))) add('substitution_unverified',`${l.name}: substitution introduces unverified allergen risk.`,'catalogue',l.sku);
    }
  }
  if (!b.lines.some(l => l.qty > 0)) add('empty_order','No purchasable products.','user');
  return checks;
}

export function orderRevision(b: Basket): string {
  return createHash('sha256').update(JSON.stringify({ customer:b.customer, date:b.date, delivery:b.delivery, budget:b.requestBudgetEur,
    constraints:[...(b.forbiddenAllergens ?? [])].sort(), total:b.total, totalWithVat:b.totalWithVat,
    lines:b.lines.filter(l=>l.qty>0).map(l=>[l.sku,l.qty,l.stock.price,l.stock.priceWithTax,l.total]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))) })).digest('hex');
}
