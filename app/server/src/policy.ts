import { readLedger, writeLedger } from "./ledger";
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
  forbiddenAllergens: string[];
  substitutionsPermitted: boolean;
  allowedCategories: string[];
  requireApproval: boolean;
  maxSubstituteIncreasePct: number;
  allowedDeliveryWeekdays: number[];
  /** Explicit, user-granted standing permissions (CONTRACT S48). Preference memory never creates or widens these.
   *  Revoked permissions stay listed with revokedAt (audit). */
  substitutionPermissions: SubstitutionPermission[];
};
export type SubstitutionPermission = {
  id: string;
  customer: string;
  fromSku: string;
  toSku: string;
  maxIncreasePct: number;
  grantedBy: string;
  grantedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  revokedBy?: string;
};

let permissions: SubstitutionPermission[] = readLedger<SubstitutionPermission[]>("permissions", []);
export const listPermissions = (customer: string) => permissions.filter((p) => p.customer === customer);
export const isActivePermission = (p: SubstitutionPermission, now = Date.now()) =>
  !p.revokedAt && (!p.expiresAt || Date.parse(p.expiresAt) > now);
export const activePermission = (customer: string, fromSku: string, toSku: string) =>
  listPermissions(customer).find((p) => p.fromSku === fromSku && p.toSku === toSku && isActivePermission(p));
export function grantPermission(customer: string, x: { fromSku: string; toSku: string; maxIncreasePct: number; grantedBy: string; expiresAt?: string }): SubstitutionPermission {
  // One active permission per pair: a new grant replaces (revokes) the previous one so the latest explicit choice applies.
  const now = new Date().toISOString();
  for (const p of listPermissions(customer))
    if (p.fromSku === x.fromSku && p.toSku === x.toSku && isActivePermission(p)) { p.revokedAt = now; p.revokedBy = x.grantedBy; }
  const perm: SubstitutionPermission = {
    id: "perm_" + Math.random().toString(36).slice(2, 8),
    customer,
    fromSku: x.fromSku,
    toSku: x.toSku,
    maxIncreasePct: x.maxIncreasePct,
    grantedBy: x.grantedBy,
    grantedAt: now,
    ...(x.expiresAt ? { expiresAt: x.expiresAt } : {}),
  };
  permissions.push(perm);
  writeLedger("permissions", permissions);
  return perm;
}
export function revokePermission(customer: string, id: string, by: string): SubstitutionPermission | undefined {
  const p = listPermissions(customer).find((x) => x.id === id);
  if (!p) return undefined;
  if (!p.revokedAt) { p.revokedAt = new Date().toISOString(); p.revokedBy = by; writeLedger("permissions", permissions); }
  return p;
}
export function resetPermissions() { permissions = []; writeLedger("permissions", permissions); }
/** Dev reset: drop persisted policy overrides so every account is back to its default mandate. */
export function resetMandates() { overrides.clear(); writeLedger("policies", []); }
export type MandateState =
  "agent_may_order" | "needs_your_ok" | "needs_approval";
export type MandateResult = { state: MandateState; reasons: string[] };

const overrides = new Map<string, Partial<Mandate>>(readLedger("policies", []));

export function getMandate(customer: string): Mandate {
  return {
    customer,
    maxOrderEur: Number(process.env.APPROVAL_SPEND_LIMIT_EUR ?? 500) || 500,
    maxDailyEur: 1500,
    swapsNeedOk: true,
    // Bistro Kallio (account 123, synthetic profile) has no account-wide same-use rule: only explicit permissions swap.
    autoSwapSameUse: customer !== "123",
    approver: "Mikko L.",
    forbiddenAllergens: [],
    substitutionsPermitted:true,
    allowedCategories: [],
    requireApproval: false,
    maxSubstituteIncreasePct: 20,
    allowedDeliveryWeekdays: [],
    ...overrides.get(customer),
    substitutionPermissions: listPermissions(customer).map((p) => ({ ...p })),
  };
}
export const setMandate = (customer: string, m: Partial<Mandate>) => {
  const { substitutionPermissions: _ignored, ...rest } = m; // permissions only change through grant/revoke
  overrides.set(customer, { ...overrides.get(customer), ...rest });
  writeLedger("policies", [...overrides]);
};

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
  substituteIncreases?: {name:string;percent:number}[];
  deliveryLabel?: string; // "Fri 20 Nov"
  stockToConfirm?: string[]; // products whose stock Valio cannot confirm: a person confirms before placing
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

  for(const increase of x.substituteIncreases ?? []) if(increase.percent > m.maxSubstituteIncreasePct) reasons.push(`${increase.name}: substitute price increase ${increase.percent.toFixed(1)}% exceeds the ${m.maxSubstituteIncreasePct}% autonomous allowance.`);
  if (x.stockToConfirm?.length)
    reasons.push(
      `Valio can't confirm stock for ${x.stockToConfirm.join(", ")}, so ${m.approver} confirms it before the order is placed.`,
    );
  if (m.requireApproval) reasons.push("Customer policy requires human financial approval.");
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
