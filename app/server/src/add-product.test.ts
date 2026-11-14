import { afterEach, beforeAll, expect, test } from "bun:test";
import { buildBasket, caseSize } from "./plan";
import { getProduct } from "./catalog";
import { chat } from "./chat";
import { loadCatalog } from "./catalog";
import { setLlm } from "./llm";
import { setFetcher } from "./valio";
import { resetStore } from "./store";
import { events } from "./audit";

beforeAll(() => { loadCatalog(); process.env.VALIO_API_KEY ??= "test"; });
afterEach(() => { setLlm(null); resetStore(); blocked.clear(); blockNextFirst = 0; });
// SKUs listed here come back with no delivery date (unavailable for the requested day).
const blocked = new Set<string>();
let blockNextFirst = 0; // block the first N SKUs of the next availability calls (= the best-ranked matches)
function fakeValio() {
  setFetcher((async (url: string, init: RequestInit) => {
    const { products: ids } = JSON.parse(init.body as string);
    if (!String(url).endsWith("/price") && blockNextFirst > 0) for (const s of ids) if (blockNextFirst-- > 0) blocked.add(s);
    const products = ids.map((productId: string) => String(url).endsWith("/price")
      ? { productId, netPriceFound: true, error: false, catalogPrice: { value: 2, valueWithTax: 2.27, validTo: "2026-12-31" }, comparisonPrice: { value: 2 }, comparisonUnit: "L", tax: { taxRate: 13.5 } }
      : { productId, salesBlock: false, logisticModel: "Stock", closingTime: "2099-01-01T12:00:00+0200", scheduleLines: blocked.has(productId) ? [] : [{ salesBlock: false, availableAmount: 999, availableDate: "2026-11-16", salesUnit: "ST" }] });
    return new Response(JSON.stringify({ products, timeNow: new Date().toISOString() }));
  }) as typeof fetch);
}

test("chat 'add 2 bottles of Pepsi as a drink' adds one line under a new Drinks category", async () => {
  setLlm(null); fakeValio();
  const b = await buildBasket({ request: "salmon soup for 20", people: 20, date: "2026-11-20" });
  const before = b.lines.length;
  const r = await chat(b.id, "add 2 bottles of Pepsi as a drink");
  expect(r.actions[0].kind).toBe("add_product");
  const line = r.basket.lines.find((l) => l.id === r.actions[0].lineId)!;
  expect(r.basket.lines.length).toBe(before + 1);
  expect(line.name).toMatch(/pepsi/i);
  expect(line.qty).toBe(Math.ceil(2 / caseSize(getProduct(line.sku))));
  const drinks = r.basket.dishes.find((d) => d.id === line.dishId)!;
  expect(drinks.name).toBe("Drinks");
  expect(r.reply).toContain("new Drinks category");
  const ev = events(b.id).filter((e) => e.kind === "chat" && e.actor === "assistant").at(-1)!;
  expect((ev.data as { added: { lineId: string }[] }).added[0].lineId).toBe(line.id);

  // A second drink goes into the existing Drinks category instead of a new one.
  const r2 = await chat(b.id, "add 3 bottles of orange juice");
  const l2 = r2.basket.lines.find((l) => l.id === r2.actions[0].lineId)!;
  expect(l2.dishId).toBe(drinks.id);
  expect(r2.basket.dishes.filter((d) => d.name === "Drinks")).toHaveLength(1);
});

test("caseSize reads multi-pack names", () => {
  expect(caseSize({ en: "12 x Pepsi soft drink 1,5 l" } as any)).toBe(12);
  expect(caseSize({ en: "6xVilarnau 75cl White" } as any)).toBe(6);
  expect(caseSize({ en: "Valio butter 500 g" } as any)).toBe(1);
  expect(caseSize({ en: "2 kg potatoes" } as any)).toBe(1);
  expect(caseSize({ en: "4 x 6 x Pepsi soft drink 0,33 l" } as any)).toBe(24);
  expect(caseSize({ en: "Fazer Kiireetön Sourdough bread 9 x 370g, pre-baked frozen" } as any)).toBe(9);
});

test("unavailable best match: says so and adds a deliverable alternative without asking", async () => {
  setLlm(null); fakeValio();
  const b = await buildBasket({ request: "salmon soup for 20", people: 20, date: "2026-11-20" });
  blockNextFirst = 1; // the best-ranked Pepsi can't be delivered
  const r = await chat(b.id, "add 2 bottles of Pepsi as a drink");
  const line = r.basket.lines.find((l) => l.id === r.actions[0]?.lineId)!;
  expect(r.reply).toMatch(/is unavailable for Fri, 20 Nov \(no delivery that day\), so I added .+ instead/);
  expect(blocked.has(line.sku)).toBe(false);
  expect(line.stock.deliverable).toBe(true);
  expect(line.issue).toBeUndefined();
});

test("nothing deliverable: adds nothing and says why", async () => {
  setLlm(null); fakeValio();
  const b = await buildBasket({ request: "salmon soup for 20", people: 20, date: "2026-11-20" });
  const before = b.lines.length;
  blockNextFirst = 1000; // every Pepsi candidate, including the wider search
  const r = await chat(b.id, "add 2 bottles of Pepsi as a drink");
  expect(r.actions).toHaveLength(0);
  expect(r.basket.lines.length).toBe(before);
  expect(r.reply).toMatch(/is unavailable for Fri, 20 Nov .*so I didn't add anything/);
});

test("'add a bottle of pepsi' on a removed, undeliverable Pepsi line finds a deliverable alternative instead", async () => {
  setLlm(null); fakeValio();
  const b = await buildBasket({ request: "salmon soup for 20", people: 20, date: "2026-11-20" });
  const first = await chat(b.id, "add 2 bottles of Pepsi as a drink");
  const dead = first.basket.lines.find((l) => l.id === first.actions[0].lineId)!;
  // Same state as the screenshot: cut-off passed, buyer removed it.
  blocked.add(dead.sku);
  Object.assign(dead, { qty: 0, total: 0, stock: { ...dead.stock, deliverable: false, status: "cutoff_passed" } });
  dead.issue = { kind: "cutoff", text: "Ordering is closed.", options: [], decided: "remove", decidedBy: "Anna K." };
  fakeValio(); // fresh stock cache: the blocked SKU now reads as undeliverable
  setLlm({
    draft: async () => { throw new Error("unused"); },
    pick: async (_r, needs) => ({ picks: needs.map((n) => ({ needId: n.id, ranked: n.candidates.map((c) => c.id) })) }),
    chat: async (_t, summary) => {
      expect(summary).toContain("CAN'T BE DELIVERED");
      return { actions: [{ kind: "set_qty", lineId: dead.id, qty: 1, people: null, option: null, change: null, product: null, queries: null, amount: null, unit: null, label: null, dishId: null, category: null }], question: null };
    },
  });
  const r = await chat(b.id, "add a bottle of pepsi");
  const added = r.basket.lines.find((l) => l.id === r.actions[0].lineId)!;
  expect(r.actions[0].kind).toBe("add_product");
  expect(added.id).not.toBe(dead.id);
  expect(added.sku).not.toBe(dead.sku);
  expect(added.stock.deliverable).toBe(true);
  expect(r.basket.lines.find((l) => l.id === dead.id)!.qty).toBe(0);
  expect(r.reply).toMatch(/can't be delivered for Fri, 20 Nov, so I added .+ instead/);
});
