import { Button, Card, Checkbox, Notice, Stepper } from "../ui";
import type { PurchasingPolicy } from "../api";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  APPROVER,
  type Basket,
  type Order,
  type OrderConflict,
} from "../api";
import { Icon } from "../icons";
import { addDays, dayLabel, money, n2, SLOT, stamp, timeLabel, whole } from "../format";
import { firstName, orderLabel, PEOPLE } from "../thread";
import { AimoLogo } from "./Mark";

// Mikko's view (?view=mikko): the approver's phone card from the states board. Lists pending orders and
// decides them through POST /api/orders/:id/decision as the mandate approver.
export function MikkoView() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [baskets, setBaskets] = useState<Record<string, Basket>>({});
  const [done, setDone] = useState<{ order: Order; failed?: string }[]>([]);
  const [offline, setOffline] = useState(false);
  const [policy,setPolicy]=useState<PurchasingPolicy|null>(null);
  const [policyMessage,setPolicyMessage]=useState("");
  const [savingPolicy,setSavingPolicy]=useState(false);
  const [policyRole,setPolicyRole]=useState("");
  useEffect(()=>{api.commerceContext().then(c=>{setPolicy(c.policy);setPolicyRole(c.role);}).catch(()=>undefined);},[]);
  async function savePolicy(){if(!policy)return;setSavingPolicy(true);setPolicyMessage("");try{setPolicy(await api.savePolicy(policy));setPolicyMessage("Purchasing policy saved on the server.");}catch(e){setPolicyMessage((e as Error).message);}finally{setSavingPolicy(false);}}


  const canEditPolicy = ["admin","local_demo"].includes(policyRole);
  const load = useCallback(async () => {
    try {
      const os = await api.orders("pending_approval");
      setOrders(os);
      setOffline(false);
      for (const o of os)
        if (!baskets[o.basketId])
          api
            .basket(o.basketId)
            .then((b) => setBaskets((m) => ({ ...m, [b.id]: b })))
            .catch(() => undefined);
    } catch {
      setOffline(true);
    }
  }, [baskets]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="mikko">
      <header className="mikko__bar">
        <AimoLogo />
        <span className="mikko__who">
          {PEOPLE[APPROVER]?.name ?? APPROVER} · {PEOPLE[APPROVER]?.role}
        </span>
      </header>
      <main className="mikko__list">
        {policy && <details className="purchasing-policy">
          <summary>Purchasing policy <Icon name="chevron-down" className="i-16"/></summary>
          <Card title="Purchasing policy">
            <div className="policy-editor">
              {policyRole==="local_demo" && <Notice title="Local demonstration">Orders are simulated. Configure account credentials before sharing this gateway.</Notice>}
              <div className="policy-editor__fields">
                <div className="policy-editor__field"><div><h4>Per-order limit</h4><p>Orders above this need approval.</p></div><Stepper value={money(policy.maxOrderEur)} lessDisabled={savingPolicy || policy.maxOrderEur<=0 || !canEditPolicy} moreDisabled={savingPolicy || !canEditPolicy} onLess={()=>setPolicy({...policy,maxOrderEur:Math.max(0,policy.maxOrderEur-50)})} onMore={()=>setPolicy({...policy,maxOrderEur:policy.maxOrderEur+50})}/></div>
                <div className="policy-editor__field"><div><h4>Daily limit</h4><p>Includes pending orders.</p></div><Stepper value={money(policy.maxDailyEur)} lessDisabled={savingPolicy || policy.maxDailyEur<=0 || !canEditPolicy} moreDisabled={savingPolicy || !canEditPolicy} onLess={()=>setPolicy({...policy,maxDailyEur:Math.max(0,policy.maxDailyEur-100)})} onMore={()=>setPolicy({...policy,maxDailyEur:policy.maxDailyEur+100})}/></div>
                <div className="policy-editor__field"><div><h4>Substitute price increase</h4><p>Maximum allowed automatically.</p></div><Stepper value={`${policy.maxSubstituteIncreasePct}%`} lessDisabled={savingPolicy || policy.maxSubstituteIncreasePct<=0 || !canEditPolicy} moreDisabled={savingPolicy || policy.maxSubstituteIncreasePct>=100 || !canEditPolicy} onLess={()=>setPolicy({...policy,maxSubstituteIncreasePct:Math.max(0,policy.maxSubstituteIncreasePct-5)})} onMore={()=>setPolicy({...policy,maxSubstituteIncreasePct:Math.min(100,policy.maxSubstituteIncreasePct+5)})}/></div>
              </div>
              <div className="policy-editor__checks">
                <div><Checkbox checked={policy.requireApproval} label="Always require financial approval" disabled={savingPolicy || !canEditPolicy} onChange={value=>setPolicy({...policy,requireApproval:value})}/><span>Always require financial approval</span></div>
                <div><Checkbox checked={policy.substitutionsPermitted} label="Permit substitutions" disabled={savingPolicy || !canEditPolicy} onChange={value=>setPolicy({...policy,substitutionsPermitted:value})}/><span>Permit substitutions</span></div>
                <div><Checkbox checked={policy.autoSwapSameUse} label="Allow verified same-use substitutions" disabled={savingPolicy || !canEditPolicy} onChange={value=>setPolicy({...policy,autoSwapSameUse:value})}/><span>Choose verified substitutes automatically</span></div>
              </div>
              <div className="policy-editor__allergens"><div><h4>Excluded allergens</h4><p>Missing safety evidence stops the order.</p></div><div className="policy-editor__allergen-grid">
                {[["AM","Milk"],["AP","Peanuts"],["AN","Nuts"],["AW","Gluten"]].map(([code,label])=><div key={code}><Checkbox checked={policy.forbiddenAllergens.includes(code)} label={`Forbid ${label}`} disabled={savingPolicy || !canEditPolicy} onChange={value=>setPolicy({...policy,forbiddenAllergens:value?[...policy.forbiddenAllergens,code]:policy.forbiddenAllergens.filter(a=>a!==code)})}/><span>{label}</span></div>)}
              </div></div>
              {canEditPolicy && <div className="policy-editor__actions"><Button onClick={()=>void savePolicy()} loading={savingPolicy} disabled={savingPolicy}>Save policy</Button></div>}
              {policyMessage && <Notice>{policyMessage}</Notice>}
            </div>
          </Card>
        </details>}

        {offline && (
          <div className="card" role="alert">
            <b className="notice__title">Can't reach Valio Aimo</b>
            <p className="notice__text">Retrying every 3 s.</p>
          </div>
        )}
        {done.map((d) => (
          <Outcome key={d.order.id + (d.failed ?? "")} d={d} basket={baskets[d.order.basketId]} onBack={() => setDone((x) => x.filter((y) => y !== d))} />
        ))}
        {orders && orders.length === 0 && !done.length && (
          <p className="mikko__empty">Nothing waits for your approval.</p>
        )}
        {orders?.map((o) => (
          <Approval
            key={o.id}
            order={o}
            basket={baskets[o.basketId]}
            onDone={(order, failed) => {
              setDone((d) => [{ order, failed }, ...d]);
              load();
            }}
          />
        ))}
      </main>
    </div>
  );
}

function Approval({
  order,
  basket,
  onDone,
}: {
  order: Order;
  basket?: Basket;
  onDone: (o: Order, failed?: string) => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reminded, setReminded] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        setReminded(localStorage.getItem(`remind:${order.id}`));
      } catch {
        setReminded(null);
      }
    };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, [order.id]);

  async function decide(d: "approve" | "reject") {
    setBusy(d);
    setFailed(null);
    try {
      const r = await api.decide(order.id, d, note, order.revision);
      if (r.status === 409) {
        const c = r.data as OrderConflict;
        setFailed(
          c.changes?.length
            ? `Stock or prices changed: ${c.changes.map((x) => `${x.name} ${x.was} → ${x.now}`).join("; ")}.`
            : (c.error ?? "Valio Aimo didn't confirm."),
        );
        return;
      }
      onDone(r.data as Order);
    } catch (e) {
      setFailed((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const buyer = PEOPLE[order.by]?.name ?? order.by;
  const max = basket?.rules.maxOrderEur ?? 500;
  return (
    <article className="approval">
      <div className="approval__from">
        <span className="avatar avatar--teal">{order.by.startsWith("agent") ? "AI" : "AV"}</span>
        <span>
          <b>{firstName(order.by)} asks you to approve</b>
          <span className="muted-12">
            Bistro Kallio · {timeLabel(order.createdAt)}
            {reminded ? ` · reminded ${timeLabel(reminded)}` : ""}
          </span>
        </span>
      </div>
      <h1 className="approval__title">
        {basket?.intent === "DIRECT_PURCHASE" && basket.lines[0]?.comparison
          ? `${basket.lines[0].comparison.query.charAt(0).toUpperCase()}${basket.lines[0].comparison.query.slice(1)}, ${n2(basket.lines[0].comparison.requested.qty)} ${basket.lines[0].comparison.requested.unit.toLowerCase()}`
          : basket?.people
          ? `Catering for ${basket.people} · ${dayLabel(addDays(basket.date, 1))}`
          : `Order ${orderLabel(order.id)}`}
      </h1>
      <p className="approval__meta">
        {order.lines.length} {order.lines.length === 1 ? "product" : "products"}
        {basket ? ` · delivery ${dayLabel(basket.date)}, ${SLOT}` : ""}
      </p>
      <div className="approval__total">
        <span>Total excl. VAT</span>
        <b>{money(order.total)}</b>
      </div>
      <div className="approval__why">
        <Icon name="scale" className="i-16" />
        <span>
          {order.total > max
            ? `${money(order.total - max)} over the ${whole(max)} limit for assistant orders.`
            : `With today's other orders this is over the ${whole(basket?.rules.maxDailyEur ?? 1500)} daily limit.`}
        </span>
      </div>
      {order.mandate?.reasons.some((r) => /can't confirm stock/.test(r)) && (
        <div className="approval__why">
          <Icon name="package" className="i-16" />
          <span>
            Valio can't confirm stock for {order.lines.length === 1 ? "this volume" : "some products"}. Approving
            confirms you've checked stock with Valio.
          </span>
        </div>
      )}
      <details className="approval__lines">
        <summary>{order.lines.length === 1 ? "See the product" : `See the ${order.lines.length} products`}</summary>
        <ul>
          {order.lines.map((l) => (
            <li key={l.sku}>
              <span>{l.name}</span>
              <b>{money(l.total)}</b>
            </li>
          ))}
        </ul>
      </details>
      <label className="sr-only" htmlFor={"note-" + order.id}>
        Note for {buyer}
      </label>
      <input
        id={"note-" + order.id}
        className="approval__note"
        placeholder="Add a note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {failed && (
        <div className="approval__failed" role="alert">
          <Icon name="circle-x" className="i-16" />
          <span>
            <b>Valio Aimo didn't confirm.</b> {failed} Nothing was ordered.
          </span>
        </div>
      )}
      <div className="approval__actions">
        <button
          className="btn btn--lime btn--lg"
          disabled={!!busy}
          onClick={() => decide("approve")}
        >
          <Icon
            name={busy === "approve" ? "loader" : "check"}
            className={"i-16" + (busy === "approve" ? " spin" : "")}
          />
          {failed ? "Try again" : "Approve and send"}
        </button>
        <button
          className="btn btn--outline btn--lg"
          disabled={!!busy}
          onClick={() => decide("reject")}
        >
          Send back
        </button>
      </div>
      <p className="muted-12">
        Prices and stock are re-checked when you approve.
        {order.pricesHeldUntil
          ? ` Ordering cutoff ${stamp(order.pricesHeldUntil)}; no reservation.`
          : ""}
      </p>
    </article>
  );
}

function Outcome({ d, basket, onBack }: { d: { order: Order; failed?: string }; basket?: Basket; onBack: () => void }) {
  const placed = d.order.status === "placed";
  return (
    <article className="approval approval--done">
      <span className={"disc disc--32 " + (placed ? "disc--green" : "disc--amber")}>
        <Icon name={placed ? "circle-check" : "undo-2"} className="i-16" />
      </span>
      <h1 className="approval__title">{placed ? "Approved simulated order" : `Sent back to ${firstName(d.order.by)}`}</h1>
      <dl className="facts">
        <dt>Order</dt>
        <dd>{orderLabel(d.order.id)}</dd>
        <dt>Total excl. VAT</dt>
        <dd>{money(d.order.total)}</dd>
        {basket && (
          <>
            <dt>Delivery</dt>
            <dd>
              {dayLabel(basket.date)}, {SLOT}
            </dd>
          </>
        )}
        {d.order.note && (
          <>
            <dt>Your note</dt>
            <dd>{d.order.note}</dd>
          </>
        )}
      </dl>
      <p className="muted-12">{placed ? "Prices are fixed. Anna sees it in her order now." : "Nothing is ordered. Anna sees your note in her chat."}</p>
      <button className="btn btn--outline btn--lg" onClick={onBack}>
        Back to approvals
      </button>
    </article>
  );
}
