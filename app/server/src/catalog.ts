// Local product catalogue (owner: aleksei, solo build). No Valio API calls here: search runs on the
// synthetic product file only, so we never query prices/stock for the whole catalogue.
// Source: data/raw/valio/catalog.slim.json (build it with `bun run explore:prep`).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DATA =
  process.env.VALIO_DATA_DIR ??
  join(import.meta.dir, "../../../data/raw/valio");

export type Size = { qty: number; unit: "L" | "KG" | "PCS" };
export type Product = {
  id: string;
  en: string;
  fi: string;
  sv: string;
  brand: string;
  vendor: string;
  cat: string;
  unit: string;
  gtin: string;
  origin: string;
  contains: string[];
  mayContain: string[];
  claims: string[];
  labels: string[];
  co2: number | null;
  rel: number | null;
  temp?: number;
  size?: Size | null;
  image?: string | null;
};
export type ProductHit = {
  id: string;
  name: string;
  brand: string;
  unit: string;
  size?: Size;
  claims: string[];
  contains: string[];
  labels: string[];
  co2?: number;
  reliability?: number;
  image?: string;
  score: number;
};

// Diet → predicate. Allergen code AM = milk (GS1). Claims come from Synkka nutritionalClaim.
export const DIETS: Record<string, (p: Product) => boolean> = {
  "lactose-free": (p) =>
    p.claims.includes("FREE_FROM_LACTOSE") || p.claims.includes("LACTOSE_FREE"),
  "milk-free": (p) =>
    !p.contains.includes("AM") && !p.mayContain.includes("AM"),
  vegan: (p) => p.claims.includes("VEGAN"),
  vegetarian: (p) =>
    p.claims.includes("VEGETARIAN") || p.claims.includes("VEGAN"),
  "gluten-free": (p) => p.claims.includes("FREE_FROM_GLUTEN"),
};

/** Pack size from the product name ("1 l", "400g", "2,5 kg", "60 pcs", "12 kpl"); null if unknown. */
export function parseSize(name: string): Size | null {
  const m = name
    .toLowerCase()
    .match(
      /(\d+(?:[.,]\d+)?)\s*(?:x\s*(\d+(?:[.,]\d+)?)\s*)?(kg|g|l|dl|cl|ml|pcs|kpl|st)\b/,
    );
  if (!m) return null;
  const n = (s: string) => Number(s.replace(",", "."));
  let qty = n(m[1]);
  let unit = m[3];
  if (m[2]) {
    qty *= n(m[2]);
  }
  const conv: Record<string, [number, Size["unit"]]> = {
    kg: [1, "KG"],
    g: [0.001, "KG"],
    l: [1, "L"],
    dl: [0.1, "L"],
    cl: [0.01, "L"],
    ml: [0.001, "L"],
    pcs: [1, "PCS"],
    kpl: [1, "PCS"],
    st: [1, "PCS"],
  };
  const [f, u] = conv[unit];
  const v = Math.round(qty * f * 1000) / 1000;
  return v > 0 ? { qty: v, unit: u } : null;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[®™]/g, "");
const tokens = (s: string) =>
  norm(s)
    .split(/[^a-z0-9åäö]+/)
    .filter((t) => t.length > 1);

let products: Product[] = [];
let index: { p: Product; text: string; toks: Set<string> }[] = [];

export function loadCatalog(dir = DATA): number {
  const file = join(dir, "catalog.slim.json");
  if (!existsSync(file))
    throw new Error(`catalog missing: ${file} (run \`bun run explore:prep\`)`);
  const raw = JSON.parse(readFileSync(file, "utf8")).products as Product[];
  let images: Record<string, { img: string | null }> = {};
  const imgFile = join(dir, "images.cache.json");
  if (existsSync(imgFile)) images = JSON.parse(readFileSync(imgFile, "utf8"));
  products = raw.map((p) => ({
    ...p,
    size: parseSize(p.en || p.fi),
    image: images[p.gtin]?.img ?? null,
  }));
  index = products.map((p) => {
    const text = norm([p.en, p.fi, p.sv, p.brand].join(" "));
    return { p, text, toks: new Set(tokens(text)) };
  });
  return products.length;
}

export const catalogSize = () => products.length;
export const getProduct = (id: string) => products.find((p) => p.id === id);

export function toHit(p: Product, score = 0): ProductHit {
  return {
    id: p.id,
    name: p.en || p.fi,
    brand: p.brand,
    unit: p.unit,
    size: p.size ?? undefined,
    claims: p.claims,
    contains: p.contains,
    labels: p.labels,
    co2: p.co2 ?? undefined,
    reliability: p.rel ?? undefined,
    image: p.image ?? undefined,
    score,
  };
}

/** Ranked local search over en/fi/sv names + brand. Every query token must match (prefix ok). */
export function search(
  q: string,
  opts: { limit?: number; diet?: string[] } = {},
): ProductHit[] {
  const qt = tokens(q);
  if (!qt.length) return [];
  const diets = (opts.diet ?? []).map((d) => DIETS[d]).filter(Boolean);
  const out: ProductHit[] = [];
  for (const { p, text, toks } of index) {
    let score = 0;
    let ok = true;
    for (const t of qt) {
      if (toks.has(t)) score += 3;
      else if (
        [...toks].some(
          (x) => x.startsWith(t) || (t.length > 4 && x.includes(t)),
        )
      )
        score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (!ok || !diets.every((d) => d(p))) continue;
    if (norm(p.en).startsWith(qt[0])) score += 2; // head noun first ("salmon fillet" over "fish soup with salmon")
    score -= Math.min(text.length, 160) / 160; // prefer shorter, more specific names
    out.push(toHit(p, Math.round(score * 100) / 100));
  }
  return out.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 20);
}
