// Gateway client. Shapes mirror CONTRACT.md v1.1 (app/server is the source of truth).
export type StockLine = {
  sku: string;
  price: number;
  priceWithTax: number;
  taxRate: number;
  comparisonPrice?: number;
  comparisonUnit?: string;
  customerPrice: boolean;
  listPrice?: number;
  available: number | null;
  availableDate?: string;
  closingTime?: string;
  cutoffPassed: boolean;
  logistic?: string;
  deliverable: boolean;
  salesUnit: string;
  error?: string;
};
export type Dish = {
  id: string;
  name: string;
  portions: number;
  basis: string;
  diet: string[];
};
export type Option = {
  sku: string;
  name: string;
  reason: string;
  delta: number;
  qty: number;
  pack: string;
  why: string;
  total: number;
  stock: StockLine;
  contains: string[];
};
export type Issue = {
  kind: "short" | "unavailable" | "cutoff";
  text: string;
  options: Option[];
  decided?: string;
  decidedBy?: string;
};
export type BasketLine = {
  id: string;
  dishId: string | null;
  needIds: string[];
  sku: string;
  name: string;
  brand: string;
  qty: number;
  pack: string;
  why: string;
  stock: StockLine;
  total: number;
  contains: string[];
  claims: string[];
  reliability?: number;
  co2?: number;
  image?: string;
  issue?: Issue;
  replaced?: { sku: string; name: string };
  usedIn?: string[];
};
export type Mandate = {
  customer: string;
  maxOrderEur: number;
  maxDailyEur: number;
  swapsNeedOk: true;
  approver: string;
};
export type MandateResult = {
  state: "agent_may_order" | "needs_your_ok" | "needs_approval";
  reasons: string[];
};
export type Basket = {
  id: string;
  customer: string;
  request: string;
  people: number;
  date: string;
  planner: "llm" | "fallback";
  plannerNote?: string;
  dishes: Dish[];
  lines: BasketLine[];
  assumed: string[];
  notes: string[];
  checkedAt: string;
  apiCalls: number;
  total: number;
  totalWithVat: number;
  openIssues: number;
  totalIfAccepted: number;
  pricesHeldUntil: string | null;
  rules: Mandate;
  mandate: MandateResult;
  createdAt: string;
};
export type Change = {
  sku: string;
  name: string;
  kind: "price" | "stock";
  was: string;
  now: string;
};
export type Order = {
  id: string;
  basketId: string;
  customer: string;
  by: string;
  total: number;
  totalWithVat: number;
  status: "placed" | "pending_approval" | "rejected";
  pricesHeldUntil: string | null;
  createdAt: string;
  mandate: MandateResult;
  lines: {
    sku: string;
    name: string;
    qty: number;
    pack: string;
    price: number;
    total: number;
  }[];
  changes: Change[];
  apiCalls: number;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
};
export type AuditEvent = {
  at: string;
  actor: string;
  kind: string;
  summary: string;
  data?: Record<string, unknown>;
};

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function call<T>(
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const r = await fetch(
    `/api${path}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 409)
    throw new ApiError(
      r.status,
      (data as { error?: string }).error ?? r.statusText,
      data,
    );
  return { status: r.status, data: data as T };
}

export const BUYER = "Anna K.";
export const APPROVER = "Mikko L.";

export const api = {
  mandate: (customer: string) =>
    call<Mandate>(`/mandate/${customer}`).then((r) => r.data),
  build: (request: string, date: string) =>
    call<Basket>("/basket", { request, date }).then((r) => r.data),
  edit: (
    id: string,
    lineId: string,
    e: { qty?: number; chooseOption?: string },
  ) =>
    call<Basket>(`/basket/${id}/lines/${lineId}`, { ...e, by: BUYER }).then(
      (r) => r.data,
    ),
  order: (id: string) =>
    call<Order | { error: string; mandate: MandateResult }>(
      `/basket/${id}/order`,
      { by: BUYER },
    ),
  decide: (orderId: string, decision: "approve" | "reject", note?: string) =>
    call<Order>(`/orders/${orderId}/decision`, {
      decision,
      by: APPROVER,
      note,
    }).then((r) => r.data),
  audit: (orderId: string) =>
    call<AuditEvent[]>(`/orders/${orderId}/audit`).then((r) => r.data),
};
