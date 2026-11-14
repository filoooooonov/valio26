import { beforeAll, expect, test } from "bun:test";
import { app } from "./app";
import { catalogSize, getProduct, loadCatalog, search } from "./catalog";
import type { StockLine } from "./valio";
import { canonical, receiptFor, RECEIPT_TTL_MS, verifyReceipt } from "./trust";

beforeAll(() => {
  if (!catalogSize()) loadCatalog();
});

function line(overrides: Partial<StockLine> = {}): StockLine {
  return { sku: search("milk", { limit: 1 })[0].id,
    price: 10, priceWithTax: 11.4, taxRate: 14, customerPrice: true,
    available: 100, cutoffPassed: false, deliverable: true, status: "ok", salesUnit: "PCS", ...overrides };
}
const context = () => ({ customer: "123", deliveryDate: "2026-11-20", checkedAt: new Date().toISOString() });

test("canonical sorts keys recursively and keeps array order", () => {
  expect(canonical({ b: 1, a: { d: 1, c: 2 } })).toBe('{"a":{"c":2,"d":1},"b":1}');
  expect(canonical([{ b: 1, a: 2 }, 3])).toBe('[{"a":2,"b":1},3]');
});

test("receiptFor produces a verifiable receipt with catalogue claims", () => {
  const stock = line();
  const r = receiptFor(stock, context());
  const product = getProduct(stock.sku)!;
  expect(r.claims).toMatchObject({ name: product.en, origin: product.origin || null, labels: product.labels ?? [] });
  expect(verifyReceipt(r)).toEqual({ valid: true, expired: false });
});

test("tampered price fails signature verification", () => {
  const r = receiptFor(line(), context());
  expect(verifyReceipt({ ...r, claims: { ...r.claims, price: r.claims.price! - 1 } }))
    .toMatchObject({ valid: false, reason: expect.stringContaining("signature") });
});

test("wrong receipt or claims kid is an unknown key", () => {
  const r = receiptFor(line(), context());
  expect(verifyReceipt({ ...r, kid: "wrong" })).toEqual({ valid: false, reason: "unknown key" });
  expect(verifyReceipt({ ...r, claims: { ...r.claims, kid: "wrong" } })).toEqual({ valid: false, reason: "unknown key" });
});

test("expiry preserves authenticity", () => {
  const r = receiptFor(line(), context());
  expect(verifyReceipt(r, Date.parse(r.claims.validUntil) + 1000)).toEqual({ valid: true, expired: true });
});

test("validUntil uses the earlier of the TTL and ordering cutoff", () => {
  const ctx = context();
  const checked = Date.parse(ctx.checkedAt);
  const cutoff = new Date(checked + 5 * 60 * 1000).toISOString();
  expect(receiptFor(line({ closingTime: cutoff }), ctx).claims.validUntil).toBe(cutoff);
  const ttl = new Date(checked + RECEIPT_TTL_MS).toISOString();
  expect(receiptFor(line(), ctx).claims.validUntil).toBe(ttl);
  expect(receiptFor(line({ closingTime: new Date(checked + 2 * RECEIPT_TTL_MS).toISOString() }), ctx).claims.validUntil).toBe(ttl);
  expect(receiptFor(line({ closingTime: "invalid" }), ctx).claims.validUntil).toBe(ttl);
});

test("garbage receipts never throw", () => {
  for (const value of [null, {}, "x"]) {
    expect(() => verifyReceipt(value)).not.toThrow();
    expect(verifyReceipt(value)).toEqual({ valid: false, reason: "malformed receipt" });
  }
  const r = receiptFor(line(), context());
  expect(verifyReceipt({ ...r, alg: "other" })).toEqual({ valid: false, reason: "unsupported alg" });
});

test("non-finite and missing numbers are signed as null", () => {
  const r = receiptFor(line({ price: NaN, priceWithTax: undefined, available: Infinity }), context());
  expect(r.claims).toMatchObject({ price: null, priceWithTax: null, available: null });
  expect(verifyReceipt(JSON.parse(JSON.stringify(r)))).toEqual({ valid: true, expired: false });
});

test("HTTP discovery and receipt verification", async () => {
  const discovery = await app.request("/.well-known/aimo-gateway.json");
  expect(discovery.status).toBe(200);
  const info = await discovery.json();
  expect(info.alg).toBe("Ed25519");
  expect(typeof info.kid).toBe("string");
  const receipt = receiptFor(line(), context());
  expect(info.receipt.fields).toEqual(Object.keys(receipt.claims));
  const post = (body: unknown) => app.request("/api/receipts/verify", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const response = await post({ receipt });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ valid: true, expired: false });
  const missing = await post({});
  expect(missing.status).toBe(400);
  expect(await missing.json()).toEqual({ error: "receipt required" });
  const invalid = await post({ receipt: {} });
  expect(invalid.status).toBe(200);
  expect(await invalid.json()).toEqual({ valid: false, reason: "malformed receipt" });
});
