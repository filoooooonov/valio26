import { afterEach, beforeAll, expect, test } from 'bun:test';
import { buildBasket, editLine, isFrozenProduct } from './plan';
import { getProduct, loadCatalog, search } from './catalog';
import { setLlm } from './llm';
import { resetStore } from './store';
import { setFetcher } from './valio';
beforeAll(() => { loadCatalog(); process.env.VALIO_API_KEY ??= 'test'; });
afterEach(() => { setLlm(null); resetStore(); });
test('freezer labels and explicit frozen names exclude fresh foods and utensils; ambiguous storage stays unmarked', () => {
 const p = (en: string, labels: string[] = []) => ({en, fi: '', sv: '', labels});
 expect(isFrozenProduct(p('BRIDOR225X25G FINE BUTTER CROISSANT FRO'))).toBe(true);
 expect(isFrozenProduct(p('Croissant', ['freezeTemperature']))).toBe(true);
 expect(isFrozenProduct(p('Deepfrost vegetables'))).toBe(true);
 expect(isFrozenProduct(p('Fresh milk', ['coolTemperature']))).toBe(false);
 expect(isFrozenProduct(p('Ice cream scoop'))).toBe(false);
 expect(isFrozenProduct(p('RF Blueberry cake', ['warmTemperature', 'freezeTemperature']))).toBe(false);
 expect(isFrozenProduct(p('Frozen pastry', ['coolTemperature', 'freezeTemperature']))).toBe(false);
});
test('line metadata and chosen-option changes follow the selected catalogue SKU', async () => {
 setLlm(null);
 setFetcher((async (url: string, init: RequestInit) => {
 const ids = JSON.parse(init.body as string).products;
 const products = ids.map((productId: string) => String(url).endsWith('/price') ? {productId, netPriceFound: true, error: false, catalogPrice: {value: 1, valueWithTax: 1.135, validTo: '2026-12-31'}, comparisonPrice: {value: 1}, comparisonUnit: 'L', tax: {taxRate: 13.5}} : {productId, salesBlock: false, logisticModel: 'Stock', closingTime: '2099-01-01T12:00:00+0200', scheduleLines: [{salesBlock: false, availableAmount: 999999, availableDate: '2026-11-16', salesUnit: 'ST'}]});
 return new Response(JSON.stringify({products, timeNow: new Date().toISOString()}));
 }) as typeof fetch);
 const b = await buildBasket({request: '10 L lactose-free milk', date: '2026-11-20'});
 const line = b.lines[0]; expect(line.frozen).toBe(false);
 const cold = search('croissant', {limit: 50}).map(x => getProduct(x.id)!).find(p => isFrozenProduct(p)); expect(cold).toBeDefined();
 const base = {sku: line.sku, name: line.name, reason: 'test', delta: 0, qty: line.qty, pack: line.pack, why: line.why, total: line.total, stock: line.stock, contains: line.contains, frozen: false};
 line.issue = {kind: 'unavailable', text: 'test explicit choice', options: [{...base, sku: cold!.id, name: cold!.en, frozen: true}, base]};
 const frozen = editLine(b.id, line.id, {chooseOption: cold!.id, by: 'buyer'}); expect(frozen.lines[0].sku).toBe(cold!.id); expect(frozen.lines[0].frozen).toBe(true);
 const fresh = editLine(b.id, line.id, {chooseOption: base.sku, by: 'buyer'}); expect(fresh.lines[0].frozen).toBe(false);
});
