// Vercel Function (Bun runtime): the same Hono gateway as app/server/src/index.ts, for the hosted demo.
// /api/* and /mcp are rewritten here (vercel.json); the function sees the original path.
// State (baskets, orders, audit) lives in this instance's memory plus /tmp: a cold start returns to the baseline.
process.env.COMMERCE_LEDGER_PATH ??= "/tmp/commerce/ledger.json";
const { app } = await import("../app/server/src/app");
const { loadCatalog } = await import("../app/server/src/catalog");
loadCatalog();

export default app;
