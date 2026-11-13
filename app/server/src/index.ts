import { app } from "./app";
import { loadCatalog } from "./catalog";

const t0 = performance.now();
const n = loadCatalog();
console.log(`catalog: ${n} products in ${Math.round(performance.now() - t0)} ms`);
const port = Number(process.env.PORT ?? 8787);
Bun.serve({ port, fetch: app.fetch });
console.log(`gateway on http://localhost:${port}`);
