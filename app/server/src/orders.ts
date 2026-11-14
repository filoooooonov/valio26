// Orders: the mandate is checked here on EVERY order and approval, whoever sends it (webshop or MCP agent).
// Price + stock are re-checked with a fresh Valio call at order time and again at approval; differences are reported.
import { orderRevision, validatePurchase } from "./validation";
import { audit } from "./audit";
import { HttpError, isOpen, recompute, type Basket } from "./plan";
import { eur, evaluate, getMandate, type MandateResult } from "./policy";
import { baskets, dailySoFar, newId, orders, persistStore, submitting } from "./store";
import { checkStock } from "./valio";

export type Change = {
  sku: string;
  name: string;
  kind: "price" | "stock";
  was: string;
  now: string;
};
export type OrderLine = {
  sku: string;
  name: string;
  qty: number;
  pack: string;
  price: number;
  total: number;
};
export type Order = {
  id: string;
  simulated: true;
  confirmationReference?: string;
  revision: string;
  deliveryDate: string;
  basketId: string;
  customer: string;
  by: string;
  total: number;
  totalWithVat: number;
  status: "placed" | "pending_approval" | "rejected";
  pricesHeldUntil: string | null;
  createdAt: string;
  mandate: MandateResult;
  lines: OrderLine[];
  changes: Change[]; // price/stock differences found by the last re-check
  apiCalls: number; // Valio calls made by order + approval re-checks
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Fresh price + stock for every line that will be ordered. Updates the basket; returns differences. */
async function recheck(
  b: Basket,
  actor: string,
): Promise<{ changes: Change[]; calls: number }> {
  const live = b.lines.filter((l) => l.qty > 0 && !isOpen(l));
  if (!live.length) return { changes: [], calls: 0 };
  const sc = await checkStock(
    live.map((l) => l.sku),
    b.date,
    b.customer,
    { fresh: true },
  );
  const now = new Map(sc.lines.map((s) => [s.sku, s]));
  const changes: Change[] = [];
  for (const l of live) {
    const s = now.get(l.sku);
    if (!s) continue;
    if (Math.abs(s.price - l.stock.price) > 0.004)
      changes.push({
        sku: l.sku,
        name: l.name,
        kind: "price",
        was: eur(l.stock.price),
        now: eur(s.price),
      });
    const okBefore = l.stock.deliverable && !l.stock.cutoffPassed;
    const okNow =
      s.deliverable &&
      !s.cutoffPassed &&
      (s.available == null || s.available >= l.qty);
    if (okBefore && !okNow) {
      changes.push({
        sku: l.sku,
        name: l.name,
        kind: "stock",
        was: "deliverable",
        now: s.cutoffPassed
          ? "cut-off passed"
          : !s.deliverable
            ? "no delivery date"
            : `only ${s.available} left`,
      });
      l.issue = {
        kind: s.cutoffPassed
          ? "cutoff"
          : !s.deliverable
            ? "unavailable"
            : "short",
        text: `Changed since the basket was built: ${s.cutoffPassed ? "ordering closed" : !s.deliverable ? "no delivery date any more" : `only ${s.available} left`}.`,
        options: [],
      };
    }
    l.stock = s;
    l.total = r2(l.qty * s.price);
  }
  b.checkedAt = sc.checkedAt;
  b.apiCalls += sc.calls;
  recompute(b);
  audit(
    b.id,
    "gateway",
    "recheck",
    `Re-checked ${sc.skus} products (${sc.calls} API calls): ${changes.length ? changes.map((c) => `${c.name} ${c.was} → ${c.now}`).join("; ") : "no changes"}`,
    { calls: sc.calls, changes, by: actor,source:sc.source,snapshot:sc.lines },
  );
  return { changes, calls: sc.calls };
}

export type PlaceResult =
  | { ok: true; order: Order }
  | {
      ok: false;
      status: 404 | 409;
      error: string;
      mandate?: MandateResult;
      changes?: Change[];
    };

async function placeOrderInternal(
  basketId: string,
  by: string,
): Promise<PlaceResult> {
  const b = baskets.get(basketId);
  if (!b) return { ok: false, status: 404, error: "basket not found" };
  const active = [...orders.values()].find(
    (o) => o.basketId === b.id && o.status !== "rejected",
  );
  if (active)
    return {
      ok: false,
      status: 409,
      error: `basket already ordered as ${active.id} (${active.status})`,
    };

  const { changes, calls } = await recheck(b, by);
  const checks = validatePurchase(b);
  if (checks.length) {
    audit(b.id, "gateway", "validation", "Not ordered: " + checks.map(c => c.message).join(" "), {checks, snapshot:b.lines.map(l=>({sku:l.sku,stock:l.stock})), simulated:true});
    return {ok:false, status:409, error:"validation_failed", mandate:{state:"needs_your_ok", reasons:checks.map(c=>c.message)}, changes};
  }
  const m = evaluate(getMandate(b.customer), {
    total: b.total,
    openSwaps: b.lines
      .filter(isOpen)
      .map((l) => ({ name: l.name, text: l.issue!.text })),
    undecidedBy: b.lines
      .filter((l) => l.issue?.decided && l.issue.decidedBy?.startsWith("agent"))
      .map((l) => `${l.issue!.decidedBy} (${l.name})`),
    dailySoFar: dailySoFar(b.customer, b.id),
    substituteIncreases:b.lines.filter(l=>l.qty>0 && l.replaced).map(l=>({name:l.name,percent:l.replaced!.originalTotal ? 100*(l.total/l.replaced!.originalTotal-1) : Infinity})),
  });
  b.mandate = m;
  if (m.state === "needs_your_ok") {
    audit(b.id, "gateway", "order", `Not ordered: ${m.reasons.join(" ")}`, {
      by,
      state: m.state,
    });
    return {
      ok: false,
      status: 409,
      error: "needs_your_ok",
      mandate: m,
      changes,
    };
  }
  if (b.total <= 0)
    return { ok: false, status: 409, error: "nothing to order" };

  const order: Order = {
    id: newId("o"),
    simulated: true,
    revision: orderRevision(b),
    deliveryDate: b.date,
    basketId: b.id,
    customer: b.customer,
    by,
    total: b.total,
    totalWithVat: b.totalWithVat,
    status: m.state === "agent_may_order" ? "placed" : "pending_approval",
    pricesHeldUntil: b.pricesHeldUntil,
    createdAt: new Date().toISOString(),
    mandate: m,
    lines: b.lines
      .filter((l) => l.qty > 0 && !isOpen(l))
      .map((l) => ({
        sku: l.sku,
        name: l.name,
        qty: l.qty,
        pack: l.pack,
        price: l.stock.price,
        total: l.total,
      })),
    changes,
    apiCalls: calls,
  };
  if (order.status === "placed") order.confirmationReference = `SIM-${order.id}`;
  orders.set(order.id, order);
  audit(
    b.id,
    by,
    "order",
    order.status === "placed"
      ? `Simulated local order ${order.id} confirmed (not sent to Valio Aimo): ${eur(order.total)} excl. VAT, ${order.lines.length} lines`
      : `Order ${order.id} sent to ${getMandate(b.customer).approver} for approval: ${m.reasons.join(" ")}`,
    {
      orderId: order.id,
      status: order.status,
      total: order.total,
      pricesHeldUntil: order.pricesHeldUntil,
      simulated: true, revision:order.revision, customer:b.customer, date:b.date,
      snapshot:b.lines.map(l=>({sku:l.sku,qty:l.qty,stock:l.stock,contains:l.contains,claims:l.claims})),
    },
  );
  return { ok: true, order };
}

export type Decision = {
  decision: "approve" | "reject";
  by: string;
  note?: string;
  revision?: string;
};

async function decideInternal(orderId: string, d: Decision): Promise<Order> {
  const o = orders.get(orderId);
  if (!o) throw new HttpError(404, "order not found");
  if (o.status !== "pending_approval")
    throw new HttpError(409, `order is ${o.status}, nothing to decide`);
  if (d.decision !== "approve" && d.decision !== "reject")
    throw new HttpError(400, 'decision must be "approve" or "reject"');
  const m = getMandate(o.customer);
  if (d.by !== m.approver || d.by === o.by) {
    audit(
      o.basketId,
      d.by || "unknown",
      "decision",
      `Refused: only ${m.approver} can approve or reject this order`,
      { orderId },
    );
    throw new HttpError(
      403,
      `only ${m.approver} can approve or reject orders over the mandate`,
    );
  }
  const b = baskets.get(o.basketId);
  if (d.decision === "approve" && !b) throw new HttpError(409, "basket missing; approval cannot be verified");
  if (d.revision && d.revision !== o.revision) throw new HttpError(409, "stale approval revision; review the current order");
  if (d.decision === "approve" && b) {
    if (orderRevision(b) !== o.revision) {
      o.status = "rejected";
      audit(b.id,"gateway","decision","Order revision changed; send the revised basket for approval again.",{orderId});
      throw new HttpError(409,"the basket changed after it was sent for approval; send it again");
    }
    const { changes, calls } = await recheck(b, d.by);
    o.changes = changes;
    o.apiCalls += calls;
    const checks = validatePurchase(b);
    if (b.lines.some(isOpen) || checks.length) {
      audit(
        o.basketId,
        "gateway",
        "decision",
        `Not placed: something changed and needs the buyer's choice first`,
        { orderId, changes },
      );
      throw new HttpError(
        409,
        `stock changed since the order was sent: ${changes.map((c) => `${c.name} ${c.now}`).join("; ")}`,
      );
    }
    const changedRevision = orderRevision(b) !== o.revision;
    o.total = b.total;
    o.totalWithVat = b.totalWithVat;
    o.pricesHeldUntil = b.pricesHeldUntil;
    o.lines = b.lines
      .filter((l) => l.qty > 0 && !isOpen(l))
      .map((l) => ({
        sku: l.sku,
        name: l.name,
        qty: l.qty,
        pack: l.pack,
        price: l.stock.price,
        total: l.total,
      }));
    o.revision = orderRevision(b);
    if (changedRevision) {
      audit(b.id,"gateway","decision","Fresh prices changed the order. Review the updated amount before approving again.",{orderId,revision:o.revision,changes});
      throw new HttpError(409,"prices changed; review the updated order and approve its new revision");
    }
  }
  o.status = d.decision === "approve" ? "placed" : "rejected";
  if (o.status === "placed") o.confirmationReference = `SIM-${o.id}`;
  o.decidedBy = d.by;
  o.decidedAt = new Date().toISOString();
  if (d.note) o.note = d.note;
  audit(
    o.basketId,
    d.by,
    "decision",
    `${d.decision === "approve" ? "Approved" : "Rejected"} ${o.id} (${eur(o.total)})${d.note ? `: "${d.note}"` : ""}${o.changes.length ? ` · ${o.changes.length} changes since the quote` : ""}`,
    { orderId: o.id, status: o.status },
  );
  return o;
}

export const listOrders = (status?: string) =>
  [...orders.values()]
    .filter((o) => !status || o.status === status)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

// Serialize mutations across customers too: daily limits and duplicate checks must be atomic in this process.
let orderQueue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const result = orderQueue.then(fn).finally(() => persistStore());
  orderQueue = result.catch(() => undefined);
  return result;
}
export const placeOrder = (basketId:string, by:string) => serial(async()=>{submitting.add(basketId);try{return await placeOrderInternal(basketId,by);}finally{submitting.delete(basketId);}});
export const decide = (orderId:string, decision:Decision) => serial(()=>decideInternal(orderId,decision));
