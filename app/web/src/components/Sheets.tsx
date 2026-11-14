import { Notice } from "../ui";
﻿import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { AuditEvent, Basket, BasketLine, Order } from "../api";
import "./replacement-dialog.css";
import { useProductImage } from "./OrderPanel";
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

// Small cart-style thumbnail for replacement rows.
function RowThumb({ sku, image }: { sku: string; image?: string }) {
  const catalogueImage = useProductImage(sku);
  const [failed, setFailed] = useState(false);
  const source = catalogueImage ?? image;
  useEffect(() => setFailed(false), [sku, source]);
  return <span className="purchase-row__thumb">{source && !failed ? <img src={source} alt="" onError={() => setFailed(true)} /> : <Icon name="package" className="i-18" />}</span>;
}


// All choices come from the gateway's checked alternatives. Opening the dialog never accepts a swap.
export function SwapSheet({ line, date, locked, onClose, onChoose, onCheck, onUnavailable, onSuggestMenuChange }: {
  line: BasketLine; date: string; time?: string; locked: boolean; onClose: () => void; onChoose: (sku: string) => void; onCheck?: () => Promise<void>; onUnavailable?: () => void; onSuggestMenuChange?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [checking,setChecking] = useState(!locked && !!onCheck);
  const checkedOnce = useRef(false);
  const [checkError,setCheckError] = useState('');
  async function check() {
    if (!onCheck) return;
    setChecking(true); setCheckError('');
    try { await onCheck(); } catch { setCheckError('unverified'); }
    finally { setChecking(false); }
  }
  useEffect(() => { if (!locked && onCheck && !checkedOnce.current) { checkedOnce.current = true; void check(); } }, []);
  const issue = line.issue;
  const opts = issue?.options ?? [];
  const [pick, setPick] = useState<string | undefined>(undefined);
  const original = line; // Compare the item currently in this basket; historical names have no reliable price/quantity.
  const usable = (o: (typeof opts)[number]) => o.qty > 0 && o.stock.deliverable && !o.stock.cutoffPassed && (o.stock.available == null || o.qty <= o.stock.available);
  const available = opts.filter(usable);
  const selected = opts.find(o => o.sku === pick && usable(o));
  const change = selected && Number.isFinite(selected.total) && Number.isFinite(original.total) ? Math.round((selected.total - original.total) * 100) / 100 : null;
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
    <header className="replacement-dialog__head"><div><h2 id="replacement-heading">{niceName(line.name)}{!line.issue ? " is available again" : " is unavailable"} for delivery on {dayLabel(date)}.</h2>{(checking || available.length > 0) && <p className="replacement-dialog__instruction">{checking ? "Checking availability..." : "Choose a replacement."}</p>}</div><button ref={closeButton} type="button" className="round" aria-label="Close replacements" onClick={() => close()}><Icon name="x" className="i-18" /></button></header>
    {checking && <p role="status">Checking this product and its shortlisted replacements for your delivery...</p>}
    {!checking && !checkError && line.issue && !available.length && <div className="replacement-dialog__empty"><p>No suitable product replacement was found for this delivery.</p>{onSuggestMenuChange && <p>Would you like to try a different recipe using available ingredients?</p>}<div className="replacement-dialog__recovery">{onSuggestMenuChange && <button className="btn replacement-dialog__use" type="button" disabled={locked || closing || checking} onClick={() => close(onSuggestMenuChange)}>Suggest a different recipe</button>}<button className="btn btn--outline" onClick={() => close(onUnavailable)}>No thanks</button></div></div>}
    {opts.length > 0 && <fieldset className="replacement-options" disabled={locked || closing || checking}><legend className="sr-only">Choose a replacement</legend>
      <div className="purchase-rows">
      <div className="purchase-row purchase-row--disabled purchase-row--original" aria-label="Original item for comparison">
        <span className="purchase-row__status"><Icon name="circle-x" className="i-16" /></span>
        <RowThumb sku={original.sku} image={original.image} />
        <span className="purchase-row__body"><strong>{niceName(original.name)}</strong><span>{qtyLabel(original.qty, original.pack)} · <span className="purchase-row__note" data-tone="blocked">{reason}</span></span></span>
        <span className="purchase-row__price"><b>{money(original.total)}</b><span className="purchase-option__delta">Your usual</span></span>
      </div>
      {opts.map(o => {
        const ok = usable(o);
        const note = o.stock.cutoffPassed ? 'Order cut-off passed' : !o.stock.deliverable ? 'Unavailable for this delivery' : o.stock.available != null && o.qty > o.stock.available ? 'Not enough stock' : o.qty <= 0 ? 'No orderable quantity' : o.preference?.status === 'accepted_alternative' && o.preference.accepted ? `You've accepted this ${o.preference.accepted} ${o.preference.accepted === 1 ? 'time' : 'times'} before` : o.preference?.status === 'rejected' ? 'You declined this before' : o.preference?.status === 'usual' ? `In ${o.preference.orders} of your last ${o.preference.of} orders` : o.frozen ? 'Frozen product' : '';
        const diff = Math.round((o.total - original.total) * 100) / 100;
        return <label key={o.sku} className={'purchase-row' + (pick === o.sku ? ' purchase-row--selected' : '') + (!ok ? ' purchase-row--disabled' : '')}>
          <input type="radio" name="replacement-choice" value={o.sku} aria-label={niceName(o.name)} checked={pick === o.sku} disabled={locked || closing || !ok} onChange={() => setPick(o.sku)} />
          <RowThumb sku={o.sku} />
          <span className="purchase-row__body"><strong>{niceName(o.name)}</strong><span>{qtyLabel(o.qty, o.pack)}{note && <span className="purchase-row__note" data-tone={!ok ? 'blocked' : o.preference?.status === 'accepted_alternative' || o.preference?.status === 'usual' ? 'usual' : undefined}>{' · '}{note}</span>}</span></span>
          <span className="purchase-row__price"><b>{money(o.total)}</b><span className="purchase-option__delta" data-saving={diff < 0 || undefined}>{Math.abs(diff) < .005 ? 'Same price' : (diff < 0 ? '−' : '+') + money(Math.abs(diff))}</span></span>
        </label>;
      })}
      </div>
    </fieldset>}
    {selected && <div className="replacement-comparison__summary" aria-live="polite">
      {change != null ? <p className={'replacement-comparison__change' + (change < 0 ? ' replacement-comparison__change--less' : '')}>{money(original.total)} <Icon name="arrow-right" className="i-16" /> {money(selected!.total)}<span>{Math.abs(change) < .005 ? 'No price change' : money(Math.abs(change)) + (change < 0 ? ' less for this item' : ' more for this item')}</span></p> : <p className="replacement-comparison__hint">Choose a product, then confirm with Use replacement.</p>}
    </div>}
    {opts.length > 0 && <p className="replacement-dialog__vat">Prices excl. VAT</p>}
    <footer className="replacement-dialog__actions">{!line.issue && <button className="btn replacement-dialog__use" onClick={() => close()}>Keep item</button>}<button type="button" className="btn btn--outline" disabled={locked || closing || checking} onClick={() => choose('remove')}>Remove item</button>{available.length > 0 && <button type="button" className="btn replacement-dialog__use" disabled={locked || closing || checking || !selected} onClick={() => selected && choose(selected.sku)}>Use replacement</button>}</footer>
  </dialog>;
}

const KIND: Record<string, string> = {
  request: "Order",
  plan: "Purchasing plan",
  choice: "Why this product",
  identity: "Requester",
  validation: "Validation evidence",
  recurring: "Scheduled execution",
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
      <Notice title="Simulated order service">No order is sent to Valio Aimo. {basket.factSource === "synthetic_fixture" ? "Prices and availability use an explicit synthetic fixture." : "Prices and availability come from the sponsor mock API."} Catalogue attributes are sponsor data; delivery addresses are user supplied. {order?.confirmationReference ? `Confirmation: ${order.confirmationReference}.` : ""}</Notice>
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
      <h3 className="log__h">Why the agent made these choices</h3>
      <Notice tone={basket.mandate.state === "agent_may_order" ? "green" : "amber"} title="Purchasing authority">{basket.mandate.reasons.slice(0,2).join(" ")}</Notice>
      <ol className="trail">{events.filter(e=>e.kind==="choice").map((e,i)=>{
        const d=e.data as {name?:string;selection?:string;quantity?:string;tradeoffs?:string};
        return <li key={i}><span className="trail__actor">{d.name ?? "Product decision"}</span><span className="trail__text">{[d.selection,d.quantity,d.tradeoffs].filter(Boolean).join(" ")}</span></li>;
      })}</ol>
      <details><summary>Full audit trail and verification evidence</summary>
      <ol className="trail">
        {events.map((e, i) => (
          <li key={i}>
            <span className="trail__time">{timeLabel(e.at)}</span>
            <span className="trail__actor">{KIND[e.kind] ?? e.kind}</span>
            <span className="trail__text">{logText(e)}</span>
          </li>
        ))}
      </ol></details>
    </Modal>
  );
}
