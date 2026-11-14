import { PolicySchema } from "./commerce";
import { commerceApi } from "./commerce-api";
import { authenticatedMode, requirePrincipal, scopeBasket, scopeOrder, requireApprover, scopeCustomer, authenticate } from "./auth";
import { persistStore } from "./store";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { catalogSize, getProduct, search } from "./catalog";
import { callLog, checkStock, missingLine } from "./valio";
import { allEvents, events } from "./audit";
import { decide, listOrders, placeOrder, type Decision } from "./orders";
import { buildBasket, HttpError, recompute, rescaleGuests, type BasketRequest, type LineEdit } from "./plan";
import { editCartLine, undoCartLine } from "./cartHistory";
import { chat } from "./chat";
import { parseMenuInput, suggestMenu } from "./menu";
import { checkReplacements, proposeRecipeChange, applyRecipeChange } from './plan';
import { productImage } from "./images";
import { handleMcp } from "./mcp";
import { getMandate, setMandate } from "./policy";
import { baskets, orders } from "./store";

// Agent gateway: order builder API for the webshop + outside agents. Shapes in /CONTRACT.md (v1).
export const app = new Hono();
app.use("/api/*", cors({ origin: process.env.COMMERCE_BROWSER_ORIGIN ?? "http://localhost:5173", credentials:true }));
app.use("/api/*", async (c,next) => {
  if (c.req.path === "/api/v1/openapi.json" || c.req.path === "/api/health" || /\/products\/[^/]+\/image$/.test(c.req.path)) return next();
  if (authenticatedMode() && !c.req.path.startsWith("/api/v1/")) {
    try {
      const p=requirePrincipal(c.req.raw);
      const basketId=c.req.path.match(/^\/api\/basket\/([^/]+)/)?.[1];
      const orderId=c.req.path.match(/^\/api\/orders\/([^/]+)/)?.[1];
      if(basketId)scopeBasket(p,basketId);
      if(orderId)scopeOrder(p,orderId);
      const customer=c.req.path.match(/^\/api\/mandate\/([^/]+)/)?.[1] ?? c.req.query("customer");
      if(customer)scopeCustomer(p,customer);
      if(c.req.path.endsWith("/decision"))requireApprover(p);
      if(!["GET","HEAD"].includes(c.req.method)) {
        const body=await c.req.json().catch(()=>null);
        if(body && typeof body === "object") {
          if(body.customer && body.customer!==p.customer)scopeCustomer(p,body.customer);
          if(c.req.path === "/api/basket" || c.req.path === "/api/stock") body.customer=p.customer;
          if(/\/(order|decision|chat|undo|lines|guests)(?:\/|$)/.test(c.req.path)) body.by=p.actor;
          if(c.req.path.endsWith("/decision") && body.decision==="approve" && !/^[a-f0-9]{64}$/.test(body.revision ?? "")) throw new HttpError(400,"approval revision required");
        }
      }
    } catch(e) {return c.json({error:(e as Error).message},(e instanceof HttpError?e.status:401) as any);}
  }
  try {await next();} finally {if(!["GET","HEAD"].includes(c.req.method))persistStore();}
});
app.route("/api/v1",commerceApi);

app.get("/api/health", (c) => c.json({ ok: true, service: "valio-gateway", catalog: catalogSize() }));

app.get("/api/commerce-context",c=>{const p=authenticate(c.req.raw);return c.json({role:p?.role ?? "local_demo",actor:p?.actor ?? "Local demo",policy:getMandate(p?.customer ?? "123"),simulated:true});});
app.post("/api/mandate",async c=>{
  const p=authenticate(c.req.raw);
  if(authenticatedMode() && p?.role!=="admin")return c.json({error:"Only an administrator may configure policy."},403);
  try{setMandate(p?.customer ?? "123",PolicySchema.parse(await c.req.json()));return c.json(getMandate(p?.customer ?? "123"));}
  catch{return c.json({error:"Invalid purchasing policy."},400);}
});

// Local catalogue only: never touches the Valio API.
// One EAN lookup on valioaimo.fi per SKU, only when the UI shows that product; cached on disk (misses too).
app.get("/api/products/:sku/image", async (c) => c.json(await productImage(c.req.param("sku"))));

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
  // Unknown SKUs never reach Valio: they come back as status "not_found"; all unknown -> 404.
  const known = skus.filter((s) => getProduct(String(s)));
  const unknown = skus.filter((s) => !getProduct(String(s)));
  try {
    const sc = known.length
      ? await checkStock(known, date, customer)
      : { checkedAt: new Date().toISOString(), date, calls: 0, skus: 0, lines: [] };
    const lines = skus.map(
      (s) => sc.lines.find((l) => l.sku === s) ?? missingLine(String(s), "unknown SKU: not in the Valio Aimo catalogue"),
    );
    const body = { ...sc, skus: skus.length, lines };
    if (!known.length) return c.json({ error: `unknown SKU${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`, ...body }, 404);
    return c.json(body);
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

// Menu step (CONTRACT S35): language only, no catalogue/price/stock calls.
app.post("/api/menu", async (c) => {
  try {
    return c.json(await suggestMenu(parseMenuInput(await c.req.json().catch(() => null))));
  } catch (e) {
    return fail(c, e);
  }
});

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
app.post('/api/basket/:id/lines/:lineId/replacements/check', async c => {
  try { return c.json(await checkReplacements(c.req.param('id'),c.req.param('lineId'))); } catch(e) { return fail(c,e); }
});
app.post('/api/basket/:id/lines/:lineId/recipe-change', async c => {
  try { return c.json(await proposeRecipeChange(c.req.param('id'),c.req.param('lineId'))); } catch(e) { return fail(c,e); }
});
app.post('/api/basket/:id/recipe-change/:proposalId/apply', c => {
  try { return c.json(applyRecipeChange(c.req.param('id'),c.req.param('proposalId'),'buyer')); } catch(e) { return fail(c,e); }
});
app.post("/api/basket/:id/lines/:lineId", async (c) => {
  try {
    const body = await c.req.json<LineEdit>().catch(() => ({}) as LineEdit);
    return c.json(editCartLine(c.req.param("id"), c.req.param("lineId"), body));
  } catch (e) {
    return fail(c, e);
  }
});
app.post("/api/basket/:id/undo", async (c) => {
  try {
    const body = await c.req.json<{ by?: string }>().catch(() => ({} as { by?: string }));
    return c.json(undoCartLine(c.req.param("id"), body.by || "buyer"));
  } catch (e) {
    return fail(c, e);
  }
});
// v1.2: deterministic guests rescale (no LLM) and chat -> gateway actions (Claude maps words, gateway runs them).
app.post("/api/basket/:id/guests", async (c) => {
  const body = await c.req.json<{ people?: number; by?: string }>().catch(() => ({}) as { people?: number; by?: string });
  const people = Number(body.people);
  if (!Number.isInteger(people) || people < 1 || people > 2000)
    return c.json({ error: "people must be a whole number from 1 to 2000" }, 400);
  try {
    return c.json(await rescaleGuests(c.req.param("id"), people, body.by || "buyer"));
  } catch (e) {
    return fail(c, e);
  }
});
app.post("/api/basket/:id/chat", async (c) => {
  const body = await c.req.json<{ text?: string; by?: string }>().catch(() => ({}) as { text?: string; by?: string });
  if (!body.text?.trim()) return c.json({ error: "text required" }, 400);
  try {
    return c.json(await chat(c.req.param("id"), body.text, body.by || "buyer"));
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
app.get("/api/orders", (c) => { const p=authenticate(c.req.raw); return c.json(listOrders(c.req.query("status")).filter(o=>!p || o.customer===p.customer)); });
app.get("/api/orders/:id", (c) => {
  const o = orders.get(c.req.param("id"));
  return o ? c.json(o) : c.json({ error: "order not found" }, 404);
});
app.get("/api/orders/:id/audit", (c) => {
  const o = orders.get(c.req.param("id"));
  return o ? c.json(events(o.basketId)) : c.json({ error: "order not found" }, 404);
});
app.get("/api/mandate/:customer", (c) => c.json(getMandate(c.req.param("customer"))));
app.get("/api/mandate", (c) => c.json(getMandate(authenticate(c.req.raw)?.customer ?? c.req.query("customer") ?? "123")));
// Whole audit trail, newest first (each event carries its basket scope). Per order: /api/orders/:id/audit.
app.get("/api/audit", (c) => c.json(allEvents(Math.min(Number(c.req.query("limit") ?? 200), 1000)).filter(e=>!authenticate(c.req.raw) || baskets.get(e.scope)?.customer===authenticate(c.req.raw)!.customer)));

// MCP (Streamable HTTP, stateless) for outside buyer agents: same handlers + same mandate as the REST API.
app.all("/mcp", (c) => handleMcp(c.req.raw));
