import { useCallback, useEffect, useState } from "react";
import {
  api,
  APPROVER,
  type Basket,
  type Order,
  type OrderConflict,
} from "../api";
import { Icon } from "../icons";
import { addDays, dayLabel, money, SLOT, stamp, timeLabel, whole } from "../format";
import { firstName, orderLabel, PEOPLE } from "../thread";
import { AimoLogo } from "./Mark";

// Mikko's view (?view=mikko): the approver's phone card from the states board. Lists pending orders and
// decides them through POST /api/orders/:id/decision as the mandate approver.
export function MikkoView() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [baskets, setBaskets] = useState<Record<string, Basket>>({});
  const [done, setDone] = useState<{ order: Order; failed?: string }[]>([]);
  const [offline, setOffline] = useState(false);

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
      const r = await api.decide(order.id, d, note);
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
            Hotelli Kaleva, Kamppi · {timeLabel(order.createdAt)}
            {reminded ? ` · reminded ${timeLabel(reminded)}` : ""}
          </span>
        </span>
      </div>
      <h1 className="approval__title">
        {basket?.people
          ? `Catering for ${basket.people} · ${dayLabel(addDays(basket.date, 1))}`
          : `Order ${orderLabel(order.id)}`}
      </h1>
      <p className="approval__meta">
        {order.lines.length} products
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
      <details className="approval__lines">
        <summary>See the {order.lines.length} products</summary>
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
          ? ` Held until ${stamp(order.pricesHeldUntil)}.`
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
      <h1 className="approval__title">{placed ? "Approved and sent to Valio Aimo" : `Sent back to ${firstName(d.order.by)}`}</h1>
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
