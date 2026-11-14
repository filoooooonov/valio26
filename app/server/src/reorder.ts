// Usual-order builder (CONTRACT S48, intent REORDER). Turns the restaurant's purchase record into ordinary planner
// needs: the normal planner then checks CURRENT price and stock in one batched call, and unavailable usual products
// become issues whose replacement options are ranked by preference. History never sets prices or stock.
import { getProduct, search } from "./catalog";
import { directDraft, LAST_WEEK_RE, parsePurchaseItems } from "./intent";
import type { Draft } from "./llm";
import { preferenceEvents, preferenceOf, purchaseRecord } from "./preferences";
import { hasProfile } from "./history";

type Need = Draft["needs"][number] & { pinned?: string[] };

const CATEGORIES: { words: RegExp; label: string; cat: RegExp }[] = [
  { words: /\bdairy\b/i, label: "dairy", cat: /^10/ },
  { words: /\b(?:meat|butcher)\b/i, label: "meat", cat: /^(?:172|18|417)/ },
  {
    words: /\b(?:vegetables?|veg|produce)\b/i,
    label: "vegetables",
    cat: /^174/,
  },
  { words: /\b(?:dry goods|dry|pantry)\b/i, label: "dry goods", cat: /^2[12]/ },
  { words: /\b(?:frozen|freezer)\b/i, label: "frozen", cat: /^41/ },
];
const LAST_WEEK = LAST_WEEK_RE;
const NONFOOD = /^(20|6)/;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** "30% more customers" → 1.3, "20 % fewer" → 0.8, "double" → 2, "half" → 0.5. */
export function scalingOf(
  request: string,
): { factor: number; text: string } | null {
  const pct = request.match(
    /(\d+(?:[.,]\d+)?)\s*%\s*(more|extra|fewer|less)\b([^,.;]*)/i,
  );
  if (pct) {
    const n = Number(pct[1].replace(",", ".")) / 100;
    const up = /more|extra/i.test(pct[2]);
    return {
      factor: Math.round((up ? 1 + n : Math.max(0, 1 - n)) * 1000) / 1000,
      text: pct[0].trim(),
    };
  }
  if (/\bdouble\b/i.test(request)) return { factor: 2, text: "double" };
  if (/\bhalf\b/i.test(request)) return { factor: 0.5, text: "half" };
  return null;
}

/** Same-category alternatives from the local catalogue (never the Valio API), for the issue options pool. */
function similar(sku: string, limit = 8): string[] {
  const p = getProduct(sku);
  if (!p) return [];
  const brandWords = new Set(p.brand.toLowerCase().split(/\s+/));
  const words = (p.en || p.fi)
    .toLowerCase()
    .replace(/[®™%]/g, " ")
    .split(/[\s,/()]+/)
    .filter(
      (w) =>
        w.length > 1 &&
        !/\d/.test(w) &&
        !brandWords.has(w) &&
        !/^(?:uht|esl|novobox|e|x|kg|l|dl|ml|g|pcs)$/.test(w),
    );
  const out: string[] = [];
  for (const n of [3, 2, 1]) {
    if (words.length < n) continue;
    for (const h of search(words.slice(0, n).join(" "), { limit: 40 })) {
      const q = getProduct(h.id);
      if (
        !q ||
        q.id === sku ||
        out.includes(q.id) ||
        NONFOOD.test(q.cat) ||
        q.cat !== p.cat
      )
        continue;
      if (
        (q.content?.unit ?? q.size?.unit) !== (p.content?.unit ?? p.size?.unit)
      )
        continue;
      out.push(q.id);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function reorderDraft(
  customer: string,
  request: string,
): {
  draft: Draft & { needs: Need[] };
  notes: string[];
  plannerNote: string;
} | null {
  const record = purchaseRecord(customer); // oldest first, last 8 orders
  if (!record.length) return null;
  const lastWeek = LAST_WEEK.test(request);
  const source = lastWeek ? record.slice(-1) : record;
  const category = CATEGORIES.find((c) =>
    c.words.test(request.replace(/\b(?:add|plus)\b.*$/i, "")),
  );
  const scale = scalingOf(request);
  const factor = scale?.factor ?? 1;
  const notes: string[] = [];

  const present = new Map<string, number[]>();
  for (const o of source)
    for (const l of o.lines)
      if (l.qty > 0) present.set(l.sku, [...(present.get(l.sku) ?? []), l.qty]);
  const usual = [...present]
    .filter(([sku, qtys]) => lastWeek || qtys.length * 2 >= source.length)
    .filter(
      ([sku]) => !category || category.cat.test(getProduct(sku)?.cat ?? ""),
    )
    .filter(
      ([sku]) =>
        getProduct(sku) && preferenceOf(customer, sku).status !== "prohibited",
    );

  const events = preferenceEvents(customer);
  const needs: Need[] = usual.map(([sku, qtys]) => {
    const p = getProduct(sku)!;
    const units = median(qtys) * factor;
    const content =
      p.unit === "KG"
        ? { qty: 1, unit: "KG" as const }
        : (p.content ?? p.size ?? { qty: 1, unit: "PCS" as const });
    const unit =
      content.unit === "L" ? "l" : content.unit === "KG" ? "kg" : "pcs";
    // Alternatives this restaurant has seen for this product first (accepted or declined), then same-category products.
    const seen = [
      ...new Set(
        events
          .filter((e) => e.forSku === sku && e.kind !== "purchased")
          .map((e) => e.sku),
      ),
    ];
    return {
      id: `usual-${sku}`,
      dishId: null,
      item: p.en || p.fi,
      queries: [p.en || p.fi],
      perPortion: null,
      perPortionUnit: null,
      totalQty: r3(units * content.qty),
      totalUnit: unit,
      diet: [],
      pinned: [...new Set([sku, ...seen, ...similar(sku)])],
    } as Need;
  });

  // Extras: "... but add 10 litres of milk". Parsed with the same conservative direct-purchase parser.
  const extra = request.match(
    /\b(?:but\s+|and\s+|also\s+|plus\s+)*add\s+(.+?)\s*[.!]?\s*$/i,
  )?.[1];
  if (extra) {
    const items = parsePurchaseItems(extra);
    if (!items.length)
      notes.push(
        `Couldn't read the extra item "${extra}"; add it in the cart with a quantity.`,
      );
    for (const [i, n] of directDraft(items).needs.entries()) {
      const need = n as Need;
      need.id = `extra-${i}`;
      if (!need.pinned) {
        // Products this restaurant already buys rank first among matches (preference is applied in the planner).
        const hits = search(need.item, { limit: 60, diet: need.diet })
          .map((h) => h.id)
          .filter((id) => !NONFOOD.test(getProduct(id)?.cat ?? ""));
        const bought = new Set(
          events.filter((e) => e.kind === "purchased").map((e) => e.sku),
        );
        need.pinned = [
          ...new Set([
            ...hits.filter((id) => bought.has(id)),
            ...hits.slice(0, 10),
          ]),
        ];
      }
      needs.push(need);
      notes.push(`Added on request: ${n.totalQty} ${n.totalUnit} ${n.item}.`);
    }
  }

  notes.unshift(
    lastWeek
      ? `Same as your last order (${source[0].id.replace(/^hist-/, "")}); quantities as ordered then.`
      : `Usual items: products in at least ${Math.ceil(source.length / 2)} of your last ${source.length} orders; quantity is your median order${category ? `; ${category.label} only` : ""}.`,
  );
  if (scale)
    notes.push(
      `Assumption: quantities scaled ×${factor} for "${scale.text}", then rounded up to whole sales units.`,
    );
  const synthetic = hasProfile(customer) ? " (synthetic demo profile)" : "";
  return {
    draft: { people: 0, dishes: [], needs, assumed: [] },
    notes,
    plannerNote: `Usual order from your purchase history${synthetic}. Current prices and stock were checked now; history never sets prices or stock.`,
  };
}
