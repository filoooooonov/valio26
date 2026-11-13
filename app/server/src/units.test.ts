import { describe, expect, test } from "bun:test";
import { parseSize } from "./catalog";
import { checkStock, contentPerUnit, setFetcher, toLine } from "./valio";

describe("parseSize", () => {
  test.each([
    ["Valio Play® milk chocolate drink 1 l lactose free", { qty: 1, unit: "L" }],
    ["Forssan Potato Salad 400g", { qty: 0.4, unit: "KG" }],
    ["Salmon fillet 2,5 kg", { qty: 2.5, unit: "KG" }],
    ["Rye rolls 60 pcs", { qty: 60, unit: "PCS" }],
    ["Juice 12 x 0,2 l", { qty: 2.4, unit: "L" }],
  ])("%s", (name, want) => expect(parseSize(name)).toEqual(want as any));
  test("no size", () => expect(parseSize("Leek")).toBeNull());
});

const NOW = Date.parse("2026-11-14T00:38:52+0200");
const price = (id: string, v: number, cmp?: number) => ({
  productId: id, quantity: 1, netPriceFound: true, error: false,
  catalogPrice: { value: v, valueWithTax: v * 1.135, validTo: "2026-12-31" },
  comparisonPrice: cmp ? { value: cmp } : null, comparisonUnit: cmp ? "L" : null, tax: { taxRate: 13.5 },
});

describe("toLine", () => {
  test("Stock with real quantity, cut-off still open", () => {
    const l = toLine({ productId: "1", closingTime: "2026-11-15T17:00:00+0200", salesBlock: false, logisticModel: "Stock",
      scheduleLines: [{ salesBlock: false, availableAmount: 51, availableDate: "2026-11-16", salesUnit: "ST" }] }, price("1", 1.01, 1.01), "2026-11-20", NOW);
    expect(l).toMatchObject({ available: 51, deliverable: true, cutoffPassed: false, price: 1.01, taxRate: 13.5 });
  });
  test("Terminal 999999 = unknown, passed cut-off flagged", () => {
    const l = toLine({ productId: "2", closingTime: "2026-11-12T15:00:00+0200", salesBlock: false, logisticModel: "Terminal",
      scheduleLines: [{ salesBlock: false, availableAmount: 999999, availableDate: "2026-11-16", salesUnit: "KI" }] }, price("2", 31.31, 1.57), "2026-11-20", NOW);
    expect(l.available).toBeNull();
    expect(l.cutoffPassed).toBe(true);
    expect(contentPerUnit(l)).toEqual({ qty: 19.943, unit: "L" });
  });
  test("no schedule line by the date = not deliverable", () => {
    const l = toLine({ productId: "3", salesBlock: false, scheduleLines: [{ salesBlock: false, availableAmount: 10, availableDate: "2026-11-25", salesUnit: "ST" }] }, price("3", 2), "2026-11-20", NOW);
    expect(l.deliverable).toBe(false);
  });
});

test("checkStock: one price + one availability call for the whole shortlist, then cached", async () => {
  process.env.VALIO_API_KEY ??= "test";
  const seen: string[] = [];
  setFetcher((async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    seen.push(`${url.split("/api/")[1]}:${body.products.length}`);
    const data = url.endsWith("price")
      ? { products: body.products.map((id: string) => price(id, 2)) }
      : { timeNow: "2026-11-14T00:00:00+0200", products: body.products.map((id: string) => ({ productId: id, salesBlock: false, closingTime: "2026-11-19T12:00:00+0200",
          scheduleLines: [{ salesBlock: false, availableAmount: 5, availableDate: "2026-11-19", salesUnit: "ST" }] })) };
    return new Response(JSON.stringify(data));
  }) as any);
  const a = await checkStock(["a", "b", "c", "a"], "2026-11-20");
  expect(a.skus).toBe(3);
  expect(a.calls).toBe(2);
  expect(seen.sort()).toEqual(["availability:3", "price:3"]);
  const b = await checkStock(["a", "b"], "2026-11-20");
  expect(b.calls).toBe(0);
});
