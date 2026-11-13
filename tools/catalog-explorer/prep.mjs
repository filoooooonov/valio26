// Builds a slim catalog index + coverage stats from the raw Valio Aimo data.
// Input:  data/raw/valio/*.json|csv (gitignored, download from the portal)
// Output: data/raw/valio/catalog.slim.json, data/raw/valio/stats.json
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "../../data/raw/valio");
const raw = JSON.parse(
  readFileSync(join(DIR, "valio_aimo_junction26_product_data.json"), "utf8"),
);

const csv = (f) =>
  Object.fromEntries(
    readFileSync(join(DIR, f), "utf8")
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((l) => l.split(","))
      .map(([id, v]) => [id, Number(v)]),
  );
const co2 = csv("valio_aimo_junction26_carbon_footprint.csv");
const rel = csv("valio_aimo_junction26_delivery_reliability.csv");

const lang = (arr, l) => (arr || []).find((x) => x.language === l)?.value || "";
const cls = (p, name) =>
  p.synkkaData?.classifications?.find((c) => c.name === name)?.values || [];

const products = raw.map((p) => {
  const s = p.synkkaData || {};
  const names = s.names || [];
  const allergens = cls(p, "allergen");
  return {
    id: p.id,
    en: lang(names, "en"),
    fi: lang(names, "fi"),
    sv: lang(names, "sv"),
    brand: s.brand || "",
    vendor: p.vendorName || "",
    cat: p.category,
    unit: p.salesUnit,
    baseUnit: p.baseUnit,
    lot: p.allowedLotSize,
    units: p.units || [],
    temp: p.temperatureCondition,
    tmin: s.minTemperature,
    tmax: s.maxTemperature,
    origin: p.countryOfOrigin || "",
    gtin: p.salesUnitGtin || "",
    contains: allergens.filter((a) => a.unit === "CONTAINS").map((a) => a.id),
    mayContain: allergens
      .filter((a) => a.unit && a.unit !== "CONTAINS" && a.unit !== "FREE_FROM")
      .map((a) => a.id),
    freeFromAllergen: [
      ...allergens.filter((a) => a.unit === "FREE_FROM").map((a) => a.id),
      ...cls(p, "nonAllergen").map((a) => a.id),
    ],
    claims: cls(p, "nutritionalClaim").map((c) => c.id),
    labels: cls(p, "packagingMarkedLabel").map((c) => c.id),
    nutrition: cls(p, "nutritionFact").map((n) => [n.id, n.value, n.unit]),
    keyIngr: lang(s.keyIngredients, "en") || lang(s.keyIngredients, "fi"),
    ingrCount: (s.ingredients || []).length,
    desc: (lang(s.marketingTexts, "en") || lang(s.marketingTexts, "fi")).slice(
      0,
      600,
    ),
    storage:
      lang(s.storageInstructions, "en") || lang(s.storageInstructions, "fi"),
    media: (s.medias || []).length,
    deposits: (p.deposits || []).length,
    co2: co2[p.id] != null ? Math.round(co2[p.id] * 1000) / 1000 : null,
    rel: rel[p.id] ?? null,
    size: s.unitConversions?.[0] || null,
  };
});

// Category names are not in the sponsor data (codes only).
// 1) Real names: aimo-categories.json maps a sample of codes to the public valioaimo.fi product-group
//    tree (looked up by EAN, see docs/sponsors/valio/categories-and-images.md). src: "valioaimo.fi".
// 2) Everything else is inferred, src: "inferred": a likely department from the longest code prefix
//    whose verified siblings agree, plus the most common words in the products' en/fi names.
const AIMO = JSON.parse(
  readFileSync(join(import.meta.dirname, "aimo-categories.json"), "utf8"),
);
const STOP = new Set(
  "the and with for of in a g kg l ml dl cl x pcs pc kpl ltd oy ab uht approx frozen fresh pakaste ltk rasia pss".split(
    " ",
  ),
);
// Words that are frequent in this category but rare elsewhere (count x idf), minus brand/vendor names.
const tokens = (s) => s.toLowerCase().match(/[a-zåäö]{3,}/g) || [];
const catTokens = (ps, lang) =>
  ps.map((p) => {
    const own = new Set(tokens(p.brand + " " + p.vendor));
    return new Set(tokens(p[lang]).filter((t) => !STOP.has(t) && !own.has(t)));
  });
const byCatAll = {};
for (const p of products) (byCatAll[p.cat] ||= []).push(p);
const nCats = Object.keys(byCatAll).length;
const df = { en: {}, fi: {} };
for (const lang of ["en", "fi"])
  for (const ps of Object.values(byCatAll))
    for (const t of new Set(catTokens(ps, lang).flatMap((x) => [...x])))
      df[lang][t] = (df[lang][t] || 0) + 1;
const topWords = (ps, lang, k) => {
  const w = {};
  for (const set of catTokens(ps, lang)) for (const t of set) w[t] = (w[t] || 0) + 1;
  return Object.entries(w)
    .filter(([, c]) => c >= Math.min(2, ps.length))
    .map(([t, c]) => [t, c * Math.log(nCats / df[lang][t])])
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([t]) => t);
};
const guessDept = (code) => {
  for (const len of [4, 3, 2]) {
    const peers = Object.entries(AIMO.codes)
      .filter(([c]) => c !== code && c.startsWith(code.slice(0, len)))
      .map(([, v]) => v.path);
    if (!peers.length) continue;
    for (const depth of [2, 1]) {
      const opts = new Set(peers.map((p) => p.slice(0, depth).join(" > ")));
      if (opts.size === 1)
        return {
          path: peers[0].slice(0, depth),
          basis: `${peers.length} verified code(s) starting ${code.slice(0, len)}`,
        };
    }
    return null; // verified siblings at this prefix disagree: don't guess
  }
  return null;
};
const categories = {};
for (const [cat, ps] of Object.entries(byCatAll)) {
  const words = {
    en: topWords(ps, "en", 3),
    fi: topWords(ps, "fi", 3),
  };
  const real = AIMO.codes[cat];
  if (real)
    categories[cat] = {
      label: real.path.at(-1),
      path: real.path,
      src: "valioaimo.fi",
      count: ps.length,
      words,
    };
  else {
    const g = guessDept(cat);
    categories[cat] = {
      label: (words.en.length ? words.en : words.fi).join(" · ") || cat,
      src: "inferred",
      guess: g?.path || null,
      guessBasis: g?.basis || null,
      count: ps.length,
      words,
    };
  }
}
const catReal = Object.values(categories).filter((c) => c.src !== "inferred");

// Coverage stats: how much of each kind of info do we actually have?
const n = products.length;
const has = (f) => products.filter(f).length;
const tally = (key) => {
  const t = {};
  for (const p of products)
    for (const v of [].concat(p[key]))
      if (v !== "" && v != null) t[v] = (t[v] || 0) + 1;
  return Object.entries(t).sort((a, b) => b[1] - a[1]);
};
const stats = {
  total: n,
  coverage: {
    "English name": has((p) => p.en),
    "Finnish name": has((p) => p.fi),
    Brand: has((p) => p.brand),
    "GTIN barcode": has((p) => p.gtin),
    "Allergen info (any)": has(
      (p) =>
        p.contains.length || p.mayContain.length || p.freeFromAllergen.length,
    ),
    "Nutritional claims": has((p) => p.claims.length),
    "Labels / certificates": has((p) => p.labels.length),
    "Nutrition facts": has((p) => p.nutrition.length),
    "Key ingredients": has((p) => p.keyIngr),
    "Full ingredient list": has((p) => p.ingrCount),
    "Marketing text": has((p) => p.desc),
    "Image (id only)": has((p) => p.media),
    "Carbon footprint": has((p) => p.co2 != null),
    "Delivery reliability": has((p) => p.rel != null),
    "Returnable deposits": has((p) => p.deposits),
  },
  vendors: tally("vendor").length,
  categories: Object.keys(categories).length,
  categoryNames: {
    realCodes: catReal.length,
    realProducts: catReal.reduce((a, c) => a + c.count, 0),
    guessedDept: Object.values(categories).filter((c) => c.guess).length,
    source: "valioaimo.fi public product-group tree (sampled by EAN)",
  },
  topVendors: tally("vendor").slice(0, 15),
  salesUnits: tally("unit"),
  temps: tally("temp"),
  origins: tally("origin").slice(0, 15),
  allergens: tally("contains"),
  claims: tally("claims").slice(0, 25),
  labels: tally("labels").slice(0, 25),
  reliabilityBuckets: [
    ["1.0", has((p) => p.rel === 1)],
    ["0.95–0.99", has((p) => p.rel >= 0.95 && p.rel < 1)],
    ["0.8–0.95", has((p) => p.rel >= 0.8 && p.rel < 0.95)],
    ["< 0.8", has((p) => p.rel != null && p.rel < 0.8)],
  ],
};

writeFileSync(
  join(DIR, "catalog.slim.json"),
  JSON.stringify({ products, categories }),
);
writeFileSync(join(DIR, "stats.json"), JSON.stringify(stats, null, 1));
console.log(
  `products ${n}, categories ${stats.categories}, vendors ${stats.vendors}`,
);
console.log(stats.coverage);
console.log("category names", stats.categoryNames);
