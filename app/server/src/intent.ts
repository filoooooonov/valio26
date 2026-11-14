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

/**
 * What the chef actually wants (S50). Menu planning is optional:
 * - DIRECT_PURCHASE / REORDER: build the cart straight away.
 * - KNOWN_DISH: the request names the dishes ("ingredients for lasagna for 50"): plan ingredients for those, no menu.
 * - MENU_PLANNING: the chef asks for a menu ("plan a three-course dinner"): show the menu review first.
 * - ASK_MENU: an event with no dishes and no menu ask ("catering for 50 on Saturday"): ask once, never assume.
 */
export type RequestRoute = PurchasingIntent | "KNOWN_DISH" | "ASK_MENU";
export const PLAN_MENU_RE =
  /\b(?:plan|suggest|propose|design|create|come up with|recommend|put together|help me (?:plan|choose|pick))\b[^.?!]*\b(?:menu|dishes|courses?|dinner|lunch|buffet|meal|brunch|breakfast)\b|\b(?:two|three|four|five|[2-5])[- ]course\b|\bmenu (?:ideas?|suggestions?|proposal)\b|\bwhat (?:should|could|can) (?:i|we) (?:serve|cook|make)\b/i;
/** Words that describe an occasion, not a dish. */
const OCCASION_RE =
  /^(?:a|an|the|our|my|some|this|next)?\s*(?:\w+\s+)?(?:catering|event|party|dinner|lunch|buffet|wedding|meeting|celebration|function|banquet|reception|gathering|menu|meal|brunch|breakfast|occasion|guests?|people|persons?|staff|team|christmas|birthday|conference|seminar|weekend|week|restaurant)\b/i;
const cleanDish = (s: string) =>
  s
    .replace(/\b(?:for|on|by|delivered|this|next)\b.*$/i, "")
    .replace(/^(?:the|a|an|some|our|my)\s+/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
/** Dishes the request names explicitly. Empty when it only describes an occasion. */
export function namedDishes(request: string): string[] {
  const first = request.split(/(?<=[.!?])\s+/)[0] ?? request;
  // "…: creamy salmon soup, rye bread, blueberry pie."
  const colon = request.match(/:\s*([^.!?\n]+)/)?.[1];
  if (colon) {
    const list = colon
      .split(/,|\s+and\s+|\s*\+\s*/i)
      .map((s) => s.replace(/^(?:the|a|an)\s+/i, "").trim())
      .filter(Boolean);
    if (
      list.length &&
      list.every((d) => !OCCASION_RE.test(d) && !/^\d/.test(d))
    )
      return list;
  }
  // "ingredients for lasagna for 50 people", "I'm making beef stew for 40", "cook moussaka for 30"
  const m =
    first.match(
      /\b(?:ingredients|products|everything|groceries|what i need)\s+(?:for|to make|to cook)\s+(.+)/i,
    ) ??
    first.match(
      /\b(?:making|cooking|serving|make|cook|serve|bake|baking)\s+(.+)/i,
    );
  if (!m) return [];
  const dish = cleanDish(m[1]);
  if (
    !dish ||
    OCCASION_RE.test(dish) ||
    /^\d/.test(dish) ||
    dish.split(/\s+/).length > 6
  )
    return [];
  return dish
    .split(/,|\s+and\s+|\s+with\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}
export function requestRoute(
  request: string,
  items?: PurchaseItem[],
): RequestRoute {
  const intent = purchasingIntent(request, items);
  if (intent !== "MENU_PLANNING") return intent;
  if (PLAN_MENU_RE.test(request)) return "MENU_PLANNING";
  if (namedDishes(request).length) return "KNOWN_DISH";
  return "ASK_MENU";
}

/** Hard allergen exclusions stated in a request ("no nuts", "nut-free", "milk allergy"). Never soft preferences. */
export function requestAllergens(request: string): string[] {
  const found = [
    ...request.matchAll(
      /(?:\bno|\bwithout|\bexclude|\bfree from)\s+(peanuts?|nuts?|milk|fish|eggs?|soy|sesame)\b|\b(peanuts?|nuts?|milk|fish|eggs?|soy|sesame)(?=[ -]free\b| allerg)/gi,
    ),
  ].map((m) =>
    (m[1] ?? m[2]).toLowerCase().replace(/^(peanut|nut|egg)s?$/, "$1s"),
  );
  return [...new Set(found)];
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
