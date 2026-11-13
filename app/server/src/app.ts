import { Hono } from "hono";
import { cors } from "hono/cors";
import { catalogSize, search } from "./catalog";
import { callLog, checkStock } from "./valio";

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
