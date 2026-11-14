import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AuditEvent, Basket, BasketLine, Order } from "../api";
import { Icon } from "../icons";
import {
  dayLabel,
  lineIsOpen,
  money,
  niceName,
  qtyLabel,
  SLOT,
  timeLabel,
  weekday,
} from "../format";
import { shortName } from "../thread";

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener("keydown", k);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div
        className={"sheet" + (wide ? " sheet--wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__head">
          <h2 className="sheet__title">{title}</h2>
          <button
            ref={close}
            className="round round--plain"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="x" className="i-18" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Swap sheet (states board): the line's real alternatives, compared on Friday delivery, on-time record and price.
export function SwapSheet({
  line,
  date,
  locked,
  onClose,
  onChoose,
}: {
  line: BasketLine;
  date: string;
  locked: boolean;
  onClose: () => void;
  onChoose: (sku: string) => void;
}) {
  const issue = line.issue;
  const opts = issue?.options ?? [];
  const current =
    issue?.decided && issue.decided !== "remove"
      ? line.sku
      : lineIsOpen(line)
        ? opts[0]?.sku
        : line.sku;
  const [pick, setPick] = useState<string | undefined>(current);
  const day = weekday(date);
  const original =
    line.replaced ??
    (lineIsOpen(line) ? { sku: line.sku, name: line.name } : null);
  const rows = [
    ...opts.map((o) => ({
      sku: o.sku,
      name: niceName(o.name),
      ok: o.stock.deliverable && !o.stock.cutoffPassed,
      meta: o.reason
        .split(" · ")
        .filter((x) => !/^no new allergens$/.test(x))
        .slice(0, 2)
        .join(" · "),
      price: money(o.total),
      qty: qtyLabel(o.qty, o.pack),
    })),
  ];
  if (!issue)
    return (
      <Modal title={shortName(line.name)} onClose={onClose}>
        <p className="sheet__sub">
          No alternatives needed: this arrives {day} {SLOT} at your price.
        </p>
        <div className="opt opt--on">
          <span className="radio radio--on" />
          <span className="grow">
            <b className="opt__name">{niceName(line.name)}</b>
            <span className="opt__meta opt__meta--ok">
              <Icon name="circle-check" className="i-14" /> {day} {SLOT}
            </span>
          </span>
          <span className="opt__price">
            <b>{money(line.total)}</b>
            <span>{qtyLabel(line.qty, line.pack)}</span>
          </span>
        </div>
        <button className="cta-block" onClick={onClose}>
          Keep it
        </button>
      </Modal>
    );
  return (
    <Modal title={shortName(original?.name ?? line.name)} onClose={onClose}>
      <p className="sheet__sub">
        Compared on {day} delivery, on-time record and price.
      </p>
      <div className="opts" role="radiogroup" aria-label="Alternatives">
        {rows.map((r) => (
          <button
            key={r.sku}
            role="radio"
            aria-checked={pick === r.sku}
            className={"opt" + (pick === r.sku ? " opt--on" : "")}
            disabled={locked}
            onClick={() => setPick(r.sku)}
          >
            <span className={"radio" + (pick === r.sku ? " radio--on" : "")} />
            <span className="grow">
              <b className="opt__name">{r.name}</b>
              <span
                className={
                  "opt__meta" + (r.ok ? " opt__meta--ok" : " opt__meta--bad")
                }
              >
                <Icon
                  name={r.ok ? "circle-check" : "circle-x"}
                  className="i-14"
                />{" "}
                {r.meta}
              </span>
            </span>
            <span className="opt__price">
              <b>{r.price}</b>
              <span>{r.qty}</span>
            </span>
          </button>
        ))}
        {original && (
          <div className="opt opt--disabled" aria-disabled="true">
            <span className="radio" />
            <span className="grow">
              <b className="opt__name">
                {niceName(original.name)} (your usual)
              </b>
              <span className="opt__meta opt__meta--bad">
                <Icon name="circle-x" className="i-14" /> {issue.text}
              </span>
            </span>
            <span className="opt__price">
              <span>—</span>
            </span>
          </div>
        )}
        <button
          role="radio"
          aria-checked={pick === "remove"}
          className={"opt" + (pick === "remove" ? " opt--on" : "")}
          disabled={locked}
          onClick={() => setPick("remove")}
        >
          <span className={"radio" + (pick === "remove" ? " radio--on" : "")} />
          <span className="grow">
            <b className="opt__name">Don't order it</b>
            <span className="opt__meta">I'll leave it out of this order</span>
          </span>
        </button>
      </div>
      <button
        className="cta-block"
        disabled={locked || !pick || (pick === current && !lineIsOpen(line))}
        onClick={() => pick && onChoose(pick)}
      >
        {pick === "remove"
          ? "Don't order it"
          : `Use ${shortName(rows.find((r) => r.sku === pick)?.name ?? "this").toLowerCase()}`}
      </button>
    </Modal>
  );
}

// "View order" / "Full technical log": the order lines plus every audit event the gateway recorded.
export function LogSheet({
  basket,
  order,
  events,
  onClose,
}: {
  basket: Basket;
  order: Order | null;
  events: AuditEvent[];
  onClose: () => void;
}) {
  const lines =
    order?.lines ??
    basket.lines
      .filter((l) => l.qty > 0)
      .map((l) => ({
        sku: l.sku,
        name: l.name,
        qty: l.qty,
        pack: l.pack,
        total: l.total,
      }));
  return (
    <Modal
      title={order ? `Order ${order.id}` : "Order record"}
      onClose={onClose}
      wide
    >
      <p className="sheet__sub">
        Delivery {dayLabel(basket.date)}, {SLOT} ·{" "}
        {money(order?.total ?? basket.total)} excl. VAT ·{" "}
        {order?.status.replace("_", " ") ?? "draft"}
      </p>
      <table className="log">
        <tbody>
          {lines.map((l) => (
            <tr key={l.sku}>
              <td>{niceName(l.name)}</td>
              <td className="log__num">{qtyLabel(l.qty, l.pack)}</td>
              <td className="log__num">{money(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="log__h">Audit trail</h3>
      <ol className="trail">
        {events.map((e, i) => (
          <li key={i}>
            <span className="trail__time">{timeLabel(e.at)}</span>
            <span className="trail__actor">{e.actor}</span>
            <span className="trail__text">{e.summary}</span>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
