// Gateway client. Shapes mirror CONTRACT.md v1.2 (app/server is the source of truth).
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
  frozen?: boolean;
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
  excludedQty?: number;
  frozen?: boolean;
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

export type ChatAction = {
  kind: "set_guests" | "set_qty" | "choose_option" | "remove_line" | "add_product" | "replan";
  summary: string;
  lineId?: string;
  label?: string;
  category?: string;
};
export type ChatReply = {
  reply: string;
  actions: ChatAction[];
  basket: Basket;
  question?: string;
};
export type OrderConflict = {
  error: string;
  mandate?: MandateResult;
  changes?: Change[];
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
  signal?: AbortSignal,
): Promise<{ status: number; data: T }> {
  let r: Response;
  try {
    r = await fetch(`/api${path}`, {
      signal,
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Network error", null);
  }
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
export const isNotFound = (e: unknown) =>
  e instanceof ApiError && e.status === 404;

export type RecipeProposal = {id:string; from:string; to:string; before:BasketLine[]; after:BasketLine[]; totalBefore:number; totalAfter:number};
const checkedData = <T,>(r:{status:number;data:T}) => { if (r.status >= 400) throw new ApiError(r.status,(r.data as {error?:string}).error ?? 'Request failed',r.data); return r.data; };

export type MenuItem = { title: string; description: string; course: "starter" | "main" | "dessert" | "drinks" | "side" | "snack" | "other" };
export type MenuReply = { items: MenuItem[]; reply: string; planner: "llm" | "fallback" };

export const api = {
  undo: (id: string) => call<{ basket: Basket; canUndo: boolean }>(`/basket/${id}/undo`, { by: BUYER }).then(checkedData),
  menu: (body: { request: string; current?: MenuItem[]; instruction?: string }, signal?: AbortSignal) => call<MenuReply>("/menu", body, signal).then(checkedData),
  checkReplacements: (id:string,lineId:string) => call<Basket>(`/basket/${id}/lines/${lineId}/replacements/check`,{}).then(checkedData),
  recipeChange: (id:string,lineId:string) => call<RecipeProposal>(`/basket/${id}/lines/${lineId}/recipe-change`,{}).then(checkedData),
  applyRecipeChange: (id:string,proposalId:string) => call<Basket>(`/basket/${id}/recipe-change/${proposalId}/apply`,{}).then(checkedData),
  mandate: (customer: string) =>
    call<Mandate>(`/mandate/${customer}`).then((r) => r.data),
  build: (
    request: string,
    date: string,
    people?: number,
    signal?: AbortSignal,
  ) =>
    call<Basket>("/basket", { request, date, people }, signal).then(
      (r) => r.data,
    ),
  basket: (id: string) => call<Basket>(`/basket/${id}`).then((r) => r.data),
  basketAudit: (id: string) =>
    call<AuditEvent[]>(`/basket/${id}/audit`).then((r) => r.data),
  edit: (
    id: string,
    lineId: string,
    e: { qty?: number; chooseOption?: string; included?: boolean },
  ) =>
    call<Basket>(`/basket/${id}/lines/${lineId}`, { ...e, by: BUYER }).then(checkedData),
  // v1.2: may 404 on an older gateway; callers fall back.
  guests: (id: string, people: number) =>
    call<Basket>(`/basket/${id}/guests`, { people, by: BUYER }).then(
      (r) => r.data,
    ),
  chat: (id: string, text: string) =>
    call<ChatReply>(`/basket/${id}/chat`, { text, by: BUYER }).then(
      (r) => r.data,
    ),
  image: (sku: string) =>
    call<{ url: string | null }>(`/products/${sku}/image`).then(
      (r) => r.data.url,
    ),
  stock: (skus: string[], date: string) =>
    call<{ checkedAt: string; lines: StockLine[] }>("/stock", {
      skus,
      date,
    }).then((r) => r.data),
  order: (id: string) => call<Order | OrderConflict>(`/basket/${id}/order`, { by: BUYER }),
  getOrder: (id: string) => call<Order>(`/orders/${id}`).then((r) => r.data),
  orders: (status?: string) =>
    call<Order[]>(`/orders${status ? `?status=${status}` : ""}`).then(
      (r) => r.data,
    ),
  decide: (orderId: string, decision: "approve" | "reject", note?: string) =>
    call<Order | OrderConflict>(`/orders/${orderId}/decision`, {
      decision,
      by: APPROVER,
      note: note || undefined,
    }),
  audit: (orderId: string) =>
    call<AuditEvent[]>(`/orders/${orderId}/audit`).then((r) => r.data),
};
