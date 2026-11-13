// Catalog explorer: a local webshop-style browser for the Valio Aimo synthetic data.
// Run: bun run explore   (runs prep first if the slim index is missing)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const DATA = join(ROOT, "data/raw/valio");
const API = process.env.VALIO_API_URL || "https://junction26.valioaimo.fi";
const KEY = process.env.VALIO_API_KEY;
const PORT = Number(process.env.EXPLORER_PORT || 4321);

if (!existsSync(join(DATA, "catalog.slim.json"))) {
  console.log("Building slim index…");
  await import("./prep.mjs");
}
const catalogGz = Bun.gzipSync(readFileSync(join(DATA, "catalog.slim.json")));
const stats = readFileSync(join(DATA, "stats.json"));

async function valio(path: string, body: unknown) {
  const r = await fetch(API + path, {
    method: "POST",
    headers: { "X-API-Key": KEY || "", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} ${r.status}: ${await r.text()}`);
  return r.json();
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/")
      return new Response(Bun.file(join(import.meta.dir, "index.html")));
    if (url.pathname === "/catalog.json")
      return new Response(catalogGz, {
        headers: {
          "content-type": "application/json",
          "content-encoding": "gzip",
        },
      });
    if (url.pathname === "/stats.json")
      return new Response(stats, {
        headers: { "content-type": "application/json" },
      });
    if (url.pathname === "/live" && req.method === "POST") {
      if (!KEY)
        return Response.json(
          { error: "VALIO_API_KEY missing in .env" },
          { status: 500 },
        );
      try {
        const { ids, date } = await req.json();
        const body = {
          customer: "explorer",
          requestedDate: date,
          products: ids.slice(0, 1000),
        };
        const [availability, price] = await Promise.all([
          valio("/api/availability", body),
          valio("/api/price", body),
        ]);
        return Response.json({ availability, price });
      } catch (e) {
        return Response.json({ error: String(e) }, { status: 502 });
      }
    }
    return new Response("not found", { status: 404 });
  },
});
console.log(`Catalog explorer → http://localhost:${PORT}`);
