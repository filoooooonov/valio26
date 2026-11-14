// Mandate (spend rules) per customer. Enforced HERE, in the gateway, on every order and approval,
// whoever sends it (webshop UI or an outside agent over MCP). Never in an LLM prompt.

export type Mandate = {
  customer: string;
  maxOrderEur: number;
  maxDailyEur: number;
  swapsNeedOk: true;
  /** Like-for-like swaps (same product group, no new allergens, not fish/meat, at most +20 % or +€25) are
   *  made by the gateway under this rule and logged; every other swap waits for the buyer. */
  autoSwapSameUse: boolean;
  approver: string;
};
export type MandateState =
  "agent_may_order" | "needs_your_ok" | "needs_approval";
export type MandateResult = { state: MandateState; reasons: string[] };

const overrides = new Map<string, Partial<Mandate>>();

export function getMandate(customer: string): Mandate {
  return {
    customer,
    maxOrderEur: Number(process.env.APPROVAL_SPEND_LIMIT_EUR ?? 500) || 500,
    maxDailyEur: 1500,
    swapsNeedOk: true,
    autoSwapSameUse: true,
    approver: "Mikko L.",
    ...overrides.get(customer),
  };
}
export const setMandate = (customer: string, m: Partial<Mandate>) =>
  overrides.set(customer, m);

export const eur = (n: number) =>
  "€" +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export type MandateInput = {
  total: number; // EUR excl. VAT of what would be ordered
  openSwaps: { name: string; text: string }[]; // issues still waiting for the buyer's choice
  undecidedBy?: string[]; // swaps decided by someone who is not the buyer (e.g. an agent)
  dailySoFar: number; // placed + pending orders today for this customer
  deliveryLabel?: string; // "Fri 20 Nov"
};

/** Pure: same input, same verdict. Order: buyer's OK first (nothing can be ordered with an open swap), then limits. */
export function evaluate(m: Mandate, x: MandateInput): MandateResult {
  const reasons: string[] = [];
  if (x.openSwaps.length) {
    const n = x.openSwaps.length;
    reasons.push(
      `${n} product${n > 1 ? "s" : ""} can't be delivered as asked, so ${n > 1 ? "they need" : "it needs"} your choice first: ${x.openSwaps
        .map((s) => s.name)
        .join(", ")}.`,
    );
  }
  for (const who of x.undecidedBy ?? [])
    reasons.push(
      `A swap was chosen by ${who}, not by you. Swaps always need your OK.`,
    );
  if (reasons.length) return { state: "needs_your_ok", reasons };

  const over = Math.round((x.total - m.maxOrderEur) * 100) / 100;
  if (over > 0)
    reasons.push(
      `${eur(x.total)} is ${eur(over)} over your ${eur(m.maxOrderEur)} per-order limit, so ${m.approver} approves it.`,
    );
  const day = Math.round((x.dailySoFar + x.total) * 100) / 100;
  if (day > m.maxDailyEur)
    reasons.push(
      `With today's other orders (${eur(x.dailySoFar)}) this makes ${eur(day)}, over the ${eur(m.maxDailyEur)} daily limit, so ${m.approver} approves it.`,
    );
  if (reasons.length) return { state: "needs_approval", reasons };

  return {
    state: "agent_may_order",
    reasons: [
      `${eur(x.total)} is within your ${eur(m.maxOrderEur)} per-order limit (${eur(day)} of ${eur(m.maxDailyEur)} today).`,
      `Every product can be delivered${x.deliveryLabel ? ` on ${x.deliveryLabel}` : ""} and no swap is waiting for you.`,
    ],
  };
}

export type MatrixRow = { decision: string; who: "gateway" | "buyer" | "approver"; rule: string };
/** The mandate as a readable table: what the gateway does on its own, what needs the buyer, what needs the approver. */
export function decisionMatrix(m: Mandate): MatrixRow[] {
  return [
    { decision: "Look up products, prices and stock", who: "gateway", rule: "Only for the shortlisted products of this request, never the whole catalogue." },
    m.autoSwapSameUse
      ? { decision: "Same-use swap", who: "gateway", rule: "Same product group, no new allergens, not fish or meat, at most +20 % or +€25. Logged in the audit trail." }
      : { decision: "Same-use swap", who: "buyer", rule: "Automatic swaps are switched off for this customer." },
    { decision: "Any other substitution", who: "buyer", rule: "The buyer chooses from ranked Best / Better / Good options, or keeps what is available, or removes the line." },
    { decision: "A swap chosen by an outside agent", who: "buyer", rule: "Does not count as the buyer's OK. The buyer confirms it." },
    { decision: `Order up to ${eur(m.maxOrderEur)}`, who: "buyer", rule: `The buyer confirms; the gateway records it. Today's orders must stay under ${eur(m.maxDailyEur)}.` },
    { decision: `Order over ${eur(m.maxOrderEur)}`, who: "approver", rule: `${m.approver} approves. Price and stock are re-checked at approval.` },
    { decision: `Today's orders over ${eur(m.maxDailyEur)}`, who: "approver", rule: `${m.approver} approves, so splitting one order into several small ones is caught.` },
    { decision: "Approve an order", who: "approver", rule: `Only ${m.approver}. An agent cannot approve its own order (HTTP 403).` },
  ];
}
