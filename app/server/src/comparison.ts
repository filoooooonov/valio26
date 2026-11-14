import { catalogSize, getProduct, search } from "./catalog";
import type { Basket, BasketLine } from "./plan";
import { validatePurchase } from "./validation";

export type ComparedProduct = {
  line: BasketLine;
  unitPrice: number | null;
  purchased: number | null;
  overbuy: number | null;
  status: "verified" | "review" | "excluded";
  selectable: boolean;
  reasons: string[];
};
export type ProductComparison = {
  query: string;
  requested: { qty: number; unit: "KG" | "L" | "PCS" };
  catalogueMatches: number;
  checkedCount: number;
  limit: number;
  checkedAt: string;
  source: string;
  recommendedSku: string;
  chosenBy?: string;
  ranking: string;
  candidates: ComparedProduct[];
};
export const COMPARISON_LIMIT = 12;

/** Local retrieval only. Mix high relevance with larger packs; never bulk-query all catalogue prices. */
export function comparisonShortlist(query: string, diet: string[]) {
  const hits = search(query, { limit: catalogSize(), diet });
  const category = hits[0] ? getProduct(hits[0].id)?.cat : undefined;
  const relevant = hits.filter((h) => {
    if (category && getProduct(h.id)?.cat !== category) return false;
    // Plain drinking milk must not silently become sour/flavoured or specialist coffee milk.
    if (/\bmilk\b/i.test(query))
      for (const group of [
        /\b(sour|fermented|kefir|acidofilus|yogurt|yoghurt)\b/i,
        /\b(chocolate|cocoa|vanilla|strawberry)\b/i,
        /\b(coffee|caf[e\u00e8\u00e9]|barista)\b/i,
      ])
        if (!group.test(query) && group.test(h.name)) return false;
    return true;
  });
  const large = [...relevant].sort(
    (a, b) =>
      (getProduct(b.id)?.content?.qty ?? b.size?.qty ?? 0) -
      (getProduct(a.id)?.content?.qty ?? a.size?.qty ?? 0),
  );
  const ids = [
    ...new Set([
      ...relevant.slice(0, 8).map((h) => h.id),
      ...large.map((h) => h.id),
      ...relevant.map((h) => h.id),
    ]),
  ].slice(0, COMPARISON_LIMIT);
  return { ids, catalogueMatches: relevant.length };
}

/** Safety and known fulfillment first; cost is the rounded requested-order total, not just shelf price. */
export function rankComparedProducts(
  b: Basket,
  lines: BasketLine[],
  requested: ProductComparison["requested"],
): ComparedProduct[] {
  return lines
    .map((line) => {
      const copy = { ...line };
      delete copy.comparison;
      delete copy.replaced;
      const checks = validatePurchase({
        ...b,
        lines: [copy],
        total: copy.total,
        totalWithVat: copy.qty * copy.stock.priceWithTax,
      });
      const status: ComparedProduct["status"] = !checks.length
        ? "verified"
        : checks.every((c) => c.code === "stock_unknown")
          ? "review"
          : "excluded";
      const purchased = copy.quantityIssue ? null : requested.qty + (copy.overbuy ?? 0);
      return {
        line: copy,
        unitPrice:
          copy.qty > 0 &&
          purchased != null && purchased > 0 &&
          Number.isFinite(copy.stock.price) &&
          copy.stock.price > 0
            ? copy.total / purchased
            : null,
        purchased,
        overbuy: copy.quantityIssue ? null : copy.overbuy ?? 0,
        status,
        selectable: status !== "excluded",
        reasons: checks.map((c) => c.message),
      };
    })
    .sort(
      (a, b) =>
        ({ verified: 0, review: 1, excluded: 2 })[a.status] -
          { verified: 0, review: 1, excluded: 2 }[b.status] ||
        a.line.total - b.line.total ||
        (a.overbuy ?? Infinity) - (b.overbuy ?? Infinity) ||
        (b.line.reliability ?? 0) - (a.line.reliability ?? 0) ||
        a.line.sku.localeCompare(b.line.sku),
    );
}

export function comparisonReason(
  comparison: ProductComparison,
  sku: string,
): string {
  const c = comparison.candidates.find((c) => c.line.sku === sku);
  if (!c) return "This product was not in the compared shortlist.";
  if (c.status === "excluded") return c.reasons.join(" ");
  const provisional =
    c.status === "review"
      ? " Stock is unknown; this is a provisional price comparison and ordering still requires intervention."
      : "";
  const best = comparison.candidates.find(
    (c) => c.line.sku === comparison.recommendedSku,
  );
  if (sku !== comparison.recommendedSku && best)
    return `Chosen alternative: EUR ${c.line.total.toFixed(2)} for the requested quantity, versus EUR ${best.line.total.toFixed(2)} for the recommendation.${provisional}`;
  return `${c.status === "verified" ? "Lowest total cost among the fully validated candidates" : "Lowest quoted total among candidates needing only stock verification"} in ${comparison.checkedCount} quoted products (${comparison.catalogueMatches} local catalogue matches; prices were not checked for the whole store). Pack rounding and requested quantity are included.${provisional}`;
}
