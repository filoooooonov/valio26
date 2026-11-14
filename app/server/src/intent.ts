import type { Draft } from "./llm";

export type PurchaseItem = {
  query: string;
  quantity: number;
  unit: "l" | "kg" | "pcs";
};
export type PurchasingIntent = "DIRECT_PURCHASE" | "MENU_PLANNING" | "REORDER";
/** "same as last week", "the same products as last week", "last week's order". Shared with reorder.ts. */
export const LAST_WEEK_RE =
  /\bsame\s+(?:(?:order|products?|items?|things|stuff)\s+)?as\s+last\s+week\b|\blast\s+week'?s\s+(?:order|products?|items?)\b/i;
/** "30% more customers this weekend": a change in trade with no dish or quantity named scales the usual order. */
export const SCALED_TRADE_RE =
  /\b\d+(?:[.,]\d+)?\s*%\s*(?:more|fewer|less|extra)\s+(?:customers|guests|covers|diners|visitors|business|trade)\b/i;
/** "my usual order", "the usual", "same as last week", "regular/normal order" (CONTRACT S48). */
export const REORDER_RE = new RegExp(
  [
    /\b(?:my|our|the)\s+usual\b|\busual\s+(?:\w+\s+){0,2}order\b/.source,
    LAST_WEEK_RE.source,
    /\b(?:regular|normal)\s+(?:\w+\s+){0,2}order\b|\breorder\b/.source,
    SCALED_TRADE_RE.source,
  ].join("|"),
  "i",
);
export function purchasingIntent(
  request: string,
  items?: PurchaseItem[],
): PurchasingIntent {
  if (items?.length) return "DIRECT_PURCHASE";
  if (REORDER_RE.test(request)) return "REORDER";
  if (/\b(catering|menu|recipe|portions?)\b/i.test(request))
    return "MENU_PLANNING";
  if (
    /\b\d[\d,.]*\s*(?:l|litres?|liters?|kg|kilograms?|g|ml|pcs|packs?|bottles?|units?)\b/i.test(
      request,
    )
  )
    return "DIRECT_PURCHASE";
  if (/\b(guests?|people|persons?|event)\b/i.test(request))
    return "MENU_PLANNING";
  return /^(?:I need|buy|order|purchase)\b/i.test(request.trim())
    ? "DIRECT_PURCHASE"
    : "MENU_PLANNING";
}

/** Conservative deterministic product parser. Unclear requests ask for structured quantities, never a menu. */
export function parsePurchaseItems(request: string): PurchaseItem[] {
  const text = request
    .replace(
      /\b(?:delivered|delivery|by|for|on)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|\d{4}-\d{2}-\d{2}).*$/i,
      "",
    )
    .replace(/^(?:please\s+)?(?:I\s+need|buy|order|purchase|add)\s+/i, "");
  const parsed = text.split(/\s+and\s+|,(?!\d)/i).map((part) => {
    const m = part
      .trim()
      .match(
        /^(\d[\d,]*(?:\.\d+)?)\s*(litres?|liters?|l|kg|kilograms?|g|ml|pcs|packs?|bottles?|units?)\b\s*(?:of\s+)?(.+?)\s*$/i,
      );
    if (!m) return null;
    const rawUnit = m[2].toLowerCase();
    const quantity =
      Number(m[1].replace(/,/g, "")) /
      (rawUnit === "g" || rawUnit === "ml" ? 1000 : 1);
    const unit = /^(l|lit|ml)/.test(rawUnit)
      ? "l"
      : /^(kg|kilogram|g$)/.test(rawUnit)
        ? "kg"
        : "pcs";
    return quantity > 0 && Number.isFinite(quantity)
      ? ({ query: m[3], quantity, unit } as PurchaseItem)
      : null;
  });
  return parsed.some((x) => !x) ? [] : (parsed as PurchaseItem[]);
}

export function directDraft(items: PurchaseItem[]): Draft {
  return {
    people: 1,
    dishes: [],
    assumed: [],
    needs: items.map((item, i) => ({
      id: `direct-${i}`,
      dishId: null,
      item: item.query,
      queries: [item.query],
      totalQty: item.quantity,
      totalUnit: item.unit,
      perPortion: null,
      perPortionUnit: null,
      diet: /lactose[ -]free/i.test(item.query) ? ["lactose-free"] : [],
      // Reuse the existing demo planner's curated milk shortlist; every SKU still needs live validation.
      ...(/lactose[ -]free milk/i.test(item.query)
        ? { pinned: ["464073", "464201", "463380", "464119"] }
        : {}),
    })),
  };
}
