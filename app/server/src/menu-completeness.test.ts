import { afterEach, beforeAll, expect, test } from "bun:test";
import { buildBasket, draftCompletenessIssues } from "./plan";
import { loadCatalog } from "./catalog";
import { setLlm, type Draft, type Llm } from "./llm";
import { setFetcher } from "./valio";
import { resetStore } from "./store";

const dishes: Draft['dishes'] = [
 { id: 'croissants', name: 'Filled croissants', portions: 50, basis: 'one each', diet: [] },
 { id: 'drinks', name: 'Soft drinks', portions: 50, basis: '250 ml each', diet: [] },
 { id: 'snacks', name: 'Chips and candies', portions: 50, basis: '50 g each', diet: [] },
];
const need = (id: string, dishId: string, item: string, totalUnit: 'kg' | 'l' | 'pcs'): Draft['needs'][number] => ({ id, dishId, item, queries: [item], totalQty: 2, totalUnit, perPortion: null, perPortionUnit: null, diet: [] });
const full: Draft = { people: 50, dishes, assumed: [], needs: [need('pastry', 'croissants', 'croissant', 'kg'), need('cola', 'drinks', 'cola', 'l'), need('chips', 'snacks', 'potato chips', 'kg')] };
const partial: Draft = { ...full, needs: full.needs.slice(0, 1) };
beforeAll(() => { loadCatalog(); process.env.VALIO_API_KEY ??= 'test'; });
afterEach(() => { setLlm(null); resetStore(); });
function fakeValio(onCall: () => void) {
 setFetcher((async (url: string, init: RequestInit) => {
  onCall(); const {products: ids} = JSON.parse(init.body as string);
  const products = ids.map((productId: string) => String(url).endsWith('/price') ? { productId, netPriceFound: true, error: false, catalogPrice: {value: 10, valueWithTax: 11.35, validTo: '2026-12-31'}, comparisonPrice: {value: 10}, comparisonUnit: 'KG', tax: {taxRate: 13.5} } : {productId, salesBlock: false, logisticModel: 'Stock', closingTime: '2099-01-01T12:00:00+0200', scheduleLines: [{salesBlock: false, availableAmount: 999999, availableDate: '2026-11-16', salesUnit: 'ST'}]});
  return new Response(JSON.stringify({products, timeNow: new Date().toISOString()}));
 }) as typeof fetch);
}
test('three menu dishes with only one need retry before Valio and preserve all three repaired needs', async () => {
 let drafts = 0, calls = 0, repairRequest = '';
 fakeValio(() => { expect(drafts).toBe(2); calls++; });
 const llm: Llm = { draft: async request => { drafts++; if (drafts === 1) return partial; expect(calls).toBe(0); repairRequest = request; return full; }, pick: async (_request, needs) => ({picks: needs.map(n => ({needId: n.id, ranked: n.candidates.map(c => c.id)}))}) };
 setLlm(llm);
 const result = await buildBasket({request: 'APPROVED MENU ONLY: Filled croissants, Soft drinks, Chips and candies', date: '2026-11-20'});
 expect(drafts).toBe(2); expect(repairRequest).toContain('Soft drinks'); expect(repairRequest).toContain('Chips and candies'); expect(result.planner).toBe('llm'); expect(result.dishes).toHaveLength(3);
 for (const n of full.needs) expect(result.lines.some(l => l.needIds.includes(n.id))).toBe(true);
 expect(calls).toBeGreaterThan(0);
});
test('twice incomplete plan fails clearly without any Valio calls or SKU picking', async () => {
 let drafts = 0, calls = 0, picks = 0; fakeValio(() => { calls++; });
 setLlm({draft: async () => { drafts++; return partial; }, pick: async () => { picks++; return {picks: []}; }});
 await expect(buildBasket({request: 'APPROVED MENU ONLY: Filled croissants, Soft drinks, Chips and candies', date: '2026-11-20'})).rejects.toThrow('Could not complete the approved menu after one retry');
 expect(drafts).toBe(2); expect(calls).toBe(0); expect(picks).toBe(0);
});
test('positive needs must reference real dishes; plain product orders need no dish', () => {
 expect(draftCompletenessIssues({...full, needs: [{...full.needs[0], dishId: 'missing'}]}).join(' ')).toContain('valid dish');
 expect(draftCompletenessIssues({people: 1, dishes: [], assumed: [], needs: [{...full.needs[0], dishId: null}]})).toEqual([]);
 expect(draftCompletenessIssues({...full, needs: full.needs.map(n => ({...n, totalQty: 0}))}).join(' ')).toContain('positive');
});
