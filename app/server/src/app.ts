import { Hono } from "hono";
import { cors } from "hono/cors";

// Agent gateway (owner: ayaan). Shapes in /CONTRACT.md.
export const app = new Hono();
app.use("/api/*", cors());
app.get("/api/health", (c) => c.json({ ok: true, service: "valio-gateway" }));
