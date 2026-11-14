import { Hono } from "hono";
import { cors } from "hono/cors";
import { catalogSize, search } from "./catalog";
import { callLog, checkStock } from "./valio";
import { events } from "./audit";
import { decide, listOrders, placeOrder, type Decision } from "./orders";
import { buildBasket, editLine, HttpError, recompute, type BasketRequest, type LineEdit } from "./plan";
import { getMandate } from "./policy";
import { baskets, orders } from "./store";

// Agent gateway: order builder API for the webshop + outside agents. Shapes in /CONTRACT.md (v1).
export const app = new Hono();
app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ ok: true, service: "valio-gateway", catalog: catalogSize() }));

// Local catalogue only: never touches the Valio API.
app.get("/api/products/search", (c) => {
  const q = c.req.query("q") ?? "";
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const diet = (c.req.query("diet") ?? "").split(",").filter(Boolean);
  return c.json(search(q, { limit, diet }));
});

// Price + availability for a shortlist (max 50 here: the order builder never needs more per step).
app.post("/api/stock", async (c) => {
  const { skus, date, customer } = await c.req.json<{ skus: string[]; date: string; customer?: string }>();
  if (!Array.isArray(skus) || !skus.length) return c.json({ error: "skus required" }, 400);
  if (skus.length > 50) return c.json({ error: "shortlist only: max 50 SKUs per check" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  try {
    return c.json(await checkStock(skus, date, customer));
  } catch (e) {
    return c.json({ error: String((e as Error).message) }, 502);
  }
});

app.get("/api/calls", (c) => c.json(callLog.slice(-100)));

// ---------- order builder (CONTRACT.md v1) ----------
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (c: any, e: unknown) => {
  if (e instanceof HttpError) return c.json({ error: e.message }, e.status);
  console.error(e);
  return c.json({ error: String((e as Error).message ?? e) }, 502);
};

app.post("/api/basket", async (c) => {
  const body = await c.req.json<BasketRequest>().catch(() => null);
  if (!body?.request?.trim()) return c.json({ error: "request required" }, 400);
  if (!DATE.test(body.date ?? "")) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  try {
    return c.json(await buildBasket(body));
  } catch (e) {
    return fail(c, e);
  }
});
app.get("/api/basket/:id", (c) => {
  const b = baskets.get(c.req.param("id"));
  return b ? c.json(recompute(b)) : c.json({ error: "basket not found" }, 404);
});
app.get("/api/basket/:id/audit", (c) => c.json(events(c.req.param("id"))));
app.post("/api/basket/:id/lines/:lineId", async (c) => {
  try {
    const body = await c.req.json<LineEdit>().catch(() => ({}) as LineEdit);
    return c.json(editLine(c.req.param("id"), c.req.param("lineId"), body));
  } catch (e) {
    return fail(c, e);
  }
});
app.post("/api/basket/:id/order", async (c) => {
  const { by } = await c.req.json<{ by?: string }>().catch(() => ({}) as { by?: string });
  try {
    const r = await placeOrder(c.req.param("id"), by || "buyer");
    return r.ok ? c.json(r.order, r.order.status === "placed" ? 201 : 202) : c.json(r, r.status);
  } catch (e) {
    return fail(c, e);
  }
});
app.post("/api/orders/:id/decision", async (c) => {
  try {
    return c.json(await decide(c.req.param("id"), await c.req.json<Decision>()));
  } catch (e) {
    return fail(c, e);
  }
});
app.get("/api/orders", (c) => c.json(listOrders(c.req.query("status"))));
app.get("/api/orders/:id", (c) => {
  const o = orders.get(c.req.param("id"));
  return o ? c.json(o) : c.json({ error: "order not found" }, 404);
});
app.get("/api/orders/:id/audit", (c) => {
  const o = orders.get(c.req.param("id"));
  return o ? c.json(events(o.basketId)) : c.json({ error: "order not found" }, 404);
});
app.get("/api/mandate/:customer", (c) => c.json(getMandate(c.req.param("customer"))));
