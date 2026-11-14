import { beforeAll, beforeEach, expect, setSystemTime, test } from "bun:test";
import { loadCatalog, getProduct } from "./catalog";
import { CREAM_A, CREAM_B, CREAM_C } from "./history";
import { editCartLine, undoCartLine } from "./cartHistory";
import { recompute, type Basket, type BasketLine, type Option } from "./plan";
import { getMandate, resetMandates, resetPermissions } from "./policy";
import { acceptedCount, preferenceEvents } from "./preferences";
import { baskets, resetStore } from "./store";

beforeAll(() => loadCatalog());
beforeEach(() => { resetStore(); resetMandates(); resetPermissions(); });

// Real catalogue creams, synthetic stock facts. No sponsor calls or persistent demo data.
function fixture() {
  const stock = { sku: CREAM_A, price: 2, priceWithTax: 2.27, taxRate: 13.5,
    customerPrice: true, available: 100, availableDate: "2026-11-16",
    closingTime: "2099-01-01T00:00:00Z", deliverable: true, cutoffPassed: false, salesUnit: "ST" };
  const option = (sku: string): Option => ({ sku, name: getProduct(sku)!.en, qty: 20,
    pack: "1 l", total: 40, why: "Synthetic verified fixture", reason: "Same use", delta: 0,
    contains: getProduct(sku)!.contains, stock: { ...stock, sku } });
  const line: BasketLine = { id: "cream", dishId: null, needIds: [], sku: CREAM_A,
    name: getProduct(CREAM_A)!.en, brand: "Valio", qty: 2, pack: "10 l", why: "Usual cream",
    total: 4, contains: getProduct(CREAM_A)!.contains, claims: [], stock,
    issue: { kind: "unavailable", text: "Synthetic exception", options: [option(CREAM_B), option(CREAM_C)] } };
  const b: Basket = { id: "choice-memory", customer: "123", request: "Usual order", people: 0,
    date: "2026-11-16", planner: "fallback", intent: "REORDER", dishes: [], lines: [line],
    assumed: [], notes: [], checkedAt: "2026-11-14T12:00:00Z", apiCalls: 0, total: 4,
    totalWithVat: 4.54, openIssues: 1, totalIfAccepted: 40, pricesHeldUntil: null,
    rules: getMandate("123"), mandate: { state: "needs_your_ok", reasons: [] }, createdAt: "2026-11-14T12:00:00Z" };
  baskets.set(b.id, b);
  return recompute(b);
}
const memory = (b: Basket) => preferenceEvents(b.customer).filter(e => e.basketId === b.id);

test("repeating a substitution request learns one decision and preserves a later quantity edit", () => {
  const b = fixture(), policy = getMandate(b.customer);
  editCartLine(b.id, "cream", { chooseOption: CREAM_B });
  editCartLine(b.id, "cream", { qty: 25 });
  editCartLine(b.id, "cream", { chooseOption: CREAM_B });
  expect(acceptedCount(b.customer, CREAM_A, CREAM_B)).toBe(4);
  expect(memory(b)).toHaveLength(1);
  expect(b.lines[0].qty).toBe(25);
  expect(getMandate(b.customer)).toEqual(policy);
});

test("changing and undoing a choice restores effective preference evidence", () => {
  const b = fixture();
  editCartLine(b.id, "cream", { chooseOption: CREAM_B });
  const before = structuredClone(memory(b));
  editCartLine(b.id, "cream", { chooseOption: CREAM_C });
  expect(acceptedCount(b.customer, CREAM_A, CREAM_B)).toBe(3);
  expect(memory(b).filter(e => e.kind === "substitution_accepted").map(e => e.sku)).toEqual([CREAM_C]);
  undoCartLine(b.id);
  expect(b.lines[0].sku).toBe(CREAM_B);
  expect(memory(b)).toEqual(before);
  undoCartLine(b.id);
  expect(b.lines[0].sku).toBe(CREAM_A);
  expect(memory(b)).toEqual([]);
  expect(acceptedCount(b.customer, CREAM_A, CREAM_B)).toBe(3);
});

test("undoing one line preserves another line's choice even in the same clock tick", () => {
  const b = fixture();
  b.lines.push({ ...structuredClone(b.lines[0]), id: "second-cream" });
  recompute(b);
  setSystemTime(new Date("2026-11-14T12:00:00Z"));
  try {
    editCartLine(b.id, "cream", { chooseOption: CREAM_B });
    editCartLine(b.id, "second-cream", { chooseOption: CREAM_C });
    undoCartLine(b.id);
    expect(memory(b).filter(e => e.kind === "substitution_accepted").map(e => e.sku)).toEqual([CREAM_B]);
    expect(b.lines[0].sku).toBe(CREAM_B);
    expect(b.lines[1].sku).toBe(CREAM_A);
  } finally { setSystemTime(); }
});

test("removing a chosen replacement retracts its choice and undo restores it", () => {
  const b = fixture();
  editCartLine(b.id, "cream", { chooseOption: CREAM_C });
  const before = structuredClone(memory(b));
  editCartLine(b.id, "cream", { chooseOption: "remove" });
  expect(memory(b)).toEqual([]);
  expect(b.lines[0].qty).toBe(0);
  undoCartLine(b.id);
  expect(b.lines[0].sku).toBe(CREAM_C);
  expect(b.lines[0].qty).toBe(20);
  expect(memory(b)).toEqual(before);
});
