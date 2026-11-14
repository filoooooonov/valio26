import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { app } from "./app";
import { events, resetAudit } from "./audit";
import { getProduct, loadCatalog, type Size } from "./catalog";
import { comparisonShortlist } from "./comparison";
import { setLlm } from "./llm";
import { buildBasket } from "./plan";
import { setMandate } from "./policy";
import { resetStore } from "./store";
import { setFetcher } from "./valio";
import { orderRevision } from "./validation";

let ids: string[] = [],
  checked: string[][] = [];
const prices = new Map<string, number>(),
  amounts = new Map<string, number>();
let originals: { id: string; content: Size | undefined }[] = [];
const input = (qty = 1000) => ({
  request: `${qty} litres lactose-free milk`,
  date: "2026-11-16",
  customer: "compare",
});
const post = (path: string, body: object) =>
  app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeAll(() => {
  loadCatalog();
  process.env.VALIO_API_KEY ??= "test";
});
beforeEach(() => {
  resetStore();
  resetAudit();
  setLlm(null);
  prices.clear();
  amounts.clear();
  checked = [];
  setMandate("compare", {
    forbiddenAllergens: [],
    allowedCategories: [],
    allowedDeliveryWeekdays: [],
    requireApproval: false,
    maxOrderEur: 500,
    substitutionsPermitted: true,
  });
  ids = comparisonShortlist("lactose-free milk", ["lactose-free"])
    .ids.filter(
      (id) =>
        getProduct(id)?.content?.unit === "L" &&
        getProduct(id)?.content?.qty === 1,
    )
    .slice(0, 3);
  expect(ids).toHaveLength(3);
  ids.forEach((id, i) => {
    prices.set(id, [1.6, 1.5, 1.7][i]);
    amounts.set(id, 100000);
  });
  setFetcher((async (url: string, init: RequestInit) => {
    const skus = JSON.parse(String(init.body)).products as string[];
    if (String(url).endsWith("/price")) checked.push(skus);
    const products = skus.map((productId) =>
      String(url).endsWith("/price")
        ? {
            productId,
            netPriceFound: true,
            catalogPrice: {
              value: prices.get(productId) ?? 10,
              valueWithTax: (prices.get(productId) ?? 10) * 1.135,
            },
            comparisonPrice: { value: prices.get(productId) ?? 10 },
            comparisonUnit: "L",
            tax: { taxRate: 13.5 },
          }
        : {
            productId,
            closingTime: "2099-01-01T00:00:00Z",
            scheduleLines: amounts.has(productId)
              ? [
                  {
                    availableDate: "2026-11-16",
                    availableAmount: amounts.get(productId),
                    salesUnit: "ST",
                  },
                ]
              : [],
          },
    );
    return new Response(
      JSON.stringify({ products, timeNow: "2026-11-14T00:00:00Z" }),
    );
  }) as typeof fetch);
});
afterEach(() => {
  for (const p of originals) getProduct(p.id)!.content = p.content;
  originals = [];
  resetStore();
  setLlm(null);
});

test("quotes bounded real catalogue shortlist in one batch; selects lowest validated requested total", async () => {
  const b = await buildBasket(input());
  const c = b.lines[0].comparison!;
  expect(c.catalogueMatches).toBeGreaterThan(c.checkedCount);
  expect(c.checkedCount).toBeLessThanOrEqual(12);
  expect(checked).toHaveLength(1);
  expect(checked[0]).toHaveLength(c.checkedCount);
  expect(b.lines[0].sku).toBe(ids[1]);
  expect(b.total).toBe(1500);
  expect(
    c.candidates.find((c) => c.line.sku === ids[0])!.line.total - b.total,
  ).toBe(100);
  expect(c.candidates.find((c) => c.line.sku === ids[1])!.unitPrice).toBe(1.5);
  expect(
    c.candidates.every((c) => !/\b(sour|coffee|barista)\b/i.test(c.line.name)),
  ).toBe(true);
  expect(events(b.id).find((e) => e.kind === "comparison")!.summary).toContain(
    "prices were not checked for the whole store",
  );
});
test("unknown stock never beats verified fulfillment just because its quote is cheaper", async () => {
  prices.set(ids[0], 0.1);
  amounts.set(ids[0], 999999);
  const b = await buildBasket(input());
  expect(b.lines[0].sku).toBe(ids[1]);
  const unknown = b.lines[0].comparison!.candidates.find(
    (c) => c.line.sku === ids[0],
  )!;
  expect(unknown.status).toBe("review");
  expect(unknown.reasons.join(" ")).toContain("unknown");
});
test("package overbuy changes which product is cheapest for small versus large requests", async () => {
  const bulk = getProduct(ids[0])!;
  originals.push({ id: bulk.id, content: bulk.content });
  bulk.content = { qty: 10, unit: "L" };
  prices.set(ids[0], 10);
  prices.set(ids[1], 1.01);
  prices.set(ids[2], 2);
  const small = await buildBasket(input(21));
  expect(small.lines[0].sku).toBe(ids[1]);
  expect(small.total).toBe(21.21);
  const option = small.lines[0].comparison!.candidates.find(
    (c) => c.line.sku === ids[0],
  )!;
  expect(option.line.qty).toBe(3);
  expect(option.overbuy).toBe(9);
  expect(option.line.total).toBe(30);
  const large = await buildBasket(input(1000));
  expect(large.lines[0].sku).toBe(ids[0]);
  expect(large.total).toBe(1000);
});
test("selecting an alternative updates the same cart line, revision and audit; undo restores it", async () => {
  const b = await buildBasket(input());
  const revision = orderRevision(b),
    lineId = b.lines[0].id;
  const r = await post(`/api/basket/${b.id}/lines/${lineId}`, {
    selectCandidate: ids[0],
    by: "Anna K.",
  });
  expect(r.status).toBe(200);
  const changed = await r.json();
  expect(changed.lines).toHaveLength(1);
  expect(changed.lines[0].id).toBe(lineId);
  expect(changed.lines[0].sku).toBe(ids[0]);
  expect(changed.total).toBe(1600);
  expect(orderRevision(changed)).not.toBe(revision);
  expect(events(b.id).some((e) => e.kind === "comparison_choice")).toBe(true);
  const undo = await (await post(`/api/basket/${b.id}/undo`, {})).json();
  expect(undo.basket.lines[0].sku).toBe(ids[1]);
});
test("quantity edits recalculate all quoted package totals and reject unquoted/policy-excluded selections", async () => {
  const b = await buildBasket(input(20));
  const url = `/api/basket/${b.id}/lines/${b.lines[0].id}`;
  const changed = await (await post(url, { qty: 1000 })).json();
  expect(changed.lines[0].comparison.requested.qty).toBe(1000);
  expect(
    (events(b.id).find((e) => e.kind === "comparison")!.data as any).requested
      .qty,
  ).toBe(20);
  expect(
    changed.lines[0].comparison.candidates.find(
      (c: any) => c.line.sku === ids[0],
    ).line.total,
  ).toBe(1600);
  expect((await post(url, { selectCandidate: "invented-sku" })).status).toBe(
    400,
  );
  setMandate("compare", { forbiddenAllergens: ["milk"] });
  expect((await post(url, { selectCandidate: ids[0] })).status).toBe(400);
});
test("restricted/unknown allergen evidence excludes candidates; unavailable items keep rejection reasons", async () => {
  const b = await buildBasket({ ...input(), forbiddenAllergens: ["milk"] });
  expect(b.lines[0].comparison!.candidates.every((c) => !c.selectable)).toBe(
    true,
  );
  const fresh = await buildBasket(input());
  const unavailable = fresh.lines[0].comparison!.candidates.find(
    (c) => !amounts.has(c.line.sku),
  )!;
  expect(unavailable.status).toBe("excluded");
  expect(unavailable.reasons.join(" ")).toContain("delivery");
});
test("menu and multi-product requests remain compact without a comparison on every ingredient", async () => {
  const menu = await buildBasket({
    request: "Catering for 50 people",
    date: "2026-11-20",
    customer: "compare",
  });
  expect(menu.lines.every((l) => !l.comparison)).toBe(true);
  const multiple = await buildBasket({
    ...input(20),
    items: [
      { query: "lactose-free milk", quantity: 20, unit: "l" },
      { query: "rice", quantity: 5, unit: "kg" },
    ],
  });
  expect(multiple.lines.every((l) => !l.comparison)).toBe(true);
});

test("compared product choices remain locked once the exact order is awaiting approval", async () => {
  const b = await buildBasket(input());
  const sent = await post(`/api/basket/${b.id}/order`, { by: "Anna K." });
  expect(sent.status).toBe(202);
  const change = await post(`/api/basket/${b.id}/lines/${b.lines[0].id}`, {
    selectCandidate: ids[0],
  });
  expect(change.status).toBe(409);
});

test("unverified weight-to-volume conversion never gets a misleading per-litre comparison",async()=>{
  const p=getProduct(ids[0])!;originals.push({id:p.id,content:p.content});p.content={qty:1,unit:"KG"};
  const b=await buildBasket(input(20));const c=b.lines[0].comparison!.candidates.find(c=>c.line.sku===ids[0])!;
  expect(c.status).toBe("excluded");expect(c.unitPrice).toBeNull();expect(c.overbuy).toBeNull();expect(c.purchased).toBeNull();
});
