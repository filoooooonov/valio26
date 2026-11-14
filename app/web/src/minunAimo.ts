import type { Basket } from './api';

// Synthetic restaurant reports for this demo. No Minun Aimo account is connected.
export const sampleRestaurant = {
  name: 'Bistro Kallio',
  source: 'Sample Minun Aimo data',
  packagePriceExVat: 12.5,
  historicalFoodCostPerGuest: 4.6,
  targetFoodCostRatio: .3,
  monthly: { revenue: 48000, ingredients: 16800, labour: 18000, otherOperatingCosts: 8400 },
};
export const SAMPLE_CONTEXT_MARKER = 'MINUN AIMO SAMPLE CONTEXT';
export const targetFoodCostPerGuest = () => sampleRestaurant.packagePriceExVat * sampleRestaurant.targetFoodCostRatio;
export function samplePlanningContext() {
  return `\n\n${SAMPLE_CONTEXT_MARKER}: Synthetic Bistro Kallio reports, not a live account connection. The approved event package sells for EUR ${sampleRestaurant.packagePriceExVat.toFixed(2)} per guest excluding VAT. Target ingredient cost is ${Math.round(sampleRestaurant.targetFoodCostRatio * 100)}%, or EUR ${targetFoodCostPerGuest().toFixed(2)} per guest. Historical ingredient cost is EUR ${sampleRestaurant.historicalFoodCostPerGuest.toFixed(2)} per guest. Preserve the buyer's approved menu and dietary requirements. Consider economical pack sizes and usable yield, without changing the menu or inventing product prices. Actual prices and availability must come from the gateway. The target is a planning preference, not a guarantee. Do not add products solely because they appear in this sample context.`;
}
export function basketEconomics(basket: Basket) {
  const total = basket.openIssues ? basket.totalIfAccepted : basket.total;
  const perGuest = total / Math.max(1, basket.people);
  return { total, perGuest, foodCostRatio: perGuest / sampleRestaurant.packagePriceExVat, target: targetFoodCostPerGuest(), provisional: basket.openIssues > 0 };
}
export function verifiedSaving(basket: Basket) {
  const choices = basket.lines.flatMap(line => (line.issue?.options ?? []).filter(option =>
    line.qty > 0 && option.sku !== line.sku && option.stock.deliverable && !option.stock.cutoffPassed &&
    (option.stock.available == null || option.stock.available >= option.qty) &&
    option.contains.every(allergen => line.contains.includes(allergen)) && option.total < line.total
  ).map(option => ({ lineId: line.id, current: line.name, option, saving: Math.round((line.total - option.total) * 100) / 100, includedInEstimate: !!line.issue && !line.issue.decided && line.issue.options[0]?.sku === option.sku })));
  return choices.sort((a, b) => b.saving - a.saving)[0] ?? null;
}
