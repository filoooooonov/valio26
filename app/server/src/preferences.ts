// Purchase memory (CONTRACT S48). Deterministic, plain-language, no confidence percentages.
// Preferences only ORDER choices that are already valid (safety, availability and explicit instructions come first);
// they never create, widen or extend substitution permissions (those live in policy.ts).
import { getProduct } from "./catalog";
import { historyDecisions, historyOrders } from "./history";
import { readLedger, writeLedger } from "./ledger";

export type PreferenceEvent = {
  customer: string;
  at: string;
  kind:
    | "purchased"
    | "substitution_accepted"
    | "substitution_rejected"
    | "stated_preference"
    | "prohibited";
  sku: string;
  forSku?: string;
  qty?: number;
  source: "synthetic_history" | "live";
  basketId?: string;
  /** Cart line owning a live substitution choice; absent on historical events. */
  lineId?: string;
};
export type PreferenceStatus =
  "usual" | "accepted_alternative" | "unfamiliar" | "rejected" | "prohibited";
export type Preference = {
  status: PreferenceStatus;
  reason: string;
  orders: number;
  of: number;
  accepted?: number;
  rejected?: number;
};

/** Lower is preferred: usual < accepted_alternative < unfamiliar < rejected < prohibited. */
export const PREFERENCE_TIER: Record<PreferenceStatus, number> = {
  usual: 0,
  accepted_alternative: 1,
  unfamiliar: 2,
  rejected: 3,
  prohibited: 4,
};
const WINDOW = 8; // "your last 8 orders"

function seedEvents(): PreferenceEvent[] {
  const out: PreferenceEvent[] = [];
  for (const customer of ["123"]) {
    for (const o of historyOrders(customer))
      for (const l of o.lines)
        out.push({
          customer,
          at: `${o.date}T10:00:00.000Z`,
          kind: "purchased",
          sku: l.sku,
          qty: l.qty,
          source: "synthetic_history",
          basketId: o.id,
        });
    for (const d of historyDecisions(customer))
      out.push({
        customer,
        at: d.at,
        kind:
          d.decision === "accepted"
            ? "substitution_accepted"
            : "substitution_rejected",
        sku: d.toSku,
        forSku: d.fromSku,
        source: "synthetic_history",
        basketId: d.orderId,
      });
  }
  return out;
}

// Ledger keeps only live events; the synthetic baseline is regenerated from history.ts on every load/reset.
let live: PreferenceEvent[] = readLedger<PreferenceEvent[]>("preferences", []);
const seed = seedEvents();

export const preferenceEvents = (customer: string): PreferenceEvent[] =>
  [...seed, ...live].filter((e) => e.customer === customer);

const isChoiceFor = (e: PreferenceEvent, customer: string, basketId: string, lineId: string, fromSku: string) =>
  e.customer === customer && e.basketId === basketId && e.kind.startsWith("substitution_") &&
  (e.lineId ? e.lineId === lineId : e.forSku === fromSku);

/** Current choice evidence only. Legacy events are matched by original SKU, never timestamp. */
export function choiceMemory(customer: string, basketId: string, lineId: string, fromSku: string): PreferenceEvent[] {
  return structuredClone(live.filter(e => isChoiceFor(e, customer, basketId, lineId, fromSku)));
}

/** Changing/undoing a cart choice replaces that line's evidence, preserving other lines and synthetic history. */
export function restoreChoiceMemory(customer: string, basketId: string, lineId: string, fromSku: string, snapshot: PreferenceEvent[]) {
  live = live.filter(e => !isChoiceFor(e, customer, basketId, lineId, fromSku));
  live.push(...structuredClone(snapshot));
  writeLedger("preferences", live);
}

/** Append-only. */
export function recordPreference(
  e: Omit<PreferenceEvent, "at" | "source"> & {
    at?: string;
    source?: PreferenceEvent["source"];
  },
): PreferenceEvent {
  const ev: PreferenceEvent = {
    ...e,
    at: e.at ?? new Date().toISOString(),
    source: e.source ?? "live",
  };
  live.push(ev);
  writeLedger("preferences", live);
  return ev;
}

/** Back to the synthetic baseline (dev reset, tests). */
export function resetPreferences() {
  live = [];
  writeLedger("preferences", live);
}

const nameOf = (sku: string) =>
  getProduct(sku)?.en || getProduct(sku)?.fi || sku;
const times = (n: number) =>
  n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;

/** Order ids of the customer's last 8 orders (synthetic history + live placed orders), newest first. */
function recentOrders(events: PreferenceEvent[]): string[] {
  const at = new Map<string, string>();
  for (const e of events)
    if (
      e.kind === "purchased" &&
      e.basketId &&
      (at.get(e.basketId) ?? "") < e.at
    )
      at.set(e.basketId, e.at);
  return [...at]
    .sort((a, b) => (a[1] < b[1] ? 1 : -1))
    .slice(0, WINDOW)
    .map(([id]) => id);
}

export function acceptedCount(
  customer: string,
  fromSku: string,
  toSku: string,
): number {
  return preferenceEvents(customer).filter(
    (e) =>
      e.kind === "substitution_accepted" &&
      e.sku === toSku &&
      e.forSku === fromSku,
  ).length;
}

/** What the restaurant's own purchase record says about `sku` (optionally as a replacement for `forSku`). */
export function preferenceOf(
  customer: string,
  sku: string,
  forSku?: string,
): Preference {
  const events = preferenceEvents(customer);
  const recent = recentOrders(events);
  const of = recent.length;
  const inOrders = new Set(
    events
      .filter(
        (e) =>
          e.kind === "purchased" &&
          e.sku === sku &&
          e.basketId &&
          recent.includes(e.basketId),
      )
      .map((e) => e.basketId),
  );
  const orders = inOrders.size;
  const subs = events.filter(
    (e) => e.sku === sku && (!forSku || e.forSku === forSku),
  );
  const accepted = subs.filter(
    (e) => e.kind === "substitution_accepted",
  ).length;
  const rejected = subs.filter(
    (e) => e.kind === "substitution_rejected",
  ).length;
  const counts = {
    orders,
    of,
    ...(accepted ? { accepted } : {}),
    ...(rejected ? { rejected } : {}),
  };
  const accFrom = (() => {
    // Most frequent original this SKU replaced (for the reason text).
    const by = new Map<string, number>();
    for (const e of subs)
      if (e.kind === "substitution_accepted" && e.forSku)
        by.set(e.forSku, (by.get(e.forSku) ?? 0) + 1);
    return [...by].sort((a, b) => b[1] - a[1])[0]?.[0];
  })();

  if (events.some((e) => e.kind === "prohibited" && e.sku === sku))
    return {
      status: "prohibited",
      reason: "You asked us never to order this product",
      ...counts,
    };
  if (forSku && rejected > 0 && rejected >= accepted)
    return {
      status: "rejected",
      reason: "You previously declined this option",
      ...counts,
    };
  if (events.some((e) => e.kind === "stated_preference" && e.sku === sku))
    return {
      status: "usual",
      reason: "You asked us to prefer this product",
      ...counts,
    };
  if (of > 0 && orders * 2 >= of)
    return {
      status: "usual",
      reason: `Purchased in ${orders} of your last ${of} orders`,
      ...counts,
    };
  if (accepted > 0 && accepted > rejected)
    return {
      status: "accepted_alternative",
      reason: `You've accepted this instead of ${nameOf(forSku ?? accFrom!)} ${times(accepted)}`,
      ...counts,
    };
  if (rejected > 0)
    return {
      status: "rejected",
      reason: "You previously declined this option",
      ...counts,
    };
  if (orders > 0)
    return {
      status: "unfamiliar",
      reason: `Purchased in ${orders} of your last ${of} orders`,
      ...counts,
    };
  return { status: "unfamiliar", reason: "New to your restaurant", ...counts };
}

export const preferenceTier = (
  customer: string,
  sku: string,
  forSku?: string,
) => PREFERENCE_TIER[preferenceOf(customer, sku, forSku).status];

/** Stable re-order by preference tier only (step 4 of the S48 ranking); prohibited SKUs are dropped. Callers apply
 *  safety and availability before this and price/overbuy/reliability after it. */
export function rankByPreference(
  customer: string,
  skus: string[],
  forSku?: string,
): string[] {
  const tier = new Map(
    skus.map((s) => [s, preferenceTier(customer, s, forSku)]),
  );
  return skus
    .filter((s) => tier.get(s)! < PREFERENCE_TIER.prohibited)
    .sort((a, b) => tier.get(a)! - tier.get(b)!);
}

/** Recent order history in sales units per SKU, oldest first (for the usual-order builder). */
export function purchaseRecord(customer: string) {
  const events = preferenceEvents(customer);
  const recent = recentOrders(events);
  const orders = [...recent].reverse().map((id) => ({
    id,
    lines: events
      .filter((e) => e.kind === "purchased" && e.basketId === id)
      .map((e) => ({ sku: e.sku, qty: e.qty ?? 0 })),
  }));
  return orders;
}
