// Exception-first cart summary (CONTRACT S48), computed in recompute from the basket's own records.
// Every line in the cart is counted at most once: attention > adjusted > usual. Lines that are none of these
// (new products, extras) are simply in the cart. Removed/excluded lines are not in the cart.
// "Need you" counts PRODUCTS the buyer must act on (unavailable, or blocked by a check). Stock sign-off and the
// spending limits are the approver's, so they are notes, not part of the count (S51).
import { lastPaid } from "./history";
import type { Basket } from "./plan";
// Same money/date style as the webshop: "1 634,51 €", "13 Nov".
const eur = (n: number) => n.toLocaleString("fi-FI", { style: "currency", currency: "EUR" });
const shortDate = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
import { dailySoFar } from "./store";
import { SIGN_OFF_CODES, validatePurchase, type Check } from "./validation";

export type SummaryKind =
  | "unavailable"
  | "substitution"
  | "price_increase"
  | "late"
  | "pack_rounding"
  | "over_limit"
  | "stock_signoff"
  | "needs_choice";
/** `attention`: this product is counted in "need you" and listed in the chat review card. */
export type SummaryItem = { lineId?: string; kind: SummaryKind; text: string; attention?: boolean };
export type BasketSummary = {
  usual: number;
  adjusted: number;
  attention: number;
  items: SummaryItem[];
};

/** A current price at least this much above the last (synthetic) price paid is mentioned. Informational only. */
const PRICE_NOTE_PCT = 5;

const checkKind = (c: Check): SummaryKind =>
  c.code === "stock_short"
    ? "unavailable"
    : c.code === "delivery_unverified" || c.code === "delivery_policy"
      ? "late"
      : c.code === "package_invalid" ||
          c.code === "quantity_unknown" ||
          c.code === "quantity_invalid"
        ? "pack_rounding"
        : "needs_choice";

const amount = (qty: number, unit: string) =>
  `${Math.round(qty * 1000) / 1000} ${unit.toLowerCase()}`;

export function basketSummary(b: Basket): BasketSummary {
  const checks = validatePurchase(b);
  const items: SummaryItem[] = [];
  let usual = 0,
    adjusted = 0,
    attention = 0;
  // Unknown stock is Valio's placeholder on most Stock items: one grouped sign-off note, not an exception per line.
  const unconfirmed: string[] = [];
  for (const l of b.lines) {
    const open = !!l.issue && !l.issue.decided;
    if (!open && l.qty <= 0) continue;
    const lineId = l.id;
    const mine = open ? [] : checks.filter((c) => c.sku === l.sku);
    const blocking = mine.filter((c) => !SIGN_OFF_CODES.has(c.code));
    const signoff = mine.some((c) => SIGN_OFF_CODES.has(c.code));
    const swapped =
      !!l.replaced && !!l.issue?.decided && l.issue.decided === l.sku;
    const rounded = !open && (l.overbuy ?? 0) > 1e-6 && !!l.requestedAmount;
    if (swapped) {
      const by = l.issue!.decidedBy ?? "buyer";
      items.push({
        lineId,
        kind: "substitution",
        text: `${l.replaced!.name} replaced by ${l.name}${by.startsWith("policy:") ? " under your standing permission" : by === "gateway (best replacement)" ? " automatically (best available replacement; you can change it)" : by.startsWith("gateway") ? " under the same-use rule" : ""}.`,
      });
    }
    if (open) {
      attention++;
      const n = l.issue!.options.length;
      items.push({
        lineId,
        kind: l.issue!.kind === "cutoff" ? "late" : "unavailable",
        text: `${l.name}: ${l.issue!.text}${n ? ` Choose from ${n} replacement${n > 1 ? "s" : ""}.` : ""}`,
        attention: true,
      });
    } else if (blocking.length) {
      attention++;
      items.push({
        lineId,
        kind: checkKind(blocking[0]),
        text: blocking[0].message,
        attention: true,
      });
    } else if (swapped || rounded) {
      adjusted++;
      if (rounded && !swapped)
        items.push({
          lineId,
          kind: "pack_rounding",
          text: `${l.name}: rounded up to ${l.qty} × ${l.pack} (${amount(l.overbuy!, l.requestedAmount!.unit)} more than needed).`,
        });
    } else if (l.preference?.status === "usual") usual++;
    if (!open && !blocking.length && signoff) unconfirmed.push(l.name);
    // Price context for repeat purchases: today's quoted price vs the last price paid (history is never a price fact).
    if (!open && b.intent === "REORDER") {
      const last = lastPaid(b.customer, l.sku);
      if (
        last &&
        l.stock.price > 0 &&
        (l.stock.price / last.price - 1) * 100 >= PRICE_NOTE_PCT
      )
        items.push({
          lineId,
          kind: "price_increase",
          text: `${l.name}: ${eur(l.stock.price)} now, ${eur(last.price)} on your ${shortDate(last.date)} order (+${Math.round((l.stock.price / last.price - 1) * 100)} %).`,
        });
    }
  }
  if (unconfirmed.length) {
    items.push({
      kind: "stock_signoff",
      text: unconfirmed.length === 1
        ? `Valio can't confirm stock for ${unconfirmed[0]}, so ${b.rules?.approver ?? "the approver"} checks it before the order is placed.`
        : `Valio can't confirm stock for ${unconfirmed.length} products, so ${b.rules?.approver ?? "the approver"} checks them before the order is placed.`,
    });
  }
  const limit = b.rules?.maxOrderEur;
  const day = Math.round((dailySoFar(b.customer, b.id) + b.total) * 100) / 100;
  if (limit != null && b.total > limit) {
    items.push({
      kind: "over_limit",
      text: `${eur(b.total)} is over your ${eur(limit)} per-order limit, so ${b.rules.approver} approves it.`,
    });
  } else if (b.rules?.maxDailyEur != null && day > b.rules.maxDailyEur) {
    items.push({
      kind: "over_limit",
      text: `${eur(day)} today is over the ${eur(b.rules.maxDailyEur)} daily limit, so ${b.rules.approver} approves it.`,
    });
  }
  return { usual, adjusted, attention, items };
}
