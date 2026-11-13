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

// Category names are not in the data: infer a label from the most common words in product names.
const STOP = new Set(
  "the and with for of in a g kg l ml dl cl x pcs pc ltd oy ab uht 1 2 3 4 5 6 10 approx frozen fresh".split(
    " ",
  ),
);
const catWords = {};
for (const p of products) {
  const w = (catWords[p.cat] ||= {});
  for (const t of new Set(
    (p.en || p.fi).toLowerCase().match(/[a-zåäö]{3,}/g) || [],
  ))
    if (!STOP.has(t)) w[t] = (w[t] || 0) + 1;
}
const categories = {};
for (const [cat, w] of Object.entries(catWords)) {
  const top = Object.entries(w)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);
  categories[cat] = {
    label: top.join(" · ") || cat,
    count: products.filter((p) => p.cat === cat).length,
  };
}

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
