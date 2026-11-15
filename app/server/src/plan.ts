import {
  comparisonShortlist,
  rankComparedProducts,
  comparisonReason,
  COMPARISON_LIMIT,
  type ProductComparison,
} from "./comparison";
import { explainPurchase } from "./explain";
// Planner: request -> dishes -> needs -> catalogue candidates (server, local) -> LLM picks a SKU per need
// -> ONE price/stock call for the chosen SKUs -> quantities in sales units -> issues with ranked alternatives
// (ONE extra call). The LLM never sees prices/stock and never applies rules; the mandate runs in policy.ts.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  directDraft,
  parsePurchaseItems,
  purchasingIntent,
  requestAllergens,
  type PurchaseItem,
} from "./intent";
import {
  allergenCode,
  blockingChecks,
  stockToConfirm,
  validatePurchase,
} from "./validation";
import { audit } from "./audit";
import { getProduct, search, type Product } from "./catalog";
import { getLlm, type Candidate, type Draft, type PickInput } from "./llm";
import {
  eur,
  evaluate,
  getMandate,
  type Mandate,
  type MandateResult,
} from "./policy";
import { baskets, dailySoFar, newId, orders, submitting } from "./store";
import {
  acceptedCount,
  preferenceOf,
  PREFERENCE_TIER,
  rankByPreference,
  recordPreference,
  restoreChoiceMemory,
  type Preference,
} from "./preferences";
import { activePermission } from "./policy";
import { reorderDraft } from "./reorder";
import { basketSummary, type BasketSummary } from "./summary";
import { checkStock, contentPerUnit, type StockLine } from "./valio";

export type Dish = {
  id: string;
  name: string;
  portions: number;
  basis: string;
  diet: string[];
};
export type Option = {
  quantityIssue?: string;
  frozen?: boolean;
  sku: string;
  name: string;
  reason: string;
  delta: number; // EUR vs the original line
  qty: number;
  pack: string;
  why: string;
  total: number;
  stock: StockLine;
  contains: string[];
  preference?: Preference; // S48: purchase memory for this option as a replacement for the line's product
};
export type Issue = {
  kind: "short" | "unavailable" | "cutoff";
  text: string;
  options: Option[];
  decided?: string; // option sku | "keep" | "remove"
  decidedBy?: string;
};
export type BasketLine = {
  comparison?: ProductComparison;
  excludedQty?: number;
  frozen?: boolean;
  id: string;
  dishId: string | null;
  needIds: string[];
  sku: string;
  name: string;
  brand: string;
  qty: number; // sales units to order
  pack: string; // "2.5 kg", "1 l", "by kg"
  why: string; // "50 × 140 g = 7 kg → 3 × 2.5 kg"
  stock: StockLine;
  total: number; // EUR excl. VAT
  contains: string[]; // allergen names
  requiredDiet?: string[];
  quantityIssue?: string;
  requestedAmount?: { qty: number; unit: "KG" | "L" | "PCS" };
  overbuy?: number;
  claims: string[];
  reliability?: number;
  co2?: number;
  image?: string;
  issue?: Issue;
  replaced?: { sku: string; name: string; originalTotal?: number };
  usedIn?: string[];
  preference?: Preference; // S48: purchase memory for the selected SKU
  offerPermission?: {
    fromSku: string;
    fromName: string;
    toSku: string;
    toName: string;
    accepted: number;
  };
};
export type Basket = {
  id: string;
  customer: string;
  request: string;
  people: number;
  date: string;
  planner: "llm" | "fallback";
  plannerNote?: string;
  intent?: "MENU_PLANNING" | "DIRECT_PURCHASE" | "REORDER";
  forbiddenAllergens?: string[];
  requiredDiet?: string[];
  requestBudgetEur?: number;
  factSource?: string;
  delivery?: { placeId: string; address: string; time: string };
  validationGaps?: string[];
  dishes: Dish[];
  lines: BasketLine[];
  assumed: string[];
  notes: string[]; // needs we could not match, unit assumptions
  checkedAt: string;
  apiCalls: number;
  total: number; // orderable lines only (no open issue), EUR excl. VAT
  totalWithVat: number;
  openIssues: number;
  totalIfAccepted: number; // total if every open issue takes its first option
  pricesHeldUntil: string | null;
  rules: Mandate;
  mandate: MandateResult;
  createdAt: string;
  summary?: BasketSummary; // S48: exception-first cart counts, computed in recompute
};

type Need = Draft["needs"][number] & { pinned?: string[] };

/** Internal per-basket planning context (not part of the JSON shape): each line's needs (for the guests
 * rescale) and its alternative pool (for new issues). Keyed by basket id, then line id. */
type LineCtx = { needs: Need[]; pool: string[] };
const basketCtx = new Map<string, Map<string, LineCtx>>();

// ---------- allergens, diets, categories ----------
const ALLERGENS: Record<string, string> = {
  AM: "milk",
  AF: "fish",
  AE: "egg",
  AW: "gluten",
  UW: "wheat",
  GB: "barley",
  GO: "oats",
  AY: "soy",
  AN: "nuts",
  AP: "peanuts",
  AS: "sesame",
  AC: "crustaceans",
  UM: "molluscs",
  BC: "celery",
  BM: "mustard",
  AU: "sulphites",
  NL: "lupin",
  ML: "lactose",
};
const allergenNames = (codes: string[]) => [
  ...new Set(codes.map((c) => ALLERGENS[c]).filter(Boolean)),
];
const GLUTEN = ["AW", "UW", "GB", "GO", "NR"];
const ANIMAL = ["AM", "AF", "AE", "AC", "UM", "ML"];
const MEAT_FISH = /^(18|41(70|71|72|73))/; // fresh meat/fish, frozen meat/fish groups

/** Diet check on catalogue data. Plain fish/veg rarely carry a "lactose free" claim, so absence of milk counts. */
export function fits(p: Product, diet: string[]): boolean {
  const has = (c: string) => p.contains.includes(c);
  return diet.every((d) => {
    if (d === "lactose-free")
      return (
        p.claims.includes("FREE_FROM_LACTOSE") ||
        p.claims.includes("LACTOSE_FREE") ||
        !has("AM")
      );
    if (d === "milk-free") return !has("AM") && !p.mayContain.includes("AM");
    if (d === "vegan")
      return (
        p.claims.includes("VEGAN") ||
        (!ANIMAL.some(has) && !MEAT_FISH.test(p.cat))
      );
    if (d === "vegetarian")
      return (
        p.claims.includes("VEGETARIAN") ||
        p.claims.includes("VEGAN") ||
        (!has("AF") && !has("AC") && !MEAT_FISH.test(p.cat))
      );
    if (d === "gluten-free")
      return p.claims.includes("FREE_FROM_GLUTEN") || !GLUTEN.some(has);
    return true;
  });
}
const NONFOOD = /^(20|6)/;

let catNames: Record<string, string> | null = null;
function catLabel(code: string): string {
  if (!catNames) {
    catNames = {};
    const f = join(
      import.meta.dir,
      "../../../tools/catalog-explorer/aimo-categories.json",
    );
    if (existsSync(f))
      for (const [k, v] of Object.entries<any>(
        JSON.parse(readFileSync(f, "utf8")).codes ?? {},
      ))
        catNames[k] = (v.path ?? []).join(" > ");
  }
  return catNames[code] ?? code;
}

// ---------- units ----------
const r2 = (n: number) => Math.round(n * 100) / 100;
type Amt = { qty: number; unit: "KG" | "L" | "PCS" };
export function fmtAmt(a: Amt): string {
  const n = (x: number) => String(Math.round(x * 1000) / 1000);
  if (a.unit === "KG")
    return a.qty < 1 ? `${n(a.qty * 1000)} g` : `${n(a.qty)} kg`;
  if (a.unit === "L")
    return a.qty < 1 ? `${n(a.qty * 10)} dl` : `${n(a.qty)} l`;
  return `${n(a.qty)} pcs`;
}
const needAmt = (n: Need): Amt => ({
  qty: n.totalQty,
  unit: n.totalUnit === "kg" ? "KG" : n.totalUnit === "l" ? "L" : "PCS",
});
function perPortionText(n: Need): string | null {
  if (n.perPortion == null || !n.perPortionUnit) return null;
  return `${Math.round(n.perPortion * 10) / 10} ${n.perPortionUnit === "pcs" ? "pcs" : n.perPortionUnit}`;
}

/** What one sales unit holds. Catch-weight products (sold per kg) are "by kg". */
export function packOf(
  st: StockLine,
  p?: Product,
): Amt & { byWeight: boolean; lot?: number } {
  if (st.salesUnit === "KG" || p?.unit === "KG")
    // base unit KG = catch weight, priced per kg
    return {
      qty: 1,
      unit: "KG",
      byWeight: true,
      lot: Math.max(0.5, p?.lot ?? 0.5),
    };
  if (p?.content)
    return { ...p.content, byWeight: false, lot: Math.max(1, p.lot ?? 1) };
  const c = contentPerUnit(st);
  if (c && (c.unit === "KG" || c.unit === "L"))
    return {
      qty: c.qty,
      unit: c.unit,
      byWeight: false,
      lot: Math.max(1, p?.lot ?? 1),
    };
  if (p?.size)
    return { ...p.size, byWeight: false, lot: Math.max(1, p?.lot ?? 1) };
  return { qty: 1, unit: "PCS", byWeight: false };
}

/** Sales units to order for `need`, plus the "why" maths. */
export function salesQty(
  need: Amt,
  pack: Amt & { byWeight: boolean; lot?: number },
): { qty: number; text: string; note?: string } {
  let q = need.qty;
  let note: string | undefined;
  if (need.unit !== pack.unit) {
    if (need.unit !== "PCS" && pack.unit !== "PCS")
      note = "1 l counted as 1 kg";
    else {
      // pieces vs a weight/volume pack: we cannot know how many pieces a pack holds, so order 1 and flag it
      return {
        qty: 1,
        text: `1 × ${fmtAmt(pack)}`,
        note: "pieces per pack unknown, check the amount",
      };
    }
  }
  if (pack.byWeight) {
    const lot = pack.lot ?? 0.5;
    const qty = Math.max(lot, Math.ceil(q / lot - 1e-9) * lot);
    return { qty, text: `${fmtAmt({ qty, unit: "KG" })} (sold by kg)`, note };
  }
  const lot = pack.lot ?? 1;
  const qty = Math.max(lot, Math.ceil(q / pack.qty / lot - 1e-9) * lot);
  return { qty, text: `${qty} × ${fmtAmt(pack)}`, note };
}

// ---------- deterministic fallback planner (no ANTHROPIC_API_KEY, or the LLM failed) ----------
type Tpl = {
  item: string;
  per: number;
  unit: "g" | "ml" | "pcs";
  skus: string[];
};
const FALLBACK_MENU: {
  id: string;
  name: string;
  basis: string;
  diet: string[];
  items: Tpl[];
}[] = [
  {
    id: "salmon-soup",
    name: "Salmon soup",
    basis: "2.5 dl soup, 140 g salmon each",
    diet: ["lactose-free"],
    items: [
      {
        item: "salmon fillet",
        per: 140,
        unit: "g",
        skus: ["461814", "462150", "461883", "461884", "461907"],
      },
      {
        item: "potatoes",
        per: 150,
        unit: "g",
        skus: ["460478", "460078", "460586", "460651"],
      },
      {
        item: "cooking cream, lactose free",
        per: 60,
        unit: "ml",
        skus: ["464249", "464396", "469162", "463797"],
      },
      {
        item: "onion",
        per: 30,
        unit: "g",
        skus: ["460351", "460303", "462903"],
      },
      { item: "dill", per: 3, unit: "g", skus: ["460437", "468087", "463024"] },
      { item: "fish bouillon", per: 2, unit: "g", skus: ["463449", "473823"] },
    ],
  },
  {
    id: "rye-bread",
    name: "Rye bread with butter and cheese",
    basis: "1 slice (85 g), 10 g butter, 20 g cheese each",
    diet: [],
    items: [
      {
        item: "rye bread",
        per: 85,
        unit: "g",
        skus: ["461578", "464429", "468630"],
      },
      {
        item: "butter",
        per: 10,
        unit: "g",
        skus: ["464411", "475797", "476731"],
      },
      {
        item: "cheese, lactose free",
        per: 20,
        unit: "g",
        skus: ["462616", "463924", "473510"],
      },
    ],
  },
  {
    id: "blueberry-pie",
    name: "Blueberry pie with vanilla sauce",
    basis: "1 slice: 60 g blueberries, 112 g pastry, 60 ml sauce",
    diet: ["lactose-free"],
    items: [
      {
        item: "blueberries",
        per: 60,
        unit: "g",
        skus: ["461154", "460649", "465273", "461043"],
      },
      {
        item: "short crust pastry",
        per: 112,
        unit: "g",
        skus: ["464159", "466442", "475223", "469075", "460760"],
      },
      {
        item: "vanilla sauce, lactose free",
        per: 60,
        unit: "ml",
        skus: ["462524", "464128", "464830", "464012"],
      },
    ],
  },
];
const FALLBACK_ASSUMED = [
  "salt",
  "white pepper",
  "allspice",
  "bay leaf",
  "sugar",
  "wheat flour",
  "rapeseed oil",
  "water",
];

export function fallbackDraft(
  request: string,
  people?: number,
): Draft & { needs: Need[] } {
  const milk = request.match(
    /(\d[\d\s,.]*)\s*(l|litres?|liters?|litraa?)\b[^.]*milk|milk[^.]*?(\d[\d\s,.]*)\s*(l|litres?|liters?)\b/i,
  );
  if (milk) {
    const litres = Number((milk[1] ?? milk[3]).replace(/[\s,]/g, "")) || 1000;
    return {
      people: people ?? 0,
      dishes: [],
      needs: [
        {
          id: "milk",
          dishId: null,
          item: "lactose-free milk",
          queries: ["lactose free milk"],
          perPortion: null,
          perPortionUnit: null,
          totalQty: litres,
          totalUnit: "l",
          diet: ["lactose-free"],
          pinned: ["464073", "464201", "463380", "464119"],
        },
      ],
      assumed: [],
    };
  }
  const n =
    people ??
    (Number(
      request.match(
        /(\d+)\s*(people|persons|guests|pax|hengelle|henkeä|portions)/i,
      )?.[1],
    ) ||
      50);
  const needs: Need[] = [];
  for (const d of FALLBACK_MENU)
    for (const t of d.items) {
      const tot = t.per * n;
      needs.push({
        id: `${d.id}:${t.item.split(",")[0].replace(/\s+/g, "-")}`,
        dishId: d.id,
        item: t.item,
        queries: [t.item],
        perPortion: t.per,
        perPortionUnit: t.unit,
        totalQty: t.unit === "pcs" ? tot : r2(tot / 1000),
        totalUnit: t.unit === "g" ? "kg" : t.unit === "ml" ? "l" : "pcs",
        diet: [],
        pinned: t.skus,
      });
    }
  return {
    people: n,
    dishes: FALLBACK_MENU.map((d) => ({
      id: d.id,
      name: d.name,
      portions: n,
      basis: d.basis,
      diet: d.diet as Draft["dishes"][number]["diet"],
    })),
    needs,
    assumed: FALLBACK_ASSUMED,
  };
}

// ---------- candidates (local catalogue, never the Valio API) ----------
const MAX_CANDIDATES = 12;
export function candidatesFor(need: Need, diet: string[]): Product[] {
  if (need.pinned)
    return need.pinned.map(getProduct).filter((p): p is Product => !!p);
  const out = new Map<string, Product>();
  const qs = [...need.queries, need.item].filter(Boolean).slice(0, 4);
  for (const q of qs) {
    for (const h of search(q, { limit: 40 })) {
      const p = getProduct(h.id);
      if (!p || NONFOOD.test(p.cat) || !fits(p, diet) || out.has(p.id))
        continue;
      out.set(p.id, p);
      if (
        out.size >=
        Math.ceil((MAX_CANDIDATES * (qs.indexOf(q) + 1)) / qs.length)
      )
        break;
    }
  }
  return [...out.values()].slice(0, MAX_CANDIDATES);
}
const toCandidate = (p: Product): Candidate => ({
  id: p.id,
  name: p.en || p.fi,
  brand: p.brand,
  cat: catLabel(p.cat),
  size: p.size ? fmtAmt(p.size) : undefined,
  claims: p.claims.slice(0, 4),
  contains: allergenNames(p.contains),
});

// ---------- lines, issues, options ----------
const dayLabel = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const timeLabel = (t: string) =>
  new Date(t).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Helsinki",
  });

function issueFor(
  st: StockLine,
  qty: number,
  date: string,
): Omit<Issue, "options"> | undefined {
  // Cut-off first: the item exists and has a date, but ordering for that date is closed (its own issue).
  if (st.cutoffPassed && st.availableDate && st.status !== "no_price")
    return {
      kind: "cutoff",
      text: `Ordering is closed for ${dayLabel(date)}: cut-off ${st.closingTime ? timeLabel(st.closingTime) : ""} passed${st.logistic === "Terminal" ? " (supplier item)" : ""}.`,
    };
  if (!st.deliverable)
    return {
      kind: "unavailable",
      text:
        st.error === "no price" && st.availableDate
          ? `No price for you on ${dayLabel(date)}.`
          : `No delivery date for ${dayLabel(date)}.`,
    };
  if (st.cutoffPassed)
    return {
      kind: "cutoff",
      text: `Ordering is closed for ${dayLabel(date)}: cut-off ${st.closingTime ? timeLabel(st.closingTime) : ""} passed${st.logistic === "Terminal" ? " (supplier item)" : ""}.`,
    };
  if (st.available != null && st.available < qty)
    return {
      kind: "short",
      text: `Only ${st.available} ${st.salesUnit || "units"} available for ${dayLabel(date)}, you need ${qty}.`,
    };
  return undefined;
}
const orderable = (st: StockLine, qty: number) =>
  st.deliverable &&
  !st.cutoffPassed &&
  (st.available == null || st.available >= qty);

type Group = { sku: string; needs: Need[]; ranked: string[] };

/** Catalogue storage label is authoritative; numeric temp codes are undocumented. */
export function isFrozenProduct(
  p?: Pick<Product, "labels" | "en" | "fi" | "sv">,
): boolean {
  if (!p) return false;
  if (p.labels.length)
    return (
      p.labels.includes("freezeTemperature") &&
      !p.labels.some((label) => /^(?:warm|cool)Temperature$/.test(label))
    );
  return /\b(?:frozen|deep[ -]?frozen|deepfrost|FRO)\b/i.test(
    [p.en, p.fi, p.sv].join(" "),
  );
}

function makeLine(
  g: Group,
  st: StockLine,
  people: number,
  dishes: Dish[],
): BasketLine & { _need: Amt; _note?: string } {
  const p = getProduct(g.sku);
  const pack = packOf(st, p);
  const sum: Amt = { ...needAmt(g.needs[0]) };
  for (const n of g.needs.slice(1)) sum.qty = r2(sum.qty + needAmt(n).qty);
  const sq = salesQty(sum, pack);
  const parts = g.needs.map((n) => {
    const per = perPortionText(n);
    const portions = dishes.find((d) => d.id === n.dishId)?.portions ?? people;
    return per && portions
      ? `${portions} × ${per} = ${fmtAmt(needAmt(n))}`
      : fmtAmt(needAmt(n));
  });
  const why = `${parts.join(" + ")} → ${sq.text}${sq.note ? ` (${sq.note})` : ""}`;
  return {
    id: "",
    dishId: g.needs[0].dishId,
    needIds: g.needs.map((n) => n.id),
    sku: g.sku,
    name: p?.en || p?.fi || g.sku,
    brand: p?.brand ?? "",
    qty: sq.qty,
    pack: pack.byWeight ? "by kg" : fmtAmt(pack),
    why,
    stock: st,
    requiredDiet: [
      ...new Set(
        g.needs.flatMap((n) => [
          ...n.diet,
          ...(dishes.find((d) => d.id === n.dishId)?.diet ?? []),
        ]),
      ),
    ],
    quantityIssue:
      sq.note ??
      (!contentPerUnit(st) &&
      !p?.content &&
      !pack.byWeight &&
      sum.unit !== "PCS"
        ? "Pack contents are not verified by pricing/comparison data."
        : undefined),
    requestedAmount: sum,
    overbuy:
      sum.unit === pack.unit ? r2(sq.qty * pack.qty - sum.qty) : undefined,
    total: r2(sq.qty * st.price),
    contains: allergenNames(p?.contains ?? []),
    claims: p?.claims ?? [],
    frozen: isFrozenProduct(p),
    reliability: p?.rel ?? undefined,
    co2: p?.co2 ?? undefined,
    image: p?.image ?? undefined,
    usedIn:
      g.needs.length > 1
        ? [
            ...new Set(
              g.needs.map(
                (n) => dishes.find((d) => d.id === n.dishId)?.name ?? n.item,
              ),
            ),
          ]
        : undefined,
    _need: sum,
    _note: sq.note,
  };
}

function optionFor(
  sku: string,
  st: StockLine,
  need: Amt,
  base: BasketLine,
  people: number,
  dishes: Dish[],
  needs: Need[],
): Option {
  const l = makeLine({ sku, needs, ranked: [] }, st, people, dishes);
  const p = getProduct(sku);
  const extra = (p?.contains ?? []).filter(
    (c) => !(getProduct(base.sku)?.contains ?? []).includes(c),
  );
  const bits = [
    extra.length
      ? `adds ${allergenNames(extra).join(", ") || extra.join(", ")}`
      : "no additional declared allergens; not a free-from guarantee",
    st.logistic === "Terminal"
      ? `supplier item, available from ${dayLabel(st.availableDate!)}`
      : `in stock, available from ${dayLabel(st.availableDate!)}`,
    p?.rel != null
      ? `${Math.round(p.rel * 100)} % on time`
      : "no on-time history",
    st.comparisonPrice
      ? `${eur(st.comparisonPrice)}/${(st.comparisonUnit ?? "").toLowerCase()}`
      : `${eur(st.price)}/${st.salesUnit}`,
  ];
  return {
    sku,
    name: l.name,
    reason: bits.join(" · "),
    delta: r2(l.total - base.total),
    quantityIssue: l.quantityIssue,
    qty: l.qty,
    pack: l.pack,
    why: l.why,
    total: l.total,
    stock: st,
    contains: l.contains,
    frozen: l.frozen,
  };
}

/** Allergen safety → deliverable → established preference (S48) → on-time reliability → price → CO2.
 *  Only orderable options survive; prohibited products are never proposed. */
export function rankOptions(
  opts: Option[],
  baseContains: string[],
  memory?: { customer: string; forSku: string },
): Option[] {
  const tier = new Map<string, number>();
  if (memory)
    for (const o of opts) {
      o.preference = preferenceOf(memory.customer, o.sku, memory.forSku);
      tier.set(o.sku, PREFERENCE_TIER[o.preference.status]);
    }
  const pref = (o: Option) => tier.get(o.sku) ?? 0;
  const risk = (o: Option) =>
    o.contains.filter((c) => !baseContains.includes(c)).length;
  const rel = (o: Option) =>
    Math.round((getProduct(o.sku)?.rel ?? 0) * 20) / 20;
  const co2 = (o: Option) => getProduct(o.sku)?.co2 ?? 99;
  return opts
    .filter(
      (o) => orderable(o.stock, o.qty) && pref(o) < PREFERENCE_TIER.prohibited,
    )
    .sort(
      (a, b) =>
        risk(a) - risk(b) ||
        pref(a) - pref(b) ||
        rel(b) - rel(a) ||
        a.total - b.total ||
        co2(a) - co2(b),
    )
    .slice(0, 3);
}

// ---------- totals + mandate ----------
export const isOpen = (l: BasketLine) => !!l.issue && !l.issue.decided;
export function recompute(b: Basket): Basket {
  for (const line of b.lines) if (line.comparison) refreshComparison(b, line);
  for (const l of b.lines) {
    const p = packOf(l.stock, getProduct(l.sku));
    if (l.requestedAmount?.unit === p.unit)
      l.overbuy = r2(l.qty * p.qty - l.requestedAmount.qty);
  }
  const live = b.lines.filter((l) => l.qty > 0 && !isOpen(l));
  b.total = r2(live.reduce((s, l) => s + l.total, 0));
  b.totalWithVat = r2(
    live.reduce((s, l) => s + l.qty * l.stock.priceWithTax, 0),
  );
  const open = b.lines.filter(isOpen);
  b.openIssues = open.length;
  b.totalIfAccepted = r2(
    b.total + open.reduce((s, l) => s + (l.issue!.options[0]?.total ?? 0), 0),
  );
  const closes = live
    .map((l) => l.stock.closingTime)
    .filter((t): t is string => !!t && Date.parse(t) > Date.now())
    .sort();
  b.pricesHeldUntil = closes[0] ?? null;
  b.rules = getMandate(b.customer);
  b.mandate = evaluate(b.rules, {
    total: b.total,
    openSwaps: open.map((l) => ({ name: l.name, text: l.issue!.text })),
    undecidedBy: b.lines
      .filter((l) => l.issue?.decided && l.issue.decidedBy?.startsWith("agent"))
      .map((l) => `${l.issue!.decidedBy} (${l.name})`),
    dailySoFar: dailySoFar(b.customer, b.id),
    substituteIncreases: b.lines
      .filter((l) => l.qty > 0 && l.replaced)
      .map((l) => ({
        name: l.name,
        percent: l.replaced!.originalTotal
          ? 100 * (l.total / l.replaced!.originalTotal - 1)
          : Infinity,
      })),
    deliveryLabel: dayLabel(b.date),
    stockToConfirm: stockToConfirm(b),
  });
  const checks = blockingChecks(b);
  if (checks.length)
    b.mandate = {
      state: "needs_your_ok",
      reasons: checks.map((c) => c.message),
    };
  // S48 purchase memory: labels only (never facts); permission offers are derived from the record each time.
  for (const l of b.lines) {
    l.preference = preferenceOf(b.customer, l.sku, l.replaced?.sku);
    if (l.issue && !l.issue.decided)
      for (const o of l.issue.options)
        o.preference = preferenceOf(b.customer, o.sku, l.sku);
    const from = l.replaced?.sku;
    const n =
      from && l.issue?.decided === l.sku
        ? acceptedCount(b.customer, from, l.sku)
        : 0;
    if (from && n >= 3 && !activePermission(b.customer, from, l.sku))
      l.offerPermission = {
        fromSku: from,
        fromName: l.replaced!.name,
        toSku: l.sku,
        toName: l.name,
        accepted: n,
      };
    else delete l.offerPermission;
  }
  b.summary = basketSummary(b);
  return b;
}

// ---------- the planner ----------
export type BasketRequest = {
  request: string;
  people?: number;
  date: string;
  customer?: string;
  items?: PurchaseItem[];
  delivery?: { placeId: string; address: string; time: string };
  forbiddenAllergens?: string[];
};

/** Reject structurally valid LLM plans that silently leave part of the menu unpurchased. */
export function draftCompletenessIssues(draft: Draft): string[] {
  const issues: string[] = [];
  const dishIds = new Set(draft.dishes.map((d) => d.id));
  const positive = draft.needs.filter(
    (n) => Number.isFinite(n.totalQty) && n.totalQty > 0,
  );
  if (!positive.length)
    issues.push("No positive purchasing needs were provided");
  for (const dish of draft.dishes)
    if (!positive.some((n) => n.dishId === dish.id))
      issues.push(
        "Missing purchasing needs for " + dish.name + " (" + dish.id + ")",
      );
  for (const need of draft.needs) {
    if (!Number.isFinite(need.totalQty) || need.totalQty <= 0)
      issues.push("Need " + need.id + " must have a positive totalQty");
    if (
      need.dishId === null ? draft.dishes.length > 0 : !dishIds.has(need.dishId)
    )
      issues.push(
        "Need " +
          need.id +
          " must reference a valid dish; dishId null is only for product orders without dishes",
      );
  }
  return issues;
}

export async function buildBasket(req: BasketRequest): Promise<Basket> {
  const id = newId("b");
  const customer = req.customer || "123";
  audit(id, "buyer", "request", `"${req.request}" for ${dayLabel(req.date)}`, {
    people: req.people ?? null,
    customer,
  });

  // 1. dishes + needs
  const intent = purchasingIntent(req.request, req.items);
  const items =
    req.items ??
    (intent === "DIRECT_PURCHASE" ? parsePurchaseItems(req.request) : []);
  if (intent === "DIRECT_PURCHASE" && !items.length)
    throw new HttpError(
      400,
      "Please specify product quantities and units (for example 20 l milk), or provide structured items.",
    );
  const reorder =
    intent === "REORDER" ? reorderDraft(customer, req.request) : null;
  if (intent === "REORDER" && !reorder)
    throw new HttpError(
      400,
      "There is no purchase history for this account yet, so there is no usual order to repeat. Ask for the products you need instead.",
    );
  if (reorder && !reorder.draft.needs.length)
    throw new HttpError(
      400,
      "No usual products match that request. Ask for the products you need instead.",
    );
  const llm = intent === "DIRECT_PURCHASE" || reorder ? null : getLlm();
  let planner: Basket["planner"] = "fallback";
  let plannerNote: string | undefined = llm
    ? undefined
    : "No ANTHROPIC_API_KEY: deterministic demo planner (recipe templates).";
  let draft: Draft & { needs: Need[] };
  if (llm) {
    try {
      draft = await llm.draft(req.request, req.people, req.date);
      planner = "llm";
    } catch (e) {
      plannerNote = `Claude planner failed (${(e as Error).message.slice(0, 120)}), used the demo planner instead.`;
      draft = fallbackDraft(req.request, req.people);
    }
  } else
    draft = reorder
      ? reorder.draft
      : intent === "DIRECT_PURCHASE"
        ? directDraft(items)
        : fallbackDraft(req.request, req.people);
  // Validate before catalogue lookup or any price/availability call, including custom Llm implementations.
  if (planner === "llm" && llm) {
    let missing = draftCompletenessIssues(draft);
    if (missing.length) {
      audit(
        id,
        "gateway",
        "plan_retry",
        "Incomplete menu plan; retrying before any product lookup",
        { issues: missing },
      );
      try {
        draft = await llm.draft(
          req.request +
            "\n\nREPAIR INCOMPLETE PLAN: " +
            missing.join("; ") +
            ". Return the full corrected plan, not a patch. Every approved dish/category needs its own positive purchasing needs, including drinks, snacks and fillings. Keep all approved categories and reference valid dish ids.",
          req.people,
          req.date,
        );
      } catch {
        throw new HttpError(
          502,
          "Could not complete the approved menu after one retry. No products were looked up or ordered; please retry.",
        );
      }
      missing = draftCompletenessIssues(draft);
      if (missing.length)
        throw new HttpError(
          502,
          "Could not complete the approved menu after one retry: " +
            missing.join("; ") +
            ". No products were looked up or ordered; please retry.",
        );
    }
  }
  const people = req.people ?? draft.people;
  const dishes: Dish[] = draft.dishes.map((d) => ({
    ...d,
    portions: d.portions || people,
  }));
  audit(
    id,
    "assistant",
    "plan",
    `${planner === "llm" ? "Claude" : "Demo planner"}: ${dishes.length} dishes, ${draft.needs.length} ingredients, ${draft.assumed.length} pantry basics assumed`,
    {
      planner,
      dishes: dishes.map((d) => `${d.name} × ${d.portions}`),
      assumed: draft.assumed,
    },
  );

  // 2. candidates from the local catalogue (diet filter per dish)
  const notes: string[] = [...(reorder?.notes ?? [])];
  const cands = new Map<string, Product[]>();
  for (const n of draft.needs) {
    const diet = [
      ...new Set([
        ...(dishes.find((d) => d.id === n.dishId)?.diet ?? []),
        ...n.diet,
      ]),
    ];
    if (intent === "DIRECT_PURCHASE" && draft.needs.length === 1) {
      const shortlist = comparisonShortlist(n.item, diet);
      cands.set(
        n.id,
        shortlist.ids.map(getProduct).filter((p): p is Product => !!p),
      );
    } else cands.set(n.id, candidatesFor(n, diet));
  }
  const nCand = [...cands.values()].reduce((s, c) => s + c.length, 0);
  audit(
    id,
    "gateway",
    "search",
    `Local catalogue: ${nCand} candidates for ${draft.needs.length} ingredients (0 Valio API calls)`,
    {
      perNeed: Object.fromEntries(
        [...cands].map(([k, v]) => [k, v.map((p) => p.id)]),
      ),
      source: "sponsor_catalogue",
    },
  );

  // 3. pick a SKU per need (LLM ranks candidates; fallback keeps the template order)
  const ranked = new Map<string, string[]>();
  const llmRanked = new Set<string>();
  for (const n of draft.needs)
    ranked.set(
      n.id,
      (cands.get(n.id) ?? []).map((p) => p.id),
    );
  if (planner === "llm" && llm) {
    const input: PickInput[] = draft.needs
      .filter((n) => cands.get(n.id)?.length)
      .map((n) => ({
        id: n.id,
        item: n.item,
        total: fmtAmt(needAmt(n)),
        dish: dishes.find((d) => d.id === n.dishId)?.name,
        diet: [
          ...new Set([
            ...(dishes.find((d) => d.id === n.dishId)?.diet ?? []),
            ...n.diet,
          ]),
        ],
        candidates: cands.get(n.id)!.map(toCandidate),
      }));
    try {
      const picks = await llm.pick(req.request, input);
      for (const pk of picks.picks) {
        const ok = new Set(ranked.get(pk.needId) ?? []);
        ranked.set(pk.needId, pk.ranked.filter((s) => ok.has(s)).slice(0, 6));
        llmRanked.add(pk.needId);
      }
    } catch (e) {
      notes.push(
        `SKU picker failed (${(e as Error).message.slice(0, 80)}); used the best catalogue match.`,
      );
    }
  }
  // S48 ranking step 4: established preference re-orders the (already safe, diet-filtered) shortlist; stable,
  // so Claude's/the catalogue's order still breaks ties. Availability is applied after the stock call (issues).
  for (const [needId, r] of ranked)
    ranked.set(needId, rankByPreference(customer, r));
  const groups = new Map<string, Group>();
  for (const n of draft.needs) {
    const r = ranked.get(n.id) ?? [];
    if (!r.length) {
      notes.push(
        `No catalogue match for "${n.item}" (${fmtAmt(needAmt(n))}), add it by hand.`,
      );
      continue;
    }
    const g = groups.get(r[0]);
    if (g && needAmt(g.needs[0]).unit === needAmt(n).unit) g.needs.push(n);
    else groups.set(r[0], { sku: r[0], needs: [n], ranked: r });
  }
  audit(id, "assistant", "pick", `Chose ${groups.size} products`, {
    chosen: [...groups.values()].map(
      (g) => `${g.sku} for ${g.needs.map((n) => n.item).join(" + ")}`,
    ),
  });

  // 4. ONE price/stock call for all chosen SKUs
  const comparing =
    intent === "DIRECT_PURCHASE" &&
    draft.needs.length === 1 &&
    groups.size === 1;
  const sc = await checkStock(
    comparing
      ? [...cands.values()].flatMap((ps) => ps.map((p) => p.id))
      : [...groups.keys()],
    req.date,
    customer,
    { fresh: true },
  );
  const stock = new Map(sc.lines.map((l) => [l.sku, l]));
  let apiCalls = sc.calls;
  audit(
    id,
    "gateway",
    "stock",
    `Price + availability for ${sc.skus} products on ${dayLabel(req.date)} (${sc.calls} API calls)`,
    {
      calls: sc.calls,
      skus: sc.skus,
      checkedAt: sc.checkedAt,
      source: sc.source,
      snapshot: sc.lines.map((s) => ({
        stock: s,
        catalogue: getProduct(s.sku),
      })),
    },
  );
  const lines = [...groups.values()].map((g, i) => {
    const l = makeLine(g, stock.get(g.sku)!, people, dishes);
    l.id = `l${i + 1}`;
    const iss = issueFor(l.stock, l.qty, req.date);
    if (iss) l.issue = { ...iss, options: [] };
    return { l, g };
  });

  // 5. issues: alternatives (other ranked candidates), stock-checked in ONE extra call
  const chosen = new Set(groups.keys());
  const alt = new Map<string, string[]>();
  const ctx = new Map<string, LineCtx>();
  for (const { l, g } of lines) {
    const pool = [
      ...g.ranked.slice(1),
      ...(g.needs[0].pinned || llmRanked.has(g.needs[0].id)
        ? [] // Claude already said which candidates genuinely fit
        : (cands.get(g.needs[0].id) ?? []).map((p) => p.id)),
    ];
    alt.set(
      l.id,
      [...new Set(pool)].filter((s) => !chosen.has(s)).slice(0, 10),
    );
    ctx.set(l.id, {
      needs: g.needs.map((n) => ({ ...n })),
      pool: alt.get(l.id)!,
    });
  }
  basketCtx.set(id, ctx);
  const withIssue = lines.filter((x) => x.l.issue);
  if (withIssue.length && !comparing) {
    const altSkus = [...new Set([...alt.values()].flat())];
    if (altSkus.length) {
      const sc2 = await checkStock(altSkus, req.date, customer, {
        fresh: true,
      });
      apiCalls += sc2.calls;
      const st2 = new Map(sc2.lines.map((x) => [x.sku, x]));
      for (const { l, g } of withIssue) {
        const opts = (alt.get(l.id) ?? []).map((s) =>
          optionFor(s, st2.get(s)!, l._need, l, people, dishes, g.needs),
        );
        l.issue!.options = rankOptions(
          opts,
          getProduct(l.sku)?.contains ?? [],
          { customer, forSku: l.sku },
        );
      }
      audit(
        id,
        "gateway",
        "alternatives",
        `${withIssue.length} problems; checked ${sc2.skus} alternatives in ${sc2.calls} API calls`,
        {
          problems: withIssue.map(({ l }) => `${l.name}: ${l.issue!.text}`),
          calls: sc2.calls,
        },
      );
    }
    for (const { l } of withIssue)
      if (!l.issue!.options.length)
        l.issue!.text += " No deliverable alternative found.";
  }
  for (const { l } of lines) if (l._note) notes.push(`${l.name}: ${l._note}.`);

  const basket: Basket = {
    id,
    customer,
    request: req.request,
    people,
    date: req.date,
    planner,
    plannerNote:
      intent === "DIRECT_PURCHASE"
        ? "Structured direct purchase; no menu generation."
        : reorder
          ? reorder.plannerNote
          : plannerNote,
    intent,
    factSource: sc.source,
    delivery: req.delivery
      ? {
          placeId: req.delivery.placeId,
          address: req.delivery.address,
          time: req.delivery.time,
        }
      : undefined,
    forbiddenAllergens: [
      ...new Set([
        ...(req.forbiddenAllergens ?? []),
        ...requestAllergens(req.request),
      ]),
    ],
    requestBudgetEur:
      Number(
        req.request.match(
          /budget\s*(?:of\s*)?(?:\u20ac|EUR)?\s*(\d+(?:\.\d+)?)/i,
        )?.[1],
      ) || undefined,
    requiredDiet:
      intent === "DIRECT_PURCHASE"
        ? [...new Set(draft.needs.flatMap((n) => n.diet))]
        : [],
    validationGaps: notes.filter((n) => /No catalogue match/i.test(n)),
    dishes,
    lines: lines.map(({ l }) => {
      const { _need, _note, ...rest } = l;
      return rest;
    }),
    assumed: draft.assumed,
    notes,
    checkedAt: sc.checkedAt,
    apiCalls,
    total: 0,
    totalWithVat: 0,
    openIssues: 0,
    totalIfAccepted: 0,
    pricesHeldUntil: null,
    rules: getMandate(customer),
    mandate: { state: "needs_your_ok", reasons: [] },
    createdAt: new Date().toISOString(),
  };
  if (comparing) {
    const need = draft.needs[0];
    const requested = needAmt(need);
    const candidateLines = (cands.get(need.id) ?? []).map((p) => {
      const { _need, _note, ...line } = makeLine(
        { sku: p.id, needs: [need], ranked: [] },
        stock.get(p.id)!,
        people,
        dishes,
      );
      line.id = "l1";
      const issue = issueFor(line.stock, line.qty, req.date);
      if (issue) line.issue = { ...issue, options: [] };
      return line;
    });
    const candidates = rankComparedProducts(basket, candidateLines, requested);
    const recommended = candidates[0];
    if (recommended) {
      const selected = structuredClone(recommended.line);
      const comparison: ProductComparison = {
        query: need.item,
        requested,
        catalogueMatches: comparisonShortlist(need.item, need.diet)
          .catalogueMatches,
        checkedCount: candidates.length,
        limit: COMPARISON_LIMIT,
        checkedAt: sc.checkedAt,
        source: sc.source ?? "unknown",
        recommendedSku: selected.sku,
        ranking:
          "Verified fulfillment, purchase history, rounded order total, overbuy, delivery reliability, SKU",
        candidates,
      };
      selected.comparison = comparison;
      basket.lines = [selected];
      ctx.set(selected.id, {
        needs: [need],
        pool: candidates
          .filter((c) => c.line.sku !== selected.sku)
          .map((c) => c.line.sku),
      });
      audit(
        id,
        "gateway",
        "comparison",
        comparisonReason(comparison, selected.sku),
        structuredClone(comparison),
      );
    }
  }
  recompute(basket);
  baskets.set(id, basket);
  if (!comparing) autoSwapSameUse(basket);
  for (const decision of explainPurchase(basket).products)
    audit(
      id,
      "gateway",
      "choice",
      [
        decision.selection,
        decision.quantity,
        decision.price,
        decision.facts,
        decision.tradeoffs,
        ...decision.constraints,
      ]
        .filter(Boolean)
        .join(" "),
      decision,
    );
  audit(
    id,
    "gateway",
    "mandate",
    `${basket.mandate.state}: ${basket.mandate.reasons.join(" ")}`,
    { total: basket.total, apiCalls },
  );
  return basket;
}

// ---------- same-use rule (mandate.autoSwapSameUse) ----------
export const SAME_USE_BY = "gateway (same-use rule)";
export const BEST_REPLACEMENT_BY = "gateway (best replacement)";
const FISH_MEAT = /^(18|41(70|71|72|73))/; // fresh fish/meat, frozen fish/meat (same groups as MEAT_FISH)
/** Same product group, no additional declared allergens, verified quantities and current facts,
 * no fish/meat, within the customer's configured percentage increase. Final safety checks still apply. */
export function isSameUse(
  orig: BasketLine,
  o: Option,
  maxIncreasePct = 20,
): boolean {
  const a = getProduct(orig.sku),
    b = getProduct(o.sku);
  if (
    !a ||
    !b ||
    o.quantityIssue ||
    o.stock.available == null ||
    o.stock.available < o.qty ||
    !o.stock.customerPrice ||
    !o.stock.deliverable ||
    o.stock.cutoffPassed
  )
    return false;
  if (FISH_MEAT.test(a.cat) || FISH_MEAT.test(b.cat)) return false;
  if (a.cat.slice(0, 3) !== b.cat.slice(0, 3)) return false;
  if (o.contains.some((c) => !orig.contains.includes(c))) return false;
  if (
    b.mayContain.some(
      (c) => !a.contains.includes(c) && !a.mayContain.includes(c),
    )
  )
    return false;
  return o.delta <= (maxIncreasePct / 100) * Math.max(orig.total, 0);
}
/** An explicit standing permission (S48) for this exact pair, within its own price ceiling, with no new declared
 *  allergen risk and a verified customer price. Final validation and the mandate still apply afterwards. */
export function permittedSwap(customer: string, orig: BasketLine, o: Option) {
  const perm = activePermission(customer, orig.sku, o.sku);
  if (!perm) return undefined;
  const a = getProduct(orig.sku),
    p = getProduct(o.sku);
  if (
    !a ||
    !p ||
    o.quantityIssue ||
    !o.stock.customerPrice ||
    !orderable(o.stock, o.qty)
  )
    return undefined;
  if (o.contains.some((c) => !orig.contains.includes(c))) return undefined;
  if (
    p.mayContain.some(
      (c) => !a.contains.includes(c) && !a.mayContain.includes(c),
    )
  )
    return undefined;
  if (
    orig.total > 0
      ? o.total > orig.total * (1 + perm.maxIncreasePct / 100) + 1e-9
      : o.total > 0
  )
    return undefined;
  return perm;
}
/** Hard constraints a substitute must provably meet before it can be chosen without the buyer: no forbidden
 *  allergen declared (contains or may contain), explicit free-from evidence for each, and the line's diet. */
export function breaksHardRule(b: Basket, l: BasketLine, sku: string): boolean {
  const p = getProduct(sku);
  if (!p) return true;
  const forbidden = [
    ...new Set(
      [...b.rules.forbiddenAllergens, ...(b.forbiddenAllergens ?? [])].map(
        allergenCode,
      ),
    ),
  ];
  if (
    forbidden.some(
      (a) =>
        p.contains.includes(a) ||
        p.mayContain.includes(a) ||
        !p.freeFromAllergen?.includes(a),
    )
  )
    return true;
  const diet =
    l.requiredDiet ??
    (b.intent === "DIRECT_PURCHASE"
      ? (b.requiredDiet ?? [])
      : (b.dishes.find((d) => d.id === l.dishId)?.diet ?? []));
  return !fits(p, diet);
}
export function autoSwapSameUse(b: Basket): void {
  if (!b.rules.substitutionsPermitted) return;
  for (const l of b.lines) {
    if (!l.issue || l.issue.decided) continue;
    // 1. explicit permission for the pair (first permitted option in preference/rank order).
    // Never silently pick a substitute that could break a hard allergen or diet rule: the buyer decides.
    const permitted = l.issue.options
      .filter((o) => !breaksHardRule(b, l, o.sku))
      .map((o) => ({ o, perm: permittedSwap(b.customer, l, o) }))
      .find((x) => x.perm);
    if (permitted) {
      editLine(b.id, l.id, {
        chooseOption: permitted.o.sku,
        by: `policy:${permitted.perm!.id}`,
      });
      continue;
    }
    // 2. account-wide same-use rule (off for Bistro Kallio)
    const o = l.issue.options[0];
    if (
      b.rules.autoSwapSameUse &&
      o &&
      o.preference?.status !== "rejected" &&
      !breaksHardRule(b, l, o.sku) &&
      isSameUse(l, o, b.rules.maxSubstituteIncreasePct)
    ) {
      editLine(b.id, l.id, { chooseOption: o.sku, by: SAME_USE_BY });
      continue;
    }
    // 3. CONTRACT S51: pre-select the best replacement the buyer would otherwise pick by hand. Only unavailable or
    //    past-cut-off lines; only a verified price, stock that covers the quantity, a delivery date, no hard-rule risk,
    //    not rejected before, within the price ceiling. The buyer can change or undo it; validation still applies.
    if (b.rules.autoPickReplacement === false || l.issue.kind === "short") continue;
    // Price ceiling like the same-use rule: +maxSubstituteIncreasePct % or +25 EUR, whichever is larger.
    const ceiling = Math.max((b.rules.maxSubstituteIncreasePct / 100) * Math.max(l.total, 0), 25);
    const safe = l.issue.options.filter(
      (x) =>
        x.preference?.status !== "rejected" &&
        !x.quantityIssue &&
        x.stock.price > 0 &&
        x.stock.available != null &&
        orderable(x.stock, x.qty) &&
        x.delta <= ceiling + 1e-9 &&
        !breaksHardRule(b, l, x.sku),
    );
    // Contract-priced options first; a list-priced pick still carries the price check to validation.
    const best = safe.find((x) => x.stock.customerPrice) ?? safe[0];
    if (best) editLine(b.id, l.id, { chooseOption: best.sku, by: BEST_REPLACEMENT_BY });
  }
}

// ---------- edits ----------
export type LineEdit = {
  selectCandidate?: string;
  qty?: number;
  chooseOption?: string;
  included?: boolean;
  by?: string;
};
export class HttpError extends Error {
  constructor(
    public status: number,
    msg: string,
  ) {
    super(msg);
  }
}

/** A basket is frozen once it has a placed or pending order: the approver must approve exactly what they saw.
 *  Edits are allowed again only after the order is rejected (sent back). */
export function assertEditable(b: Basket): void {
  if (submitting.has(b.id))
    throw new HttpError(
      409,
      "order submission in progress; retry after validation completes",
    );
  const o = [...orders.values()].find(
    (x) => x.basketId === b.id && x.status !== "rejected",
  );
  if (o)
    throw new HttpError(
      409,
      o.status === "placed"
        ? `order ${o.id} is already placed; start a new request to change it`
        : `order ${o.id} is waiting for approval; it can't be changed until it is approved or sent back`,
    );
}

export function editLine(
  basketId: string,
  lineId: string,
  e: LineEdit,
): Basket {
  const b = baskets.get(basketId);
  if (!b) throw new HttpError(404, "basket not found");
  assertEditable(b);
  const l = b.lines.find((x) => x.id === lineId);
  if (!l) throw new HttpError(404, "line not found");
  const by = e.by || "buyer";
  if (e.selectCandidate) {
    if (e.qty != null || e.chooseOption != null || e.included != null)
      throw new HttpError(400, "selectCandidate must be used alone");
    if (!l.comparison)
      throw new HttpError(400, "No compared products for this line");
    refreshComparison(b, l);
    const c = l.comparison.candidates.find(
      (c) => c.line.sku === e.selectCandidate,
    );
    if (!c?.selectable)
      throw new HttpError(
        400,
        "Candidate is not a suitable server-quoted option",
      );
    const comparison = l.comparison;
    const previous = l.name;
    Object.assign(l, structuredClone(c.line), { id: l.id, comparison });
    delete l.replaced;
    delete l.excludedQty;
    if (!c.line.issue) delete l.issue;
    comparison.chosenBy = by;
    audit(
      b.id,
      by,
      "comparison_choice",
      `Selected ${l.name} instead of ${previous}. ${comparisonReason(comparison, l.sku)}`,
      { lineId: l.id, sku: l.sku, comparison: structuredClone(comparison) },
    );
    recompute(b);
    return b;
  }
  if (e.included != null) {
    if (
      typeof e.included !== "boolean" ||
      e.qty != null ||
      e.chooseOption != null
    )
      throw new HttpError(400, "included must be a boolean used on its own");
    if (isOpen(l))
      throw new HttpError(400, "review replacements before changing inclusion");
    if (e.included) {
      if (l.excludedQty == null) return recompute(b);
      e = { ...e, qty: l.excludedQty };
      delete l.excludedQty;
    } else {
      if (l.qty === 0) return recompute(b);
      l.excludedQty = l.qty;
      e = { ...e, qty: 0 };
    }
  }
  if (e.qty != null) {
    if (!(e.qty >= 0)) throw new HttpError(400, "qty must be >= 0");
    if (e.included !== false) delete l.excludedQty;
    const was = l.qty;
    if (l.comparison && e.included == null && e.qty > 0) {
      const pack = packOf(l.stock, getProduct(l.sku));
      l.comparison.requested = { qty: e.qty * pack.qty, unit: pack.unit };
      l.requestedAmount = { ...l.comparison.requested };
    }
    l.qty = e.qty;
    l.total = r2(l.qty * l.stock.price);
    if (
      l.issue?.kind === "short" &&
      !l.issue.decided &&
      orderable(l.stock, l.qty)
    )
      delete l.issue;
    else if (!l.issue) {
      const iss = issueFor(l.stock, l.qty, b.date);
      if (iss) l.issue = { ...iss, options: [] };
    }
    l.why =
      l.why.replace(/ · changed by .*$/, "") +
      ` · changed by ${by} from ${was} to ${l.qty}`;
    audit(b.id, by, "edit", `${l.name}: ${was} → ${l.qty}`, {
      lineId,
      sku: l.sku,
    });
  }
  if (e.chooseOption) {
    if (!l.issue) throw new HttpError(400, "this line has no issue to decide");
    const c = e.chooseOption;
    // Safe replay: do not learn twice or reset a quantity edited after this choice.
    const sameChoice = l.issue.decided === c && l.sku === c;
    if (sameChoice && l.issue.decidedBy === by) return recompute(b);
    const from = l.replaced?.sku ?? l.sku;
    if (c === "remove") {
      l.qty = 0;
      l.total = 0;
    } else if (c === "keep") {
      if (l.issue.kind !== "short")
        throw new HttpError(400, `can't keep: ${l.issue.text}`);
      if (l.stock.available != null) {
        l.qty = l.stock.available;
        l.total = r2(l.qty * l.stock.price);
      }
    } else {
      const o = l.issue.options.find((x) => x.sku === c);
      if (!o)
        throw new HttpError(400, `option ${c} is not offered for this line`);
      // S48 learning: a person's (or buyer agent's) choice is purchase memory; automatic policy/gateway swaps are not.
      // Learning never touches the mandate or permissions.
      if (!/^(policy:|gateway)/.test(by)) {
        restoreChoiceMemory(b.customer, b.id, l.id, from, []);
        const at = new Date().toISOString();
        recordPreference({
          at,
          customer: b.customer,
          kind: "substitution_accepted",
          sku: o.sku,
          forSku: from,
          basketId: b.id,
          lineId: l.id,
        });
        const first = l.issue.options[0];
        if (first && first.sku !== o.sku)
          recordPreference({
            at,
            customer: b.customer,
            kind: "substitution_rejected",
            sku: first.sku,
            forSku: from,
            basketId: b.id,
            lineId: l.id,
          });
      }
      l.replaced = l.replaced ?? {
        sku: l.sku,
        name: l.name,
        originalTotal: l.total,
      }; // re-deciding keeps the original product
      const p = getProduct(o.sku);
      if (!sameChoice)
        Object.assign(l, {
          quantityIssue: o.quantityIssue,
          sku: o.sku,
          name: o.name,
          brand: p?.brand ?? "",
          qty: o.qty,
          pack: o.pack,
          why: o.why,
          stock: o.stock,
          total: o.total,
          contains: o.contains,
          frozen: o.frozen ?? isFrozenProduct(p),
          claims: p?.claims ?? [],
          reliability: p?.rel ?? undefined,
          co2: p?.co2 ?? undefined,
          image: p?.image ?? undefined,
        });
    }
    delete l.excludedQty;
    if (c === "keep" || c === "remove")
      restoreChoiceMemory(b.customer, b.id, l.id, from, []);
    l.issue.decided = c;
    l.issue.decidedBy = by;
    audit(
      b.id,
      by,
      "swap",
      c === "remove"
        ? `Removed ${l.name}`
        : c === "keep"
          ? `Kept ${l.name} at ${l.qty}`
          : `Swapped ${l.replaced?.name} → ${l.name}`,
      {
        lineId,
        decision: c,
      },
    );
  }
  recompute(b);
  audit(
    b.id,
    "gateway",
    "mandate",
    `${b.mandate.state}: ${b.mandate.reasons.join(" ")}`,
    { total: b.total },
  );
  return b;
}

// ---------- guests rescale (CONTRACT v1.2): deterministic, no LLM ----------
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Rescale every per-portion line to `people`, re-round to whole sales units, ONE stock call for the changed
 * SKUs (plus the options of open issues). Lines that no longer fit stock get an issue; decided swaps are kept
 * (the chosen product is rescaled). Removed lines stay removed. */
export async function rescaleGuests(
  basketId: string,
  people: number,
  by = "buyer",
): Promise<Basket> {
  const b = baskets.get(basketId);
  if (!b) throw new HttpError(404, "basket not found");
  assertEditable(b);
  if (!Number.isInteger(people) || people < 1 || people > 2000)
    throw new HttpError(400, "people must be a whole number from 1 to 2000");
  const ctx = basketCtx.get(b.id);
  if (!ctx)
    throw new HttpError(409, "this basket has no planning data to rescale");
  const old = b.people;
  if (people === old) return recompute(b);

  // 1. dishes that served everyone follow the new count; sub-group dishes (e.g. 3 lactose-free) keep theirs
  const factor = new Map<string, number>();
  for (const d of b.dishes) {
    const next = d.portions === old ? people : d.portions;
    factor.set(d.id, d.portions ? next / d.portions : 1);
    d.portions = next;
  }
  for (const lc of ctx.values())
    for (const n of lc.needs) {
      const f = n.dishId
        ? (factor.get(n.dishId) ?? 1)
        : n.perPortion != null && old
          ? people / old
          : 1; // a plain product order ("1000 L milk") keeps its amount
      n.totalQty = r3(n.totalQty * f);
    }
  b.people = people;

  // 2. which lines change qty (removed lines stay removed)
  const plan = b.lines
    .filter(
      (l) =>
        l.excludedQty == null &&
        !(l.issue?.decided === "remove") &&
        ctx.has(l.id),
    )
    .map((l) => {
      const needs = ctx.get(l.id)!.needs;
      const nl = makeLine(
        { sku: l.sku, needs, ranked: [] },
        l.stock,
        people,
        b.dishes,
      );
      return { l, needs, qty: nl.qty };
    });
  const changed = plan.filter((x) => x.qty !== x.l.qty || isOpen(x.l));
  const skus = new Set<string>();
  for (const { l } of changed) {
    skus.add(l.sku);
    if (isOpen(l)) for (const o of l.issue!.options) skus.add(o.sku);
  }
  let calls = 0;
  const st = new Map<string, StockLine>();
  if (skus.size) {
    const sc = await checkStock([...skus], b.date, b.customer, { fresh: true }); // new amounts: re-check now
    calls += sc.calls;
    for (const x of sc.lines) st.set(x.sku, x);
    b.checkedAt = sc.checkedAt;
  }

  // 3. rebuild each line with the new amounts; issues follow the new qty
  const needAlt: { l: BasketLine; needs: Need[] }[] = [];
  let nChanged = 0;
  for (const { l, needs } of plan) {
    const stock = st.get(l.sku) ?? l.stock;
    const nl = makeLine(
      { sku: l.sku, needs, ranked: [] },
      stock,
      people,
      b.dishes,
    );
    const wasQty = l.qty;
    l.stock = stock;
    l.why = nl.why;
    l.usedIn = nl.usedIn;
    if (l.issue?.decided === "keep" && stock.available != null)
      l.qty = Math.min(nl.qty, stock.available);
    else l.qty = nl.qty;
    l.total = r2(l.qty * stock.price);
    if (l.qty !== wasQty) nChanged++;
    if (l.issue?.decided === "keep") continue;
    const iss = issueFor(stock, l.qty, b.date);
    if (!iss) {
      if (l.issue && !l.issue.decided) delete l.issue; // fewer guests: the shortage went away
      continue;
    }
    if (isOpen(l)) {
      // still a problem: rescale its options with the fresh stock
      const opts = l.issue!.options.map((o) =>
        optionFor(
          o.sku,
          st.get(o.sku) ?? o.stock,
          nl._need,
          l,
          people,
          b.dishes,
          needs,
        ),
      );
      l.issue = {
        ...iss,
        options: rankOptions(opts, getProduct(l.sku)?.contains ?? [], {
          customer: b.customer,
          forSku: l.sku,
        }),
      };
      if (!l.issue.options.length) needAlt.push({ l, needs });
    } else {
      // new problem (or the swapped-in product no longer fits): a fresh issue, original product kept in `replaced`
      l.issue = { ...iss, options: [] };
      needAlt.push({ l, needs });
    }
  }

  // 4. alternatives for new problems: one extra call, like the planner
  if (needAlt.length) {
    const inBasket = new Set(b.lines.map((l) => l.sku));
    const alt = new Map(
      needAlt.map(({ l }) => [
        l.id,
        (ctx.get(l.id)?.pool ?? []).filter((s) => !inBasket.has(s)),
      ]),
    );
    const altSkus = [...new Set([...alt.values()].flat())];
    if (altSkus.length) {
      const sc2 = await checkStock(altSkus, b.date, b.customer);
      calls += sc2.calls;
      const st2 = new Map(sc2.lines.map((x) => [x.sku, x]));
      for (const { l, needs } of needAlt) {
        const need = makeLine(
          { sku: l.sku, needs, ranked: [] },
          l.stock,
          people,
          b.dishes,
        )._need;
        const opts = (alt.get(l.id) ?? []).map((s) =>
          optionFor(s, st2.get(s)!, need, l, people, b.dishes, needs),
        );
        l.issue!.options = rankOptions(
          opts,
          getProduct(l.sku)?.contains ?? [],
          { customer: b.customer, forSku: l.sku },
        );
      }
    }
    for (const { l } of needAlt)
      if (!l.issue!.options.length)
        l.issue!.text += " No deliverable alternative found.";
  }
  b.apiCalls += calls;
  recompute(b);
  audit(
    b.id,
    by,
    "guests",
    `${old} → ${people} guests, ${nChanged} line${nChanged === 1 ? "" : "s"} changed (${calls} API calls)`,
    {
      from: old,
      to: people,
      changed: nChanged,
      newIssues: needAlt.map(({ l }) => `${l.name}: ${l.issue!.text}`),
      calls,
    },
  );
  autoSwapSameUse(b);
  audit(
    b.id,
    "gateway",
    "mandate",
    `${b.mandate.state}: ${b.mandate.reasons.join(" ")}`,
    {
      total: b.total,
    },
  );
  return b;
}

// Scoped recovery: checking an item never replans the basket.
export async function checkReplacements(basketId: string, lineId: string) {
  const b = baskets.get(basketId);
  if (!b) throw new HttpError(404, "basket not found");
  assertEditable(b);
  const l = b.lines.find((l) => l.id === lineId);
  const lc = basketCtx.get(b.id)?.get(lineId);
  if (!l || !lc)
    throw new HttpError(
      409,
      "Planning context unavailable; keep this item unavailable.",
    );
  const before = recipeFingerprint(b);
  const skus = [...new Set([l.sku, ...lc.pool])];
  const checked = await checkStock(skus, b.date, b.customer, { fresh: true });
  assertEditable(b);
  if (baskets.get(b.id) !== b || before !== recipeFingerprint(b))
    throw new HttpError(409, "Basket changed; reopen this item.");
  const stock = new Map(checked.lines.map((s) => [s.sku, s]));
  l.stock = stock.get(l.sku)!;
  l.total = r2(l.qty * l.stock.price);
  const issue = issueFor(l.stock, l.qty, b.date);
  if (issue) {
    const need = makeLine(
      { sku: l.sku, needs: lc.needs, ranked: [] },
      l.stock,
      b.people,
      b.dishes,
    )._need;
    l.issue = {
      ...issue,
      options: rankOptions(
        lc.pool
          .filter((s) => stock.has(s))
          .map((s) =>
            optionFor(s, stock.get(s)!, need, l, b.people, b.dishes, lc.needs),
          ),
        getProduct(l.sku)?.contains ?? [],
        { customer: b.customer, forSku: l.sku },
      ),
    };
  } else delete l.issue;
  b.checkedAt = checked.checkedAt;
  b.apiCalls += checked.calls;
  audit(
    b.id,
    "gateway",
    "alternatives",
    `Rechecked ${skus.length} shortlisted products for ${l.name}; ${l.issue?.options.length ?? 0} suitable replacements.`,
  );
  return recompute(b);
}
const recipeFingerprint = (b: Basket) =>
  JSON.stringify([b.lines, b.dishes, b.people, b.date, b.request]);
export type RecipeProposal = {
  id: string;
  from: string;
  to: string;
  before: BasketLine[];
  after: BasketLine[];
  totalBefore: number;
  totalAfter: number;
};
const recipeProposals = new Map<
  string,
  {
    basketId: string;
    fingerprint: string;
    expires: number;
    next: Basket;
    ctx: Map<string, LineCtx>;
    public: RecipeProposal;
  }
>();
export async function proposeRecipeChange(
  basketId: string,
  lineId: string,
): Promise<RecipeProposal> {
  const b = baskets.get(basketId);
  if (!b) throw new HttpError(404, "basket not found");
  assertEditable(b);
  const line = b.lines.find((l) => l.id === lineId);
  const ctx = basketCtx.get(b.id);
  const targets = [
    ...new Set(
      ctx
        ?.get(lineId)
        ?.needs.map((n) => n.dishId)
        .filter(Boolean),
    ),
  ];
  if (!line || !ctx || targets.length !== 1)
    throw new HttpError(
      409,
      "This ingredient is shared across recipes. Edit the menu to choose which recipe to change.",
    );
  const dish = b.dishes.find((d) => d.id === targets[0]);
  if (!dish || !isOpen(line))
    throw new HttpError(409, "This recipe no longer needs a replacement.");
  if (line.issue?.options.length)
    throw new HttpError(
      409,
      "Suitable product replacements are available. Review those first.",
    );
  const fingerprint = recipeFingerprint(b);
  const apple = /blueberry.*pie|pie.*blueberry/i.test(dish.name);
  const request = `Prepare ONLY ONE replacement recipe for ${dish.name}, for ${dish.portions} guests. ${apple ? "Replace it with Apple pie." : "Choose a different recipe serving the same role in the menu."} Unavailable ingredient: ${line.name}, SKU ${line.sku}; do not use it or its equivalents. Preserve all dietary and allergy requirements: ${dish.diet.join(", ")}. Original customer requirements for safety context only: ${b.request}. Return just the new single dish with its complete ingredients. Do not include other original dishes.`;
  const part = await buildBasket({
    request,
    date: b.date,
    people: dish.portions,
    customer: b.customer,
  });
  const partCtx = basketCtx.get(part.id);
  baskets.delete(part.id);
  basketCtx.delete(part.id);
  if (
    part.planner !== "llm" ||
    part.dishes.length !== 1 ||
    !partCtx ||
    !part.lines.length ||
    part.openIssues ||
    part.people !== dish.portions ||
    part.dishes[0].portions !== dish.portions ||
    dish.diet.some((d) => !part.dishes[0].diet.includes(d)) ||
    part.lines.some(
      (l) => l.sku === line.sku || !fits(getProduct(l.sku)!, dish.diet),
    ) ||
    part.notes.some((n) => /no catalogue match/i.test(n)) ||
    (apple && !/apple/i.test(part.dishes[0].name)) ||
    part.dishes[0].name.toLowerCase() === dish.name.toLowerCase()
  )
    throw new HttpError(
      422,
      "Unfortunately, no complete available alternative recipe was found.",
    );
  assertEditable(b);
  if (baskets.get(b.id) !== b || fingerprint !== recipeFingerprint(b))
    throw new HttpError(
      409,
      "Basket changed while checking the recipe. Try again.",
    );
  const next = structuredClone(b),
    nextCtx = new Map(ctx),
    before: BasketLine[] = [],
    after: BasketLine[] = [];
  next.lines = [];
  for (const old of b.lines) {
    const lc = ctx.get(old.id);
    if (!lc?.needs.some((n) => n.dishId === dish.id)) {
      next.lines.push(structuredClone(old));
      continue;
    }
    before.push(old);
    nextCtx.delete(old.id);
    const remaining = lc.needs.filter((n) => n.dishId !== dish.id);
    if (remaining.length) {
      const baseline = makeLine(
        { sku: old.sku, needs: lc.needs, ranked: [] },
        old.stock,
        b.people,
        b.dishes,
      );
      const rebuilt = makeLine(
        { sku: old.sku, needs: remaining, ranked: [] },
        old.stock,
        b.people,
        b.dishes,
      );
      const { _need, _note, ...clean } = rebuilt;
      const kept = {
        ...structuredClone(old),
        ...clean,
        id: old.id,
        qty: Math.max(0, old.qty - baseline.qty + rebuilt.qty),
      };
      kept.total = r2(kept.qty * kept.stock.price);
      if (kept.issue && !kept.issue.decided) {
        const issue = issueFor(kept.stock, kept.qty, b.date);
        if (issue) kept.issue = { ...issue, options: [] };
        else delete kept.issue;
      }
      next.lines.push(kept);
      after.push(kept);
      nextCtx.set(old.id, { ...lc, needs: remaining });
    }
  }
  const replacement = {
    ...part.dishes[0],
    id: dish.id,
    portions: dish.portions,
  };
  next.dishes = b.dishes.map((d) =>
    d.id === dish.id ? replacement : structuredClone(d),
  );
  for (const l of part.lines) {
    const id = newId("l");
    const lc = partCtx.get(l.id)!;
    const needs = lc.needs.map((n) => ({
      ...n,
      id: newId("n"),
      dishId: dish.id,
    }));
    const added = {
      ...structuredClone(l),
      id,
      dishId: dish.id,
      needIds: needs.map((n) => n.id),
      usedIn: [replacement.name],
    };
    next.lines.push(added);
    after.push(added);
    nextCtx.set(id, { ...lc, needs });
  }
  next.request += `\nApproved recipe change: replace ${dish.name} with ${replacement.name}; all other dishes stay as currently edited.`;
  next.assumed = [...new Set([...b.assumed, ...part.assumed])];
  next.apiCalls += part.apiCalls;
  recompute(next);
  const proposal = {
    id: newId("recipe"),
    from: dish.name,
    to: replacement.name,
    before: structuredClone(before),
    after: structuredClone(after),
    totalBefore: r2(before.reduce((s, l) => s + l.total, 0)),
    totalAfter: r2(after.reduce((s, l) => s + l.total, 0)),
  };
  for (const [id, p] of recipeProposals)
    if (p.expires < Date.now()) recipeProposals.delete(id);
  recipeProposals.set(proposal.id, {
    basketId: b.id,
    fingerprint,
    expires: Date.now() + 600000,
    next,
    ctx: nextCtx,
    public: proposal,
  });
  return proposal;
}
export function applyRecipeChange(
  basketId: string,
  proposalId: string,
  by = "buyer",
) {
  const b = baskets.get(basketId),
    p = recipeProposals.get(proposalId);
  if (!b || !p || p.basketId !== basketId || p.expires < Date.now())
    throw new HttpError(409, "Recipe proposal expired. Check again.");
  assertEditable(b);
  if (p.fingerprint !== recipeFingerprint(b))
    throw new HttpError(409, "Basket changed. Review a new recipe suggestion.");
  baskets.set(b.id, p.next);
  basketCtx.set(b.id, p.ctx);
  recipeProposals.delete(proposalId);
  audit(
    b.id,
    by,
    "edit",
    `Recipe changed: ${p.public.from} to ${p.public.to}. Other recipes kept.`,
    { proposalId },
  );
  return recompute(p.next);
}

// ---------- add a named product from chat (CONTRACT S37) ----------
export type AddProductInput = {
  item: string; // short product noun, e.g. "Pepsi"
  queries: string[]; // catalogue search terms
  amount: number; // how many units (pcs) or kg / l
  unit: "pcs" | "kg" | "l";
  label: string; // buyer wording, e.g. "2 bottles of Pepsi"
  dishId?: string | null; // existing dish/category it belongs to, if it fits
  category?: string | null; // new category name when nothing fits, e.g. "Drinks"
};
const DRINK =
  /\b(pepsi|cola|coke|soda|juice|mehu|water|vesi|lemonade|limonadi|sparkling|tonic|coffee|kahvi|tea|tee|milk|maito|smoothie|drink|juoma|sprite|fanta|energy)\b/i;
/** Items per sales unit from the catalogue name: "12 x Pepsi 1,5 l" / "6xVilarnau 75cl" -> 12 / 6, else 1. */
export function caseSize(p?: Product): number {
  // Leading "N x" groups multiply: "4 x 6 x Pepsi 0,33 l" = 24 cans.
  const name = p?.en || p?.fi || "";
  const m = name.match(/^\s*((?:\d{1,3}\s*[x×]\s*)+)\D/i);
  if (m)
    return Math.max(
      1,
      m[1]
        .split(/[x×]/i)
        .map((n) => Number(n.trim()))
        .filter((n) => n > 0)
        .reduce((a, n) => a * n, 1),
    );
  // Mid-name "N x size": "Sourdough bread 9 x 370g" = 9 loaves.
  const mid = name.match(
    /\b(\d{1,3})\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:g|kg|ml|cl|dl|l)\b/i,
  );
  return mid ? Math.max(1, Number(mid[1])) : 1;
}
const niceProduct = (sku: string) => {
  const p = getProduct(sku);
  const s = (p?.en || p?.fi || sku)
    .replace(/\s+/g, " ")
    .trim()
    .split(/\.\s/)[0]
    .replace(/\.$/, "");
  return s.length > 70 ? s.slice(0, 67).replace(/\s+\S*$/, "") + "…" : s;
};
const UNAVAILABLE: Record<string, string> = {
  cutoff_passed: "the order cut-off has passed",
  no_delivery: "no delivery that day",
  short: "not enough in stock",
  no_price: "no price for your account",
  not_found: "not in Valio's system",
};
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "extras";

/** Where an added product goes: the dish Claude named, else a matching category, else a new one. */
function placeFor(
  b: Basket,
  input: AddProductInput,
): { dishId: string; created?: Dish } {
  if (input.dishId && b.dishes.some((d) => d.id === input.dishId))
    return { dishId: input.dishId };
  const name =
    input.category?.trim() ||
    (DRINK.test(`${input.item} ${input.label}`) ? "Drinks" : "Extras");
  const existing = b.dishes.find(
    (d) => d.name.toLowerCase() === name.toLowerCase() || d.id === slug(name),
  );
  if (existing) return { dishId: existing.id };
  let id = slug(name);
  while (b.dishes.some((d) => d.id === id)) id += "-2";
  return {
    dishId: id,
    created: {
      id,
      name,
      portions: b.people,
      basis: "added from chat",
      diet: [],
    },
  };
}

export async function addProduct(
  basketId: string,
  input: AddProductInput,
  by = "buyer",
): Promise<{
  basket: Basket;
  line: BasketLine;
  category: string;
  createdCategory: boolean;
  /** The best match the buyer asked for, when it couldn't be delivered and an alternative was added instead. */
  unavailable?: { name: string; reason: string };
}> {
  const b = baskets.get(basketId);
  if (!b) throw new HttpError(404, "basket not found");
  assertEditable(b);
  if (!input.item?.trim()) throw new HttpError(400, "which product?");
  if (!(input.amount > 0)) throw new HttpError(400, "how many?");
  const unit = input.unit === "kg" || input.unit === "l" ? input.unit : "pcs";
  const need: Need = {
    id: newId("add"),
    dishId: null,
    item: input.item.trim(),
    queries: (input.queries ?? []).filter(Boolean).slice(0, 3),
    perPortion: null,
    perPortionUnit: null,
    totalQty: input.amount,
    totalUnit: unit,
    diet: [],
  };
  const cands = candidatesFor(need, []);
  if (!cands.length)
    throw new HttpError(404, `no catalogue match for "${input.item}"`);
  let ranked = cands.map((p) => p.id);
  let llmRanked = false;
  const llm = getLlm();
  if (llm) {
    try {
      const picks = await llm.pick(input.label, [
        {
          id: need.id,
          item: need.item,
          total: `${input.amount} ${unit}`,
          diet: [],
          candidates: cands.map(toCandidate),
        },
      ]);
      const ok = new Set(ranked);
      const r =
        picks.picks
          .find((p) => p.needId === need.id)
          ?.ranked.filter((s) => ok.has(s)) ?? [];
      if (r.length) {
        ranked = r;
        llmRanked = true;
      } else throw new HttpError(404, `no catalogue match for "${input.item}"`);
    } catch (e) {
      if (e instanceof HttpError) throw e; // Claude said nothing fits
    }
  }
  // ONE price/stock call for the top few. If none of them can be delivered, look further on our own (one more call):
  // the rest of Claude's ranking, or other catalogue matches when Claude didn't rank. The buyer never has to ask.
  let top = ranked.slice(0, 6);
  const sc = await checkStock(top, b.date, b.customer);
  let calls = sc.calls;
  const st = new Map(sc.lines.map((l) => [l.sku, l]));
  const usable = (s: string) =>
    !!st.get(s)?.deliverable && st.get(s)!.status === "ok";
  if (!top.some(usable)) {
    const more = [
      ...new Set([
        ...ranked.slice(6),
        ...(llmRanked ? [] : cands.map((p) => p.id)),
      ]),
    ]
      .filter((s) => !top.includes(s))
      .slice(0, 10);
    if (more.length) {
      const sc2 = await checkStock(more, b.date, b.customer);
      calls += sc2.calls;
      for (const l of sc2.lines) st.set(l.sku, l);
      top = [...top, ...more];
    }
  }
  b.apiCalls += calls;
  const pname = (s: string) => niceProduct(s);
  const first = top[0];
  const firstWhy =
    UNAVAILABLE[st.get(first)?.status ?? "not_found"] ?? "unavailable";
  const ok = top.filter(usable);
  if (!ok.length) {
    audit(
      b.id,
      "gateway",
      "add_failed",
      `${input.label}: ${pname(first)} unavailable (${firstWhy}); no deliverable alternative`,
      { checked: top, apiCalls: calls },
    );
    throw new HttpError(
      409,
      `${pname(first)} is unavailable for ${dayLabel(b.date)} (${firstWhy}), and none of the ${top.length - 1} alternatives I checked can be delivered either, so I didn't add anything`,
    );
  }
  // Counted items: avoid a 12-bottle case when the buyer asked for 2 bottles, if a smaller deliverable pack exists.
  const caseOf = (s: string) => caseSize(getProduct(s));
  const fitsCount = (s: string) =>
    unit !== "pcs" || caseOf(s) <= Math.max(1, input.amount);
  const sku =
    ok.find(fitsCount) ??
    (unit === "pcs" ? [...ok].sort((x, y) => caseOf(x) - caseOf(y))[0] : ok[0]);
  const unavailable = usable(first)
    ? undefined
    : { name: pname(first), reason: firstWhy };

  const place = placeFor(b, input);
  if (place.created) b.dishes.push(place.created);
  need.dishId = place.dishId;
  const category = b.dishes.find((d) => d.id === place.dishId)!.name;

  const made = makeLine(
    { sku, needs: [need], ranked: top },
    st.get(sku)!,
    b.people,
    b.dishes,
  );
  if (unit === "pcs") {
    // "2 bottles" / "3 packs": that many items. A case of N (e.g. "12 x Pepsi 1,5 l") covers N of them.
    const n = caseSize(getProduct(sku));
    made.qty = Math.max(1, Math.ceil(input.amount / n));
    made.total = Math.round(made.qty * made.stock.price * 100) / 100;
    made.why =
      n > 1
        ? `${input.label} → ${made.qty} case${made.qty > 1 ? "s" : ""} of ${n} (sold by the case${made.qty * n > input.amount ? `, ${made.qty * n - input.amount} extra` : ""})`
        : `${input.label} → ${made.qty} × ${made.pack}`;
    made._note = undefined;
  }
  const { _need, _note, ...line } = made;
  const same = b.lines.find((l) => l.sku === sku && l.qty > 0 && !isOpen(l));
  let out: BasketLine;
  if (same) {
    same.qty = r2(same.qty + line.qty);
    same.total = r2(same.qty * same.stock.price);
    same.why = `${same.why} + ${input.label}`;
    out = same;
  } else {
    const n =
      Math.max(0, ...b.lines.map((l) => Number(l.id.replace(/\D/g, "")) || 0)) +
      1;
    line.id = `l${n}`;
    const iss = issueFor(line.stock, line.qty, b.date);
    if (iss) {
      const opts = top
        .filter((s) => s !== sku && st.get(s))
        .map((s) =>
          optionFor(s, st.get(s)!, _need, line, b.people, b.dishes, [need]),
        );
      line.issue = {
        ...iss,
        options: rankOptions(opts, getProduct(sku)?.contains ?? [], {
          customer: b.customer,
          forSku: sku,
        }),
      };
      if (!line.issue.options.length)
        line.issue.text += " No deliverable alternative found.";
    }
    b.lines.push(line);
    const ctx = basketCtx.get(b.id) ?? new Map<string, LineCtx>();
    ctx.set(line.id, { needs: [need], pool: top.filter((s) => s !== sku) });
    basketCtx.set(b.id, ctx);
    out = line;
  }
  recompute(b);
  audit(
    b.id,
    by,
    "add",
    `Added ${input.label}: ${out.name}, ${line.qty} × ${out.pack}${place.created ? ` (new category ${category})` : ` (in ${category})`}${unavailable ? `; ${unavailable.name} unavailable (${unavailable.reason})` : ""}`,
    {
      lineId: out.id,
      sku,
      category,
      createdCategory: !!place.created,
      apiCalls: calls,
      unavailable,
    },
  );
  return {
    basket: b,
    line: out,
    category,
    createdCategory: !!place.created,
    unavailable,
  };
}

function refreshComparison(b: Basket, line: BasketLine) {
  const comparison = line.comparison;
  if (!comparison) return;
  const need: Need = {
    ...directDraft([
      {
        query: comparison.query,
        quantity: comparison.requested.qty,
        unit: comparison.requested.unit.toLowerCase() as "l" | "kg" | "pcs",
      },
    ]).needs[0],
    diet: (line.requiredDiet ?? []) as Need["diet"],
  };
  const snapshots = comparison.candidates.map((c) => {
    const stock = c.line.sku === line.sku ? line.stock : c.line.stock;
    const { _need, _note, ...candidate } = makeLine(
      { sku: c.line.sku, needs: [need], ranked: [] },
      stock,
      1,
      [],
    );
    candidate.id = line.id;
    const issue = issueFor(stock, candidate.qty, b.date);
    if (issue) candidate.issue = { ...issue, options: [] };
    return candidate;
  });
  comparison.candidates = rankComparedProducts(
    b,
    snapshots,
    comparison.requested,
  );
  comparison.recommendedSku = comparison.candidates[0]?.line.sku ?? line.sku;
}
