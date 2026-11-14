process.env.COMMERCE_LEDGER_PATH ??= "data/commerce/ledger.json";
const { app } = await import("./app");
import { loadCatalog } from "./catalog";

const t0 = performance.now();
const n = loadCatalog();
console.log(`catalog: ${n} products in ${Math.round(performance.now() - t0)} ms`);
const port = Number(process.env.PORT ?? 8787);
Bun.serve({ port, hostname: process.env.COMMERCE_HOST ?? "127.0.0.1", fetch: app.fetch });
console.log(`gateway on http://localhost:${port}`);
