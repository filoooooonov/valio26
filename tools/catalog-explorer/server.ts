// Catalog explorer: a local webshop-style browser for the Valio Aimo synthetic data.
// Run: bun run explore   (runs prep first if the slim index is missing)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

// Product photos: the sponsor data has media ids only, and the real image URLs on valioaimo.fi are
// signed (no pattern from id/EAN). So we look a photo up on demand, one product at a time, when a
// product is opened in the explorer, via the public valioaimo.fi product search (by EAN), and
// hotlink the URL it returns. Results are cached in data/raw/valio/images.cache.json.
// Never call this in a loop over the catalogue. EXPLORER_IMAGES=0 disables lookups.
const IMG_ON = process.env.EXPLORER_IMAGES !== "0";
const IMG_FILE = join(DATA, "images.cache.json");
type Img = {
  img: string | null;
  title: string | null;
  page: string | null;
  at: string;
};
const imgCache: Record<string, Img> = existsSync(IMG_FILE)
  ? JSON.parse(readFileSync(IMG_FILE, "utf8"))
  : {};
let imgQueue: Promise<unknown> = Promise.resolve();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function lookupImage(gtin: string): Promise<Img> {
  if (imgCache[gtin]) return Promise.resolve(imgCache[gtin]);
  const job = imgQueue.then(async () => {
    if (imgCache[gtin]) return imgCache[gtin];
    const r = await fetch(
      `https://www.valioaimo.fi/valio-search-client/products-aimo/?account=valioaimo&search=${gtin}`,
      { headers: { "user-agent": "catalog-explorer (hackathon prototype)" } },
    );
    if (!r.ok) throw new Error(`valioaimo.fi search ${r.status}`);
    const j = await r.json();
    // An EAN search normally returns exactly 1 hit; many hits means it fell back to text search.
    const it = j.count >= 1 && j.count <= 3 ? j.items?.[0] : null;
    const img =
      it?.image && !/emarsys-default-image|Fallback/i.test(it.image)
        ? it.image
        : null;
    const entry: Img = {
      img,
      title: it?.title ?? null,
      page: it ? "https://www.valioaimo.fi" + it.url : null,
      at: new Date().toISOString(),
    };
    imgCache[gtin] = entry;
    writeFileSync(IMG_FILE, JSON.stringify(imgCache));
    await sleep(500); // at most ~2 lookups/s, even if someone clicks fast
    return entry;
  });
  imgQueue = job.catch(() => {});
  return job;
}

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
    if (url.pathname === "/images.json") return Response.json(imgCache);
    if (url.pathname === "/img") {
      const gtin = url.searchParams.get("gtin") || "";
      if (!/^\d{8,14}$/.test(gtin))
        return Response.json({ error: "bad gtin" }, { status: 400 });
      if (imgCache[gtin]) return Response.json(imgCache[gtin]);
      if (!IMG_ON) return Response.json({ off: true });
      try {
        return Response.json(await lookupImage(gtin));
      } catch (e) {
        return Response.json({ error: String(e) }, { status: 502 });
      }
    }
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
