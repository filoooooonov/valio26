// Product photos (CONTRACT v1.2: GET /api/products/:sku/image). The sponsor data has media ids only and the
// real image URLs on valioaimo.fi are signed, so we look a photo up by EAN, ONE product at a time, only when
// the UI shows that product, via the public valioaimo.fi product search. Throttled to ~2 lookups/s, cached
// on disk (data/raw/valio/images.cache.json, same file + format as the catalog explorer), misses included.
// Mentors OK'd using valioaimo.fi images (docs/sponsors/valio/categories-and-images.md).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getProduct } from "./catalog";

type Img = {
  img: string | null;
  title: string | null;
  page: string | null;
  at: string;
};

let file = join(
  process.env.VALIO_DATA_DIR ??
    join(import.meta.dir, "../../../data/raw/valio"),
  "images.cache.json",
);
let cache: Record<string, Img> | null = null;
const readFile = (): Record<string, Img> => {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  } catch {
    return {};
  }
};
const getCache = () => (cache ??= readFile());

type Fetch = typeof fetch;
let fetcher: Fetch = (...a) => fetch(...a);
export const setImageFetcher = (f: Fetch) => (fetcher = f);
/** Tests: point the cache at another file (and drop the in-memory copy). */
export const setImageCacheFile = (f: string) => {
  file = f;
  cache = null;
  inflight.clear();
};

export const TIMEOUT_MS = 4000;
const GAP_MS = 500; // at most ~2 lookups/s
let queue: Promise<unknown> = Promise.resolve();
const inflight = new Map<string, Promise<Img>>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function lookup(gtin: string): Promise<Img> {
  const running = inflight.get(gtin);
  if (running) return running;
  const job = queue.then(async () => {
    const hit = getCache()[gtin];
    if (hit) return hit;
    try {
      const r = await fetcher(
        `https://www.valioaimo.fi/valio-search-client/products-aimo/?account=valioaimo&search=${encodeURIComponent(gtin)}`,
        {
          headers: { "user-agent": "valio-gateway (hackathon prototype)" },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!r.ok) throw new Error(`valioaimo.fi search ${r.status}`);
      const j: any = await r.json();
      // An EAN search normally returns exactly 1 hit; many hits means it fell back to text search.
      const it = j.count >= 1 && j.count <= 3 ? j.items?.[0] : null;
      const img =
        it?.image && !/emarsys-default-image|Fallback/i.test(it.image)
          ? it.image
          : null;
      const entry: Img = {
        img,
        title: it?.title ?? null,
        page: it?.url ? "https://www.valioaimo.fi" + it.url : null,
        at: new Date().toISOString(),
      };
      // merge with the file first: the catalog explorer may have written to it meanwhile
      cache = { ...readFile(), ...getCache(), [gtin]: entry };
      try {
        writeFileSync(file, JSON.stringify(cache));
      } catch {
        /* read-only filesystem (hosted demo): keep the photo in memory only */
      }
      const p = getProduct(skuByGtin.get(gtin) ?? "");
      if (p) p.image = img; // new baskets pick the photo up from the catalogue
      return entry;
    } finally {
      await sleep(GAP_MS);
    }
  });
  queue = job.catch(() => {});
  inflight.set(gtin, job);
  job.finally(() => inflight.delete(gtin)).catch(() => {});
  return job;
}
const skuByGtin = new Map<string, string>();

/** { url } for a SKU: cache first; otherwise one throttled EAN lookup. Unknown SKU / no EAN / timeout -> null. */
export async function productImage(
  sku: string,
): Promise<{ url: string | null }> {
  const p = getProduct(sku);
  if (!p?.gtin) return { url: null };
  const hit = getCache()[p.gtin];
  if (hit) return { url: hit.img };
  skuByGtin.set(p.gtin, p.id);
  const timeout = sleep(TIMEOUT_MS).then(() => null);
  try {
    const r = await Promise.race([lookup(p.gtin), timeout]);
    return { url: r?.img ?? null }; // a timeout is not cached: the lookup finishes (and caches) in the background
  } catch {
    return { url: null }; // network/HTTP errors are not cached either
  }
}
