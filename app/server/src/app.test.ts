import { beforeAll, expect, test } from "bun:test";
import { app } from "./app";
import { catalogSize, loadCatalog } from "./catalog";

beforeAll(() => {
  if (!catalogSize()) loadCatalog();
});

test("GET /api/health", async () => {
  const res = await app.request("/api/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true });
});

test("English 'milk' ranks dairy above tableware", async () => {
  const hits = await (await app.request("/api/products/search?q=milk&limit=5")).json();
  expect(hits[0].name.toLowerCase()).not.toContain("jug");
  expect(hits.some((h: any) => /jug/i.test(h.name))).toBe(false);
});

test("POST /api/stock with only unknown SKUs -> 404, line status not_found, no Valio call", async () => {
  const res = await app.request("/api/stock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ skus: ["NOPE-1"], date: "2026-11-20" }),
  });
  expect(res.status).toBe(404);
  const body = await res.json();
  expect(body.calls).toBe(0);
  expect(body.lines[0]).toMatchObject({ sku: "NOPE-1", status: "not_found", deliverable: false });
});

test("mandate + audit + orders routes are mounted", async () => {
  expect(await (await app.request("/api/mandate")).json()).toMatchObject({ maxOrderEur: 500, maxDailyEur: 1500 });
  expect((await app.request("/api/audit")).status).toBe(200);
  expect((await app.request("/api/orders")).status).toBe(200);
  expect((await app.request("/api/orders/o_none/audit")).status).toBe(404);
  const r = await app.request("/api/basket", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(r.status).toBe(400);
});

test("MCP endpoint lists the gateway tools", async () => {
  const res = await app.request("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.result.tools.map((t: any) => t.name).sort()).toEqual(
    ["build_basket", "check_stock", "get_order", "place_order", "search_products", "verify_receipt"],
  );
});
