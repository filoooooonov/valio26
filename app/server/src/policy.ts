// Mandate (spend rules) per customer. Enforced HERE, in the gateway, on every order and approval,
// whoever sends it (webshop UI or an outside agent over MCP). Never in an LLM prompt.

export type Mandate = {
  customer: string;
  maxOrderEur: number;
  maxDailyEur: number;
  swapsNeedOk: true;
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
