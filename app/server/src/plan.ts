// Planner: request -> dishes -> needs -> catalogue candidates (server, local) -> LLM picks a SKU per need
// -> ONE price/stock call for the chosen SKUs -> quantities in sales units -> issues with ranked alternatives
// (ONE extra call). The LLM never sees prices/stock and never applies rules; the mandate runs in policy.ts.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
import { baskets, dailySoFar, newId } from "./store";
import { checkStock, contentPerUnit, type StockLine } from "./valio";

export type Dish = {
  id: string;
  name: string;
  portions: number;
  basis: string;
  diet: string[];
};
export type Option = {
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
};
export type Issue = {
  kind: "short" | "unavailable" | "cutoff";
  text: string;
  options: Option[];
  decided?: string; // option sku | "keep" | "remove"
  decidedBy?: string;
};
export type BasketLine = {
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
  claims: string[];
  reliability?: number;
  co2?: number;
  image?: string;
  issue?: Issue;
  replaced?: { sku: string; name: string };
  usedIn?: string[];
};
export type Basket = {
  id: string;
  customer: string;
  request: string;
  people: number;
  date: string;
  planner: "llm" | "fallback";
  plannerNote?: string;
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
};

type Need = Draft["needs"][number] & { pinned?: string[] };

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
): Amt & { byWeight: boolean } {
  if (st.salesUnit === "KG" || p?.unit === "KG") // base unit KG = catch weight, priced per kg
    return { qty: 1, unit: "KG", byWeight: true };
  const c = contentPerUnit(st);
  if (c && (c.unit === "KG" || c.unit === "L"))
    return { qty: r2(c.qty), unit: c.unit, byWeight: false };
  if (p?.size) return { ...p.size, byWeight: false };
  return { qty: 1, unit: "PCS", byWeight: false };
}

/** Sales units to order for `need`, plus the "why" maths. */
export function salesQty(
  need: Amt,
  pack: Amt & { byWeight: boolean },
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
    const qty = Math.max(0.5, Math.ceil(q * 2 - 1e-9) / 2);
    return { qty, text: `${fmtAmt({ qty, unit: "KG" })} (sold by kg)`, note };
  }
  const qty = Math.max(1, Math.ceil(q / pack.qty - 1e-9));
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
      { item: "blueberries", per: 60, unit: "g", skus: ["461154", "460649", "465273", "461043"] },
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
    total: r2(sq.qty * st.price),
    contains: allergenNames(p?.contains ?? []),
    claims: p?.claims ?? [],
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
      : "no new allergens",
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
    qty: l.qty,
    pack: l.pack,
    why: l.why,
    total: l.total,
    stock: st,
    contains: l.contains,
  };
}

/** Allergen safety → deliverable → on-time reliability → price → CO2. Only orderable options survive. */
export function rankOptions(opts: Option[], baseContains: string[]): Option[] {
  const risk = (o: Option) =>
    o.contains.filter((c) => !baseContains.includes(c)).length;
  const rel = (o: Option) =>
    Math.round((getProduct(o.sku)?.rel ?? 0) * 20) / 20;
  const co2 = (o: Option) => getProduct(o.sku)?.co2 ?? 99;
  return opts
    .filter((o) => orderable(o.stock, o.qty))
    .sort(
      (a, b) =>
        risk(a) - risk(b) ||
        rel(b) - rel(a) ||
        a.total - b.total ||
        co2(a) - co2(b),
    )
    .slice(0, 3);
}

// ---------- totals + mandate ----------
export const isOpen = (l: BasketLine) => !!l.issue && !l.issue.decided;
export function recompute(b: Basket): Basket {
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
    deliveryLabel: dayLabel(b.date),
  });
  return b;
}

// ---------- the planner ----------
export type BasketRequest = {
  request: string;
  people?: number;
  date: string;
  customer?: string;
};

export async function buildBasket(req: BasketRequest): Promise<Basket> {
  const id = newId("b");
  const customer = req.customer || "123";
  audit(id, "buyer", "request", `"${req.request}" for ${dayLabel(req.date)}`, {
    people: req.people ?? null,
    customer,
  });

  // 1. dishes + needs
  const llm = getLlm();
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
  } else draft = fallbackDraft(req.request, req.people);
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
  const notes: string[] = [];
  const cands = new Map<string, Product[]>();
  for (const n of draft.needs) {
    const diet = [
      ...new Set([
        ...(dishes.find((d) => d.id === n.dishId)?.diet ?? []),
        ...n.diet,
      ]),
    ];
    cands.set(n.id, candidatesFor(n, diet));
  }
  const nCand = [...cands.values()].reduce((s, c) => s + c.length, 0);
  audit(
    id,
    "gateway",
    "search",
    `Local catalogue: ${nCand} candidates for ${draft.needs.length} ingredients (0 Valio API calls)`,
    {
      perNeed: Object.fromEntries([...cands].map(([k, v]) => [k, v.length])),
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
  const sc = await checkStock([...groups.keys()], req.date, customer);
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
  const withIssue = lines.filter((x) => x.l.issue);
  if (withIssue.length) {
    const chosen = new Set(groups.keys());
    const alt = new Map<string, string[]>();
    for (const { l, g } of withIssue) {
      const pool = [
        ...g.ranked.slice(1),
        ...(g.needs[0].pinned || llmRanked.has(g.needs[0].id)
          ? [] // Claude already said which candidates genuinely fit
          : (cands.get(g.needs[0].id) ?? []).map((p) => p.id)),
      ];
      alt.set(
        l.id,
        [...new Set(pool)].filter((s) => !chosen.has(s)).slice(0, 5),
      );
    }
    const altSkus = [...new Set([...alt.values()].flat())];
    if (altSkus.length) {
      const sc2 = await checkStock(altSkus, req.date, customer);
      apiCalls += sc2.calls;
      const st2 = new Map(sc2.lines.map((x) => [x.sku, x]));
      for (const { l, g } of withIssue) {
        const opts = (alt.get(l.id) ?? []).map((s) =>
          optionFor(s, st2.get(s)!, l._need, l, people, dishes, g.needs),
        );
        l.issue!.options = rankOptions(opts, getProduct(l.sku)?.contains ?? []);
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
    plannerNote,
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
  recompute(basket);
  baskets.set(id, basket);
  audit(
    id,
    "gateway",
    "mandate",
    `${basket.mandate.state}: ${basket.mandate.reasons.join(" ")}`,
    { total: basket.total, apiCalls },
  );
  return basket;
}

// ---------- edits ----------
export type LineEdit = { qty?: number; chooseOption?: string; by?: string };
export class HttpError extends Error {
  constructor(
    public status: number,
    msg: string,
  ) {
    super(msg);
  }
}

export function editLine(
  basketId: string,
  lineId: string,
  e: LineEdit,
): Basket {
  const b = baskets.get(basketId);
  if (!b) throw new HttpError(404, "basket not found");
  const l = b.lines.find((x) => x.id === lineId);
  if (!l) throw new HttpError(404, "line not found");
  const by = e.by || "buyer";
  if (e.qty != null) {
    if (!(e.qty >= 0)) throw new HttpError(400, "qty must be >= 0");
    const was = l.qty;
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
      l.replaced = l.replaced ?? { sku: l.sku, name: l.name }; // re-deciding keeps the original product
      const p = getProduct(o.sku);
      Object.assign(l, {
        sku: o.sku,
        name: o.name,
        brand: p?.brand ?? "",
        qty: o.qty,
        pack: o.pack,
        why: o.why,
        stock: o.stock,
        total: o.total,
        contains: o.contains,
        claims: p?.claims ?? [],
        reliability: p?.rel ?? undefined,
        co2: p?.co2 ?? undefined,
        image: p?.image ?? undefined,
      });
    }
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
