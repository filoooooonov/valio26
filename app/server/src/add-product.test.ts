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
afterEach(() => { setLlm(null); resetStore(); });
function fakeValio() {
  setFetcher((async (url: string, init: RequestInit) => {
    const { products: ids } = JSON.parse(init.body as string);
    const products = ids.map((productId: string) => String(url).endsWith("/price")
      ? { productId, netPriceFound: true, error: false, catalogPrice: { value: 2, valueWithTax: 2.27, validTo: "2026-12-31" }, comparisonPrice: { value: 2 }, comparisonUnit: "L", tax: { taxRate: 13.5 } }
      : { productId, salesBlock: false, logisticModel: "Stock", closingTime: "2099-01-01T12:00:00+0200", scheduleLines: [{ salesBlock: false, availableAmount: 999, availableDate: "2026-11-16", salesUnit: "ST" }] });
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
});
