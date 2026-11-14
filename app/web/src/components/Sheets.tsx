import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { AuditEvent, Basket, BasketLine, Order } from "../api";
import { api, auditExportUrl } from "../api";
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

function ReplacementPhoto({ sku, image, name }: { sku: string; image?: string; name: string }) {
  const catalogueImage = useProductImage(sku);
  const [failed, setFailed] = useState(false);
  const source = catalogueImage ?? image;
  useEffect(() => setFailed(false), [sku, source]);
  return <span className="replacement-option__image">{source && !failed ? <img src={source} alt={name} onError={() => setFailed(true)} /> : <span className="replacement-option__no-image"><Icon name="package" className="i-22" /><span>No photo available</span></span>}</span>;
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
      <div className="replacement-options__grid">
      {opts.map(o => {
        const ok = usable(o);
        const note = o.stock.cutoffPassed ? 'Order cut-off passed.' : !o.stock.deliverable ? 'Unavailable for this delivery.' : o.stock.available != null && o.qty > o.stock.available ? 'Not enough stock for your quantity.' : o.qty <= 0 ? 'No orderable quantity.' : [o.frozen ? 'Frozen product' : '', o.reason.split(/\s*\u00b7\s*/).find(part => /^adds /i.test(part)) ?? ''].filter(Boolean).join('. ');
        const delivery = ok ? dayLabel(date) : o.stock.availableDate ? dayLabel(o.stock.availableDate) : 'Unavailable';
        return <label key={o.sku} className={'replacement-option' + (pick === o.sku ? ' replacement-option--selected' : '') + (!ok ? ' replacement-option--disabled' : '')}>
          <span className="replacement-option__top">
            <input type="radio" name="replacement-choice" value={o.sku} aria-label={niceName(o.name)} checked={pick === o.sku} disabled={locked || closing || !ok} onChange={() => setPick(o.sku)} />
            <span className={'replacement-option__availability' + (!ok ? ' replacement-option__availability--unavailable' : '')}><Icon name={ok ? 'circle-check' : 'circle-x'} className="i-14" />{delivery}</span>
          </span>
          <ReplacementPhoto sku={o.sku} name={niceName(o.name)} />
          <span className="replacement-option__copy">{o.tier && <span className={`tier tier--${o.tier}`}>{o.tier === "best" ? "Best" : o.tier === "better" ? "Better" : "Good"}</span>}<strong>{niceName(o.name)}</strong></span>
          <span className="replacement-option__facts"><span>{qtyLabel(o.qty, o.pack)}</span><span className="replacement-option__price"><b>{money(o.total)}</b><span>{Math.abs(o.total - original.total) < .005 ? 'Same price' : money(Math.abs(o.total - original.total)) + (o.total < original.total ? ' less' : ' more')}</span></span></span>
          {o.tierWhy && <span className="replacement-option__why">{o.tierWhy}</span>}
          <span className={'replacement-option__note' + (!ok ? ' replacement-option__problem' : '')}>{note}</span>
        </label>;
      })}
      <div className="replacement-option replacement-option--original" aria-label="Original item for comparison">
        <span className="replacement-option__top"><span className="replacement-option__original-label">Original item</span><Icon name="circle-alert" className="i-16" /></span>
        <ReplacementPhoto sku={original.sku} image={original.image} name={niceName(original.name)} />
        <span className="replacement-option__copy"><strong>{niceName(original.name)}</strong></span>
        <span className="replacement-option__facts"><span>{qtyLabel(original.qty, original.pack)}</span><span className="replacement-option__price"><b>{money(original.total)}</b><span>Original total</span></span></span>
        <span className="replacement-option__note" title={reason}>Unavailable</span>
      </div>
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
  const [view, setView] = useState<"buyer" | "valio">("buyer");
  const [chain, setChain] = useState<null | { intact: boolean; count: number; head: string | null }>(null);
  useEffect(() => { let on = true; api.auditVerify(basket.id).then(r => { if (on) setChain(r); }).catch(() => {}); return () => { on = false; }; }, [basket.id, events.length]);
  const BUYER_KINDS = new Set(["request","plan","menu","swap","edit","issues","mandate","order","recheck","decision","chat","undo"]);
  const filteredEvents = view === "buyer" ? events.filter((e) => BUYER_KINDS.has(e.kind)) : events;
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
      <div className="log__bar">
        <h3 className="log__h">Audit trail</h3>
        <div className="log__tabs" role="tablist" aria-label="Audit view">
          <button role="tab" aria-selected={view==="buyer"} className={"log__tab" + (view==="buyer" ? " log__tab--on" : "")} onClick={() => setView("buyer")}>Buyer view</button>
          <button role="tab" aria-selected={view==="valio"} className={"log__tab" + (view==="valio" ? " log__tab--on" : "")} onClick={() => setView("valio")}>Valio view</button>
        </div>
      </div>
      {chain && <p className={"log__chain" + (chain.intact ? "" : " log__chain--bad")}>{chain.intact ? `Record intact · ${chain.count} events, each sealed with the hash of the one before` : "Record changed after it was written — do not rely on it"}{chain.head ? ` · ${chain.head.slice(0, 12)}` : ""}</p>}
      <ol className="trail">
        {filteredEvents.map((e, i) => (
          <li key={i}>
            <span className="trail__time">{timeLabel(e.at)}</span>
            <span className="trail__actor">{KIND[e.kind] ?? e.kind}</span>
            {view === "valio" && <span className="trail__who">{e.actor}</span>}
            <span className="trail__text">{logText(e)}</span>
            {view === "valio" && e.data && <details className="trail__data"><summary>Data</summary><pre>{JSON.stringify(e.data, null, 2)}</pre></details>}
          </li>
        ))}
      </ol>
      <a className="log__export" href={auditExportUrl(basket.id)} download>Download audit record (JSON)</a>
    </Modal>
  );
}
