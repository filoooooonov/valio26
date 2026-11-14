// SYNTHETIC DEMO PROFILE (CONTRACT S48). "Bistro Kallio" (account 123) is a fictional independent Helsinki restaurant.
// Its 8 weekly orders below are generated deterministically from a fixed seed list: real catalogue SKUs,
// synthetic historical quantities and prices. History is purchase memory only: it never establishes current
// stock, price, allergen or delivery facts (the live Valio API validates every basket) and it is never mixed into
// Valio API responses.
//
// Cream SKUs were chosen against the real sponsor mock API (POST /api/stock, date 2026-11-16, checked 2026-11-14T20:04Z):
//   A 476880 Valio cooking cream 15 % 10 l UHT lactose free novobox: Terminal, closingTime 2026-11-12T15:00+02:00,
//            cutoffPassed true, deliverable false. The mock's Terminal cut-offs are permanent for the demo
//            (docs/sponsors/valio/README.md), so the usual cream is genuinely unorderable for Mon 16 Nov.
//   B 464249 Valio cooking cream 15 % 1 l UHT lactose free: Stock, customer price EUR 2.63, deliverable, cut-off
//            2026-11-15T17:00+02:00, availability placeholder (unknown -> approver confirms stock).
//   C 469162 Valio cooking cream alternative 15 % 1 l lactose free: Stock, customer price EUR 1.79, deliverable,
//            cut-off 2026-11-15T17:00+02:00, availability unknown. Cheaper than B, but the restaurant declined it once.
// Usual items are Valio products because the mock returns a customer-specific price (netPriceFound) for account 123
// almost only on Valio's own range (1 of 1,061 sampled non-Valio food SKUs); meat, vegetables and dry goods appear as
// occasional purchases so a usual order is not blocked by unverified prices.

export const PROFILE_CUSTOMER = "123";
export const PROFILE_NAME = "Bistro Kallio";

export const CREAM_A = "476880";
export const CREAM_B = "464249";
export const CREAM_C = "469162";

export type HistoryLine = {
  sku: string;
  qty: number; // sales units
  unitPrice: number; // synthetic historical price, EUR excl. VAT
  total: number;
  substitutedFor?: string; // the usual SKU this line replaced (accepted substitution)
};
export type HistoryOrder = {
  id: string;
  customer: string;
  date: string; // Friday order date
  lines: HistoryLine[];
  total: number;
  synthetic: true;
};
export type HistoryDecision = {
  orderId: string;
  at: string;
  fromSku: string;
  toSku: string;
  decision: "accepted" | "rejected";
};

export const ORDER_DATES = [
  "2026-09-25",
  "2026-10-02",
  "2026-10-09",
  "2026-10-16",
  "2026-10-23",
  "2026-10-30",
  "2026-11-06",
  "2026-11-13",
];

// sku, reference price (sponsor mock price on 2026-11-14, used only to generate plausible synthetic history),
// quantity per week (0 = not ordered that week).
type Seed = { sku: string; ref: number; qty: number[]; drift?: number[] };
const SEED: Seed[] = [
  // dairy (usual)
  { sku: CREAM_A, ref: 31.62, qty: [2, 2, 0, 2, 0, 2, 0, 2] }, // weeks 3, 5, 7: unavailable, B accepted instead
  { sku: "469549", ref: 1.0, qty: [20, 22, 24, 18, 22, 20, 24, 20] }, // Valio semi skimmed milk 1 l ESL
  // butter: a modest drift, then last week's price was still lower than today's quote (price increase exception)
  {
    sku: "463437",
    ref: 3.31,
    qty: [8, 6, 8, 8, 10, 8, 8, 8],
    drift: [0.9, 0.9, 0.91, 0.91, 0.92, 0.92, 0.92, 0.92],
  },
  { sku: "464194", ref: 3.91, qty: [14, 12, 16, 16, 14, 14, 16, 14] }, // whipping cream 1 l
  { sku: "470084", ref: 7.27, qty: [4, 4, 0, 4, 4, 5, 0, 4] }, // sour cream 2 kg
  { sku: "476753", ref: 13.74, qty: [3, 3, 4, 0, 3, 3, 3, 3] }, // grated cheese mix 2.5 kg
  { sku: "469270", ref: 18.86, qty: [1, 0, 1, 1, 0, 2, 0, 1] }, // cream cheese 3.5 kg
  { sku: "476743", ref: 13.39, qty: [3, 3, 0, 3, 3, 0, 3, 3] }, // natural yoghurt 5 kg
  { sku: "477055", ref: 10.72, qty: [3, 0, 3, 2, 0, 3, 0, 2] }, // creme fraiche 2 kg
  { sku: "462593", ref: 10.36, qty: [4, 4, 4, 3, 4, 0, 4, 4] }, // Polar cheese slices 1 kg
  // desserts / frozen bakery (Valio, usual)
  { sku: "462988", ref: 2.19, qty: [6, 6, 8, 6, 8, 6, 0, 6] }, // organic bilberry soup 750 g
  { sku: "471066", ref: 19.52, qty: [1, 0, 1, 0, 1, 0, 1, 1] }, // rice pastries, case
  // occasional: meat, vegetables, dry goods, coffee cream
  { sku: "470519", ref: 27.47, qty: [2, 0, 0, 4, 0, 0, 4, 0] }, // Atria minced beef 20 % 2 kg
  { sku: "462903", ref: 7.25, qty: [0, 1, 0, 0, 0, 1, 0, 1] }, // onion 10 kg sack
  { sku: "460811", ref: 1.26, qty: [0, 0, 6, 0, 0, 6, 0, 0] }, // carrot 1 kg bag
  { sku: "467005", ref: 11.71, qty: [1, 0, 0, 0, 0, 1, 0, 0] }, // Fazer fine wheat flour 20 kg
  { sku: "473735", ref: 12.06, qty: [0, 2, 0, 0, 0, 0, 2, 0] }, // basmati rice 5 kg
  { sku: "463442", ref: 2.72, qty: [0, 6, 6, 0, 0, 6, 0, 0] }, // coffee cream 1 l
];
// Weeks (0-based) where cream A could not be delivered and the buyer accepted cream B (20 x 1 l instead of 2 x 10 l).
const A_TO_B_WEEKS = [2, 4, 6];
// Week where cream C was suggested for cream A and declined (A arrived on the next delivery that week).
const A_TO_C_REJECTED_WEEK = 1;

const r2 = (n: number) => Math.round(n * 100) / 100;
// Modest synthetic price drift: about 4 % lower eight weeks ago, rising towards today's level.
const drift = (week: number) => 0.955 + 0.005 * week;

function generate(): { orders: HistoryOrder[]; decisions: HistoryDecision[] } {
  const orders: HistoryOrder[] = ORDER_DATES.map((date, w) => {
    const lines: HistoryLine[] = [];
    for (const s of SEED) {
      const qty = s.qty[w];
      if (!qty) continue;
      const unitPrice = r2(s.ref * (s.drift?.[w] ?? drift(w)));
      lines.push({ sku: s.sku, qty, unitPrice, total: r2(qty * unitPrice) });
    }
    if (A_TO_B_WEEKS.includes(w)) {
      const unitPrice = r2(2.63 * drift(w));
      lines.unshift({
        sku: CREAM_B,
        qty: 20,
        unitPrice,
        total: r2(20 * unitPrice),
        substitutedFor: CREAM_A,
      });
    }
    return {
      id: `hist-${date}`,
      customer: PROFILE_CUSTOMER,
      date,
      lines,
      total: r2(lines.reduce((s, l) => s + l.total, 0)),
      synthetic: true,
    };
  });
  const decisions: HistoryDecision[] = [
    ...A_TO_B_WEEKS.map((w) => ({
      orderId: orders[w].id,
      at: `${ORDER_DATES[w]}T09:30:00.000Z`,
      fromSku: CREAM_A,
      toSku: CREAM_B,
      decision: "accepted" as const,
    })),
    {
      orderId: orders[A_TO_C_REJECTED_WEEK].id,
      at: `${ORDER_DATES[A_TO_C_REJECTED_WEEK]}T09:30:00.000Z`,
      fromSku: CREAM_A,
      toSku: CREAM_C,
      decision: "rejected",
    },
  ];
  return { orders, decisions };
}

const generated = generate();
export const historyOrders = (customer: string): HistoryOrder[] =>
  customer === PROFILE_CUSTOMER ? generated.orders : [];
export const historyDecisions = (customer: string): HistoryDecision[] =>
  customer === PROFILE_CUSTOMER ? generated.decisions : [];
export const hasProfile = (customer: string) => customer === PROFILE_CUSTOMER;

/** Last synthetic price paid for a SKU (null if never bought). Display context only, never a current price. */
export function lastPaid(
  customer: string,
  sku: string,
): { price: number; date: string } | null {
  for (const o of [...historyOrders(customer)].reverse()) {
    const l = o.lines.find((x) => x.sku === sku);
    if (l) return { price: l.unitPrice, date: o.date };
  }
  return null;
}

export function typicalOrderEur(customer: string): number {
  const totals = historyOrders(customer)
    .map((o) => o.total)
    .sort((a, b) => a - b);
  if (!totals.length) return 0;
  const m = totals.length >> 1;
  return r2(totals.length % 2 ? totals[m] : (totals[m - 1] + totals[m]) / 2);
}
