import { beforeEach, expect, test } from "bun:test";
import { app } from "./app";
import { events, resetAudit } from "./audit";
import { editCartLine, undoCartLine } from "./cartHistory";
import { editLine, recompute, type Basket, type BasketLine } from "./plan";
import type { Order } from "./orders";
import { getMandate } from "./policy";
import { baskets, orders, resetStore } from "./store";

function fixture() {
  const line: BasketLine = {
    id: "line", dishId: null, needIds: [], sku: "test-cart", name: "Test product", brand: "", qty: 3,
    pack: "1 kg", why: "Requested product", total: 30, contains: [], claims: [],
    stock: { sku: "test-cart", price: 10, priceWithTax: 11.35, taxRate: 13.5, customerPrice: true,
      available: 100, deliverable: true, cutoffPassed: false, salesUnit: "ST" },
  };
  const basket: Basket = {
    id: "cart-history", customer: "demo", request: "Test cart", people: 50, date: "2099-11-20", planner: "fallback",
    dishes: [], lines: [line], assumed: [], notes: [], checkedAt: new Date().toISOString(), apiCalls: 0,
    total: 30, totalWithVat: 34.05, openIssues: 0, totalIfAccepted: 30, pricesHeldUntil: null,
    rules: getMandate("demo"), mandate: { state: "agent_may_order", reasons: [] }, createdAt: new Date().toISOString(),
  };
  baskets.set(basket.id, basket);
  return recompute(basket);
}
const post = (path: string, body: object = {}) => app.request(path, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => { resetStore(); resetAudit(); });

test("uncheck keeps the original quantity on the server, reload retains it, recheck restores it", async () => {
  const b = fixture();
  const response = await post(`/api/basket/${b.id}/lines/line`, { included: false });
  expect(response.status).toBe(200);
  const unchecked = await response.json();
  expect(unchecked.lines).toHaveLength(1);
  expect(unchecked.lines[0]).toMatchObject({ qty: 0, excludedQty: 3, total: 0 });
  expect(unchecked.total).toBe(0);
  const reloaded = await (await app.request(`/api/basket/${b.id}`)).json();
  expect(reloaded.lines[0].excludedQty).toBe(3);
  const included = await (await post(`/api/basket/${b.id}/lines/line`, { included: true })).json();
  expect(included.lines[0].qty).toBe(3);
  expect(included.lines[0].excludedQty).toBeUndefined();
  expect(included.total).toBe(30);
});

test("explicit removal differs from exclusion and multiple undo steps restore both exactly", async () => {
  const b = fixture();
  const original = structuredClone(b.lines[0]);
  editCartLine(b.id, "line", { included: false });
  editCartLine(b.id, "line", { qty: 0 });
  expect(b.lines[0].excludedQty).toBeUndefined();
  let reply = await post(`/api/basket/${b.id}/undo`, { by: "Anna K." });
  expect(reply.status).toBe(200);
  expect((await reply.json()).basket.lines[0]).toMatchObject({ qty: 0, excludedQty: 3 });
  reply = await post(`/api/basket/${b.id}/undo`);
  const restored = await reply.json();
  expect(restored.basket.lines[0]).toEqual(original);
  expect(restored.basket.total).toBe(30);
  expect(restored.basket.totalWithVat).toBe(34.05);
  expect(restored.canUndo).toBe(false);
  expect(events(b.id).filter(e => e.kind === "undo")).toHaveLength(2);
  expect((await post(`/api/basket/${b.id}/undo`)).status).toBe(409);
});

test("undo replacement restores original product and unresolved issue, preserving approval requirements", () => {
  const b = fixture();
  b.lines[0].issue = { kind: "unavailable", text: "Unavailable", options: [{
    sku: "replacement", name: "Replacement", qty: 2, pack: "1 kg", total: 20, why: "Same use",
    reason: "In stock", delta: -10, contains: [], stock: { ...b.lines[0].stock, sku: "replacement" },
  }] };
  recompute(b);
  const original = structuredClone(b.lines[0]);
  editCartLine(b.id, "line", { chooseOption: "replacement" });
  expect(b.lines[0].sku).toBe("replacement");
  expect(b.openIssues).toBe(0);
  undoCartLine(b.id);
  expect(b.lines[0]).toEqual(original);
  expect(b.openIssues).toBe(1);
  expect(b.mandate.state).toBe("needs_your_ok");
});

test("undo rejects stale history and never overwrites subsequent changes", async () => {
  const b = fixture();
  editCartLine(b.id, "line", { qty: 2 });
  editLine(b.id, "line", { qty: 7 }); // Another client/action outside the web history.
  const response = await post(`/api/basket/${b.id}/undo`);
  expect(response.status).toBe(409);
  expect(b.lines[0].qty).toBe(7);
  expect((await post("/api/basket/missing/undo")).status).toBe(404);
});

test.each(["pending_approval", "placed"] as const)("undo cannot change a %s order", async status => {
  const b = fixture();
  editCartLine(b.id, "line", { qty: 2 });
  orders.set("locked", { id: "locked", basketId: b.id, status } as Order);
  expect((await post(`/api/basket/${b.id}/undo`)).status).toBe(409);
  expect((await post(`/api/basket/${b.id}/lines/line`, { included: false })).status).toBe(409);
  expect(b.lines[0].qty).toBe(2);
  orders.get("locked")!.status = "rejected";
  expect((await post(`/api/basket/${b.id}/undo`)).status).toBe(200);
  expect(b.lines[0].qty).toBe(3);
});

test("invalid inclusion and quantity edits cannot create undo history", async () => {
  const b = fixture();
  for (const body of [{ included: "no" }, { included: false, qty: 2 }, { qty: -1 }])
    expect((await post(`/api/basket/${b.id}/lines/line`, body)).status).toBe(400);
  expect(b.lines[0].qty).toBe(3);
  expect(b.lines[0].excludedQty).toBeUndefined();
  expect((await post(`/api/basket/${b.id}/undo`)).status).toBe(409);
});

test("undo history is limited to the 30 most recent changes", () => {
  const b = fixture();
  for (let qty = 4; qty < 36; qty++) editCartLine(b.id, "line", { qty });
  for (let step = 0; step < 30; step++) undoCartLine(b.id);
  expect(b.lines[0].qty).toBe(5);
  expect(() => undoCartLine(b.id)).toThrow("No cart changes to undo");
});
