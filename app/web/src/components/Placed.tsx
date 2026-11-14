import { useEffect, useRef, useState } from "react";
import type { AuditEvent, Basket, Order } from "../api";
import { QtyText } from "./QtyText";
import { Icon } from "../icons";
import { dayLabel, money, niceName, timeLabel } from "../format";

const WHO: Record<
  string,
  { name: string; badge: string; cls: string; icon: string }
> = {
  buyer: {
    name: "Anna Korhonen, head chef",
    badge: "Chef's call",
    cls: "b-chef",
    icon: "user",
  },
  "Anna K.": {
    name: "Anna Korhonen, head chef",
    badge: "Chef's call",
    cls: "b-chef",
    icon: "user",
  },
  assistant: {
    name: "Aimo assistant",
    badge: "Assistant alone",
    cls: "b-bot",
    icon: "sparkle",
  },
  gateway: {
    name: "Valio Aimo gateway",
    badge: "Rule / live check",
    cls: "b-rule",
    icon: "shield",
  },
  "Mikko L.": {
    name: "Mikko Lehtinen, purchasing manager",
    badge: "Manager's call",
    cls: "b-mgr",
    icon: "checkCircle",
  },
};
const who = (a: string) =>
  WHO[a] ?? {
    name: a,
    badge: a.startsWith("agent") ? "Buyer agent" : "",
    cls: "b-rule",
    icon: "plug",
  };

// Keep the trail readable: a mandate re-evaluation after every click collapses to the last one in a run.
// Catalogue names arrive in capitals ("SALMON FILLET C-CUT"); sentence-case them for reading.
const calm = (t: string) => t.replace(/[A-ZÅÄÖ0-9][A-ZÅÄÖ0-9 ,.%\-]{7,}[A-ZÅÄÖ]/g, (m) => (/[A-ZÅÄÖ]{3}/.test(m) ? niceName(m) : m));

type Step = AuditEvent & { more?: string[] };
const LIVE = new Set(["search", "stock", "alternatives", "recheck"]);
// Keep the trail readable: live checks live in the API log tab, a mandate re-check after every click
// collapses to the last one in a run, and a run of swaps by the same person becomes one step.
function condense(ev: AuditEvent[]): Step[] {
  const out: Step[] = [];
  ev.forEach((e, i) => {
    if (LIVE.has(e.kind)) return;
    if (e.kind === "mandate" && ["mandate", "swap", "edit"].includes(ev[i + 1]?.kind ?? "")) return;
    const prev = out[out.length - 1];
    if (prev && (e.kind === "swap" || e.kind === "edit") && prev.kind === e.kind && prev.actor === e.actor) {
      prev.more = [...(prev.more ?? [prev.summary]), e.summary];
      prev.at = e.at;
      return;
    }
    const summary = e.summary
      .replace(/^agent_may_order: /, "OK to order: ")
      .replace(/^needs_approval: /, "Needs approval: ")
      .replace(/^needs_your_ok: /, "Waiting for the chef: ");
    out.push({ ...e, summary });
  });
  return out;
}

export function Placed({
  order,
  basket,
  audit,
  onNew,
}: {
  order: Order;
  basket: Basket;
  audit: AuditEvent[];
  onNew: () => void;
}) {
  const [tab, setTab] = useState<"how" | "api">("how");
  const trail = useRef<HTMLDivElement>(null);
  // Land on the latest step (the decision), the trail above it is one scroll away.
  useEffect(() => {
    if (trail.current) trail.current.scrollTop = trail.current.scrollHeight;
  }, [tab, audit]);
  const placed = order.status === "placed";
  const vat = order.totalWithVat - order.total;
  const dishOf = (sku: string) =>
    basket.lines.find((l) => l.sku === sku)?.dishId ?? null;
  const groups = [
    ...basket.dishes.map((d) => ({
      id: d.id as string | null,
      name: d.name,
      portions: d.portions,
    })),
    { id: null, name: "Other", portions: 0 },
  ]
    .map((d) => ({
      ...d,
      ls: order.lines.filter((l) => dishOf(l.sku) === d.id),
    }))
    .filter((g) => g.ls.length);
  const apiEvents = audit.filter((e) =>
    ["search", "stock", "alternatives", "recheck"].includes(e.kind),
  );
  return (
    <div className="layout">
      <div className="col">
        <section className="panel placed">
          <div className="placed__top">
            <span className={`placed__badge ${placed ? "" : "is-rej"}`}>
              <Icon name={placed ? "check" : "x"} size={40} />
            </span>
            <div>
              <h1 className="placed__h">
                {placed ? "Order placed" : "Order rejected"}
              </h1>
              <p className="muted">
                Order {order.id} ·{" "}
                {order.decidedBy
                  ? `${placed ? "approved" : "rejected"} by ${order.decidedBy}, ${dayLabel(order.decidedAt!)} ${timeLabel(order.decidedAt!)}`
                  : `placed by ${order.by}, ${timeLabel(order.createdAt)}`}
                {order.note ? ` · “${order.note}”` : ""}
              </p>
            </div>
          </div>
          <div className="facts">
            <Fact
              icon="truck"
              k="Delivery"
              v={dayLabel(basket.date)}
              sub="Hotelli Kaleva, Kamppi · loading dock"
            />
            <Fact
              icon="lock"
              k={placed ? "Price" : "Would have been"}
              v={`${money(order.total)} excl. VAT`}
              sub={
                order.changes.length
                  ? `${order.changes.length} changes found at the re-check`
                  : "re-checked live, no changes"
              }
            />
            <Fact
              icon="chef"
              k="For"
              v={`${order.lines.length} products, ${basket.dishes.length} dishes`}
              sub={`${basket.people} guests`}
            />
          </div>
          {order.changes.length > 0 && (
            <ul className="changes">
              {order.changes.map((c) => (
                <li key={c.sku + c.kind}>
                  {niceName(c.name)}: {c.kind} {c.was} → {c.now}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel trail">
          <div className="tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "how"}
              className={tab === "how" ? "is-on" : ""}
              onClick={() => setTab("how")}
            >
              How this order was made
            </button>
            <button
              role="tab"
              aria-selected={tab === "api"}
              className={tab === "api" ? "is-on" : ""}
              onClick={() => setTab("api")}
            >
              <Icon name="plug" size={20} /> API log
            </button>
            <span className="muted small tabs__end">
              Saved with the order · GET /api/orders/{order.id}/audit
            </span>
          </div>
          <div className="trail__scroll" ref={trail}>
            {tab === "how" ? (
              <ol className="timeline">
                {condense(audit).map((e, i) => {
                  const w = who(e.actor);
                  return (
                    <li key={i}>
                      <span className="timeline__t">
                        {dayLabel(e.at)}
                        <b>{timeLabel(e.at)}</b>
                      </span>
                      <span className={`timeline__dot ${w.cls}`}>
                        <Icon name={w.icon} size={18} />
                      </span>
                      <div>
                        <p className="timeline__who">
                          <b>{w.name}</b>
                          {w.badge && (
                            <span className={`badge ${w.cls}`}>{w.badge}</span>
                          )}
                        </p>
                        {e.more ? (
                          <>
                            <p className="timeline__what">{e.kind === "swap" ? `Decided ${e.more.length} lines:` : `Changed ${e.more.length} quantities:`}</p>
                            <p className="timeline__list">{e.more.map(calm).join(" · ")}</p>
                          </>
                        ) : (
                          <p className="timeline__what">{calm(e.summary)}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <table className="apilog">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Step</th>
                    <th>What was asked</th>
                  </tr>
                </thead>
                <tbody>
                  {apiEvents.map((e, i) => (
                    <tr key={i}>
                      <td>{timeLabel(e.at)}</td>
                      <td>{e.kind}</td>
                      <td>{e.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="trail__foot muted small">
            <Icon name="plug" size={14} /> The same order could come from a
            buyer agent (MCP or REST, API key). Same rules, checked by the Valio
            Aimo gateway.
          </p>
        </section>
      </div>
      <aside className="col col--side">
        <section className="panel lines">
          <p className="lines__h">
            <b>Order lines</b>
            <span className="muted small">{order.lines.length} products</span>
          </p>
          <div className="lines__scroll">
            {groups.map((g) => (
              <div key={g.name} className="lines__g">
                <p className="lines__gh">
                  <b>{g.name}</b>
                  {g.portions ? (
                    <span className="muted"> · {g.portions} portions</span>
                  ) : null}
                  <b className="r">
                    {money(g.ls.reduce((s, l) => s + l.total, 0))}
                  </b>
                </p>
                {g.ls.map((l) => (
                  <p key={l.sku} className="lines__l">
                    <span>{niceName(l.name)}</span>
                    <span className="muted"><QtyText qty={l.qty} pack={l.pack} /></span>
                    <span>{money(l.total)}</span>
                  </p>
                ))}
              </div>
            ))}
          </div>
          <div className="lines__tot">
            <p>
              <b>Total excl. VAT 13.5 %</b>
              <span className="sum__big">{money(order.total)}</span>
            </p>
            <p className="sum__row">
              <span>VAT 13.5 %</span>
              <span>{money(vat)}</span>
            </p>
            <p className="sum__row">
              <span>Total incl. VAT</span>
              <span>{money(order.totalWithVat)}</span>
            </p>
          </div>
        </section>
        <button className="button cta-wide" onClick={onNew}>
          New request
        </button>
      </aside>
    </div>
  );
}

function Fact({
  icon,
  k,
  v,
  sub,
}: {
  icon: string;
  k: string;
  v: string;
  sub: string;
}) {
  return (
    <div className="fact">
      <span className="tile">
        <Icon name={icon} size={22} />
      </span>
      <div>
        <span className="fact__k">{k}</span>
        <b className="fact__v">{v}</b>
        <span className="muted small">{sub}</span>
      </div>
    </div>
  );
}
