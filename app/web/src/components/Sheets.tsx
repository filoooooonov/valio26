import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { AuditEvent, Basket, BasketLine, Order } from "../api";
import { useProductImage } from "./OrderPanel";
import "./replacement-dialog.css";
import { Icon } from "../icons";
import {
  dayLabel,
  money,
  niceName,
  qtyLabel,
  SLOT,
  timeLabel,
} from "../format";
import { orderLabel } from "../thread";

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

/** Keep the native modal and focus trap alive through its closing motion. */
export function useReplacementClose(dialog: RefObject<HTMLDialogElement | null>, onClose: () => void) {
  const [closing, setClosing] = useState(false);
  const started = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  function close(after?: () => void) {
    if (started.current) return;
    started.current = true;
    const finish = () => { timer.current = null; dialog.current?.close(); onClose(); after?.(); };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    setClosing(true);
    timer.current = setTimeout(finish, 200);
  }
  return { closing, close };
}

function ReplacementImage({ sku, name }: { sku: string; name: string }) {
  const url = useProductImage(sku);
  const [failed, setFailed] = useState(false);
  return <span className="replacement-image">{url && !failed ? <img src={url} alt={name} onError={() => setFailed(true)} /> : <Icon name="package" className="i-22" />}</span>;
}

// All choices come from the gateway's checked alternatives. Opening the dialog never accepts a swap.
export function SwapSheet({ line, date, locked, onClose, onChoose, onFindAlternatives }: {
  line: BasketLine; date: string; locked: boolean; onClose: () => void; onChoose: (sku: string) => void; onFindAlternatives?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const issue = line.issue;
  const opts = issue?.options ?? [];
  const [pick, setPick] = useState<string | undefined>(undefined);
  const original = line.replaced ?? line;
  const usable = (o: (typeof opts)[number]) => o.qty > 0 && o.stock.deliverable && !o.stock.cutoffPassed && (o.stock.available == null || o.qty <= o.stock.available);
  const available = opts.filter(usable);
  const selected = opts.find(o => o.sku === pick && usable(o));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal(); closeButton.current?.focus();
    return () => { dialog.current?.close(); previous?.focus?.(); };
  }, []);
  const { closing, close } = useReplacementClose(dialog, onClose);
  const choose = (sku: string) => { if (!locked) close(() => onChoose(sku)); };
  const reason = issue?.kind === 'short' && line.stock.available != null ? 'Only ' + line.stock.available + ' available; you requested ' + line.qty + '.' : issue?.kind === 'cutoff' ? 'The order cut-off has passed.' : 'Unavailable for the requested delivery.';
  return <dialog ref={dialog} className={"replacement-dialog" + (closing ? " replacement-dialog--closing" : "")} aria-busy={closing || undefined} aria-labelledby="replacement-heading" onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
  }}>
    <header className="replacement-dialog__head"><div><p className="replacement-dialog__eyebrow">Choose a replacement</p><h2 id="replacement-heading">{niceName(original.name)}</h2></div><button ref={closeButton} type="button" className="round" aria-label="Close replacements" onClick={() => close()}><Icon name="x" className="i-18" /></button></header>
    <p className="replacement-dialog__delivery"><Icon name="truck" className="i-16" /> Requested delivery: {dayLabel(date)}, {SLOT}</p>
    <p className="replacement-dialog__reason">{reason}</p>
    {!available.length && <div className="replacement-dialog__empty"><h3>No verified replacement</h3><p>No checked alternative can fulfil this quantity and delivery.</p>{onFindAlternatives && <button className="btn btn--outline" type="button" disabled={locked || closing} onClick={() => { if (!locked) close(onFindAlternatives); }}>Find another</button>}</div>}
    {opts.length > 0 && <fieldset className="replacement-options" disabled={locked}><legend>Checked alternatives <span>Price difference versus the original</span></legend>
      {opts.map(o => { const ok = usable(o); const note = o.stock.cutoffPassed ? 'Order cut-off passed' : !o.stock.deliverable ? 'Unavailable for this delivery' : o.stock.available != null && o.qty > o.stock.available ? 'Insufficient stock for this quantity' : o.qty <= 0 ? 'No orderable quantity' : o.reason.split(/\s*\u00b7\s*/).find(x => /^adds /i.test(x)) ?? null;
        return <label key={o.sku} className={'replacement-option' + (pick === o.sku ? ' replacement-option--selected' : '') + (!ok ? ' replacement-option--disabled' : '')}>
          <input type="radio" name="replacement-choice" value={o.sku} aria-label={niceName(o.name)} checked={pick === o.sku} disabled={locked || closing || !ok} onChange={() => setPick(o.sku)} />
          <ReplacementImage sku={o.sku} name={niceName(o.name)} />
          <span className="replacement-option__copy"><strong>{niceName(o.name)}</strong><span>{qtyLabel(o.qty, o.pack)}</span>{note && <span className={!ok ? 'replacement-option__problem' : ''}>{note}</span>}</span>
          <span className="replacement-option__price"><b>{money(o.total)}</b><span>{Math.abs(o.delta) < .005 ? 'Same price' : (o.delta > 0 ? '+' : '-') + money(Math.abs(o.delta))}</span></span>
        </label>;
      })}
    </fieldset>}
    <footer className="replacement-dialog__actions"><button type="button" className="btn btn--outline" disabled={locked} onClick={() => choose('remove')}>Remove item</button><button type="button" className="btn replacement-dialog__use" disabled={locked || closing || !selected} onClick={() => selected && choose(selected.sku)}>Use replacement</button></footer>
  </dialog>;
}

const KIND: Record<string, string> = {
  request: "Request",
  plan: "Menu plan",
  search: "Catalogue search",
  pick: "Products picked",
  stock: "Price and stock",
  alternatives: "Alternatives",
  swap: "Swap",
  edit: "Quantity",
  mandate: "Rules check",
  recheck: "Re-check",
  order: "Order",
  decision: "Decision",
  guests: "Guests",
  chat: "Chat",
  replan: "New plan",
};
const STATE: Record<string, string> = {
  needs_your_ok: "Waiting for your choice:",
  needs_approval: "Needs approval:",
  agent_may_order: "Inside your limits:",
};
const logText = (e: AuditEvent) =>
  `${e.actor === "assistant" || e.actor === "gateway" ? "" : e.actor + ": "}${e.summary}`
    .replace(
      /^(needs_your_ok|needs_approval|agent_may_order):/,
      (m) => STATE[m.slice(0, -1)],
    )
    .replace(/^Claude:\s*/, "")
    .replace(
      /(?<![a-z])o_([a-z0-9]+)/g,
      (_m, id: string) => "AIM-" + id.toUpperCase(),
    );

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
      title={order ? `Order ${orderLabel(order.id)}` : "Order record"}
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
            <span className="trail__actor">{KIND[e.kind] ?? e.kind}</span>
            <span className="trail__text">{logText(e)}</span>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
