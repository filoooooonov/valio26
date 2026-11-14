import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
import type { Basket, BasketLine, Order } from "../api";
import { api, BUYER } from "../api";
import { Icon, productIcon, type IconName } from "../icons";
import {
  addDays,
  dayLabel,
  niceName,
  qtyLabel,
  lineIsOpen,
  money,
  n2,
  sameDay,
  stamp,
  timeLabel,
  weekdayLong,
} from "../format";
import { firstName, orderLabel, PEOPLE, shortName, type Item } from "../thread";
import type { Phase } from "../App";
import { AssistantBadge, ThinkingMark } from "./Mark";
import { ReplacementNotice } from './ReplacementNotice';
import { closePopup } from './popupMotion';
import "./chat-polish.css";

export type LocalItem =
  | { kind: "user"; key: string; at: string; who: string; text: string }
  | { kind: "assistant"; key: string; at: string; text: string }
  | { kind: "system"; key: string; at: string; icon: IconName; text: string }
  | { kind: "failed"; key: string; at: string; text: string };
export type ChatError = { title: string; text: string; retry: () => void };

type Props = {
  menuReviewTitle?: string;
  alternativeProposal?: ReactNode;
  menuProposal?: ReactNode;
  planningMenu?: boolean;
  phase: Phase;
  basket: Basket | null;
  thread: Item[];
  local: LocalItem[];
  order: Order | null;
  building: { since: number; request: string } | null;
  error: ChatError | null;
  stale: boolean;
  busy: boolean;
  draft: string;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  onDraft: (s: string) => void;
  onSend: (s: string) => void;
  onStop: () => void;
  onNew: () => void;
  onChoose: (lineId: string, sku: string) => void;
  onRemoveMany: (lineIds: string[]) => void;
  onFindAlternatives?: (lines: BasketLine[]) => void;
  onSwitchResend: (lineId: string, sku: string) => void;
  onSeeAll: (lineId: string) => void;
  onGuests: (n: number) => void;
  onRefreshPrices: () => void;
  onDismissError: () => void;
  onResend: () => void;
  onRetryOrder: () => void;
  onLog: () => void;
  onAttach: () => void;
  onHero: () => void;
  onAgain: () => void;
};

export function Chat(p: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const chatRoot = useRef<HTMLElement>(null);
  const composerDock = useRef<HTMLDivElement>(null);
  const reviewTrigger = useRef<HTMLButtonElement>(null);
  const reviewPanel = useRef<HTMLDivElement>(null);
  const hasMenuReview = !!p.menuProposal && !!p.planningMenu;
  const [menuReviewOpen, setMenuReviewOpen] = useState(false);
  const closeMenuReview = () => closePopup(reviewPanel.current, () => { setMenuReviewOpen(false); requestAnimationFrame(() => reviewTrigger.current?.focus()); });
  useLayoutEffect(() => {
    setMenuReviewOpen(hasMenuReview);
    if (hasMenuReview) requestAnimationFrame(() => reviewPanel.current?.focus({ preventScroll: true }));
  }, [hasMenuReview, p.menuReviewTitle]);
  useLayoutEffect(() => {
    const root = chatRoot.current, dock = composerDock.current;
    if (!root || !dock || !hasMenuReview) return;
    const measure = () => {
      const head = root.querySelector('.chat__head');
      if (!head) return;
      const available = Math.max(150, dock.getBoundingClientRect().top - head.getBoundingClientRect().bottom - 28);
      dock.style.setProperty('--menu-review-max-height', available + 'px');
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(root); observer.observe(dock);
    window.addEventListener('resize', measure); window.visualViewport?.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, [hasMenuReview]);
  const items = [...p.thread, ...p.local].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
  const open =
    p.basket && (p.phase === "draft" || p.phase === "review")
      ? p.basket.lines.filter(lineIsOpen)
      : [];
  const firstAt = items.find((i) => i.kind === "user")?.at;

  const pinned = useRef(true);
  const following = useRef(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const latestOwn = [...items].reverse().find(i => i.kind === "user")?.key;
  const lastOwn = useRef(latestOwn);
  const tail = [items.map(i => i.key).join(","), open.length, p.phase,
    p.order?.status, !!p.error, p.stale, !!p.building, !!p.menuProposal, p.busy].join("|");
  const jumpToLatest = () => {
    const el = scroller.current;
    if (!el) return;
    pinned.current = true;
    following.current = true;
    setHasNewMessages(false);
    el.scrollTo({ top: el.scrollHeight, behavior: !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant" });
  };
  useLayoutEffect(() => {
    const ownMessage = latestOwn !== lastOwn.current;
    lastOwn.current = latestOwn;
    if (pinned.current || ownMessage) jumpToLatest();
    else setHasNewMessages(true);
  }, [tail, latestOwn]); // Existing keyed turns retain their DOM and entry motion.

  const previousOrder = useRef({ id: p.order?.id, status: p.order?.status });
  const announced = useRef(new Set<string>());
  const observedProgress = useRef(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  useEffect(() => {
    const previous = previousOrder.current;
    if (p.busy || p.order?.status === "pending_approval") observedProgress.current = true;
    if (p.order?.status === "placed" && observedProgress.current && (previous.id !== p.order.id || previous.status !== "placed") && !announced.current.has(p.order.id)) {
      announced.current.add(p.order.id);
      observedProgress.current = false;
      setSuccessToast(p.order.id);
    } else if (p.order?.status !== "placed") setSuccessToast(null);
    previousOrder.current = { id: p.order?.id, status: p.order?.status };
  }, [p.order?.id, p.order?.status, p.busy]);

  return (
    <section ref={chatRoot} className={'chat' + (hasMenuReview && menuReviewOpen ? ' chat--menu-reviewing' : '')} aria-label="Aimo assistant" onKeyDown={event => {
      if (event.key === 'Escape' && hasMenuReview && menuReviewOpen && !(event.target as HTMLElement).closest('dialog[open]')) { event.preventDefault(); closeMenuReview(); }
    }}>
      <div className="chat__head">
        <AssistantBadge />
        <h2 className="chat__title">Aimo assistant</h2>
        <span className="grow" />
        <button className="btn-ghost" onClick={p.onNew}>
          <Icon name="plus" className="i-14" /> New request
        </button>
      </div>

      <div className="thread" ref={scroller} inert={hasMenuReview && menuReviewOpen} aria-live="polite" aria-relevant="additions" onWheel={() => { following.current = false; }} onTouchStart={() => { following.current = false; }} onPointerDown={() => { following.current = false; }} onScroll={() => {
        const el = scroller.current;
        if (!el) return;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        if (!following.current || nearBottom) pinned.current = nearBottom;
        if (nearBottom) { following.current = false; setHasNewMessages(false); }
      }}>
        {p.phase === "empty" && !p.error && !p.planningMenu && (
          <Intro onHero={p.onHero} onSend={p.onSend} onAttach={p.onAttach} />
        )}
        {p.building && !p.basket && (
          <UserBubble
            at={new Date(p.building.since).toISOString()}
            who={BUYER}
            text={p.building.request}
            long
          />
        )}
        {items.map((it) => (
          <Turn key={it.key} it={it} p={p} firstAt={firstAt} />
        ))}
        {p.basket && <ReplacementNotice lines={open} date={p.basket.date} busy={p.busy} onReview={p.onSeeAll} />}
        {p.alternativeProposal}
        {p.phase === "waiting" && p.order && <Waiting order={p.order} />}
        {p.stale && p.basket && (
          <Stale checkedAt={p.basket.checkedAt} onRefresh={p.onRefreshPrices} />
        )}
        {p.building && <Thinking since={p.building.since} />}
        {p.error && <ErrorCard e={p.error} onDismiss={p.onDismissError} />}
        {p.busy && !p.building && <div className="chat-pending" role="status"><ThinkingMark small /><span>Updating your request...</span></div>}
        {p.order?.status === "placed" && <ConfirmedOrder order={p.order} onLog={p.onLog} />}
      </div>

      {hasNewMessages && <button className="chat-latest" onClick={() => jumpToLatest()} aria-label="Jump to latest message">Latest messages <Icon name="arrow-right" className="i-14" /></button>}
      {successToast === p.order?.id && p.order?.status === "placed" && <div className="chat-success-toast" role="status" aria-live="polite"><Icon name="circle-check" className="i-22" /><div><b>Order confirmed</b><span>{orderLabel(p.order.id)} is recorded in this demo gateway.</span></div><button className="round round--plain" aria-label="Dismiss order confirmation" onClick={() => setSuccessToast(null)}><Icon name="x" className="i-16" /></button></div>}
      {!p.planningMenu && <Suggestions p={p} />}
      <div className="chat-composer-dock" ref={composerDock}>
        {hasMenuReview && <>
          <button ref={reviewTrigger} type="button" className="chat-menu-trigger" aria-expanded={menuReviewOpen} aria-controls="menu-review-popup" onClick={() => setMenuReviewOpen(open => !open)}><Icon name="list" className="i-16" />{p.menuReviewTitle === 'A few event details' ? 'Review event details' : 'Review menu'}<Icon name="chevron-down" className="i-14" /></button>
          <div key={p.menuReviewTitle} id="menu-review-popup" ref={reviewPanel} className="chat-menu-review" role="dialog" aria-modal="false" aria-labelledby="menu-review-heading" tabIndex={-1} hidden={!menuReviewOpen}>
            <div className="chat-menu-review__head"><h3 id="menu-review-heading">{p.menuReviewTitle ?? 'Review your menu'}</h3><button type="button" className="round round--plain" aria-label="Close menu review" onClick={closeMenuReview}><Icon name="x" className="i-18" /></button></div>
            {p.menuProposal}
          </div>
        </>}
        <Composer p={p} />
      </div>
      <p className="foot">
        Rules are checked by Valio Aimo on every order, not by the assistant.
      </p>
    </section>
  );
}

function ConfirmedOrder({ order, onLog }: { order: Order; onLog: () => void }) {
  return <section className="chat-confirmed" aria-label="Confirmed order">
    <div className="chat-confirmed__heading"><Icon name="circle-check" className="i-22" /><h3>Order confirmed</h3></div>
    <p>{orderLabel(order.id)} <span aria-hidden="true"> / </span> <strong>{money(order.total)}</strong> excl. VAT</p>
    <p className="chat-confirmed__note">Prices are fixed. Your order and approval are recorded in this demo gateway.</p>
    <button className="chat-confirmed__link" onClick={onLog}>View order and audit trail <Icon name="arrow-right" className="i-14" /></button>
  </section>;
}

export function Intro({
  onHero,
  onSend,
  onAttach,
}: {
  onHero: () => void;
  onSend: (s: string) => void;
  onAttach: () => void;
}) {
  return (
    <div className="turn enter">
      <AssistantBadge />
      <div className="turn__body">
        <p className="turn__text">
          Tell me what you're cooking, for how many and when. I'll build the
          order from your usual products and your prices.
        </p>
        <div className="examples">
          <button className="chip chip--example" onClick={onHero}>
            <Icon name="corner-down-right" className="i-14" /> Catering for 50
            on Saturday
          </button>
          <button
            className="chip chip--example"
            onClick={() => onSend("Restock like last Friday")}
          >
            <Icon name="corner-down-right" className="i-14" /> Restock like last
            Friday
          </button>
          <button className="chip chip--example" onClick={onAttach}>
            <Icon name="camera" className="i-14" /> Photo of a menu
          </button>
        </div>
      </div>
    </div>
  );
}

function UserBubble({
  at,
  who,
  text,
  long,
  firstAt,
}: {
  at: string;
  who: string;
  text: string;
  long?: boolean;
  firstAt?: string;
}) {
  const when =
    long || (firstAt && !sameDay(at, firstAt)) ? stamp(at) : timeLabel(at);
  return (
    <div className="user enter">
      <div className={"bubble" + (long ? " bubble--long" : "")}>
        <div className="bubble__meta">
          {firstName(who)} · {when}
        </div>
        <div className="bubble__text">{text}</div>
      </div>
    </div>
  );
}

function Turn({
  it,
  p,
  firstAt,
}: {
  it: Item | LocalItem;
  p: Props;
  firstAt?: string;
}) {
  switch (it.kind) {
    case "user":
      return (
        <UserBubble
          at={it.at}
          who={it.who}
          text={it.text}
          long={"long" in it && it.long}
          firstAt={firstAt}
        />
      );
    case "assistant":
      return (
        <div className="turn enter">
          <AssistantBadge />
          <div className="turn__body">
            <p className="turn__text">{it.text}</p>
            {"did" in it && it.did && (
              <ul className="did">
                {it.did.map((d) => (
                  <li key={d.text}>
                    <Icon name={d.icon} className="i-14" />
                    {d.text}
                  </li>
                ))}
              </ul>
            )}
            {"route" in it && it.route && p.basket && (
              <Route approver={p.basket.rules.approver} />
            )}
            {"log" in it && it.log != null && (
              <button className="loglink" onClick={p.onLog}>
                <Icon name="list" className="i-14" /> Full technical log
              </button>
            )}
          </div>
        </div>
      );
    case "system":
      return (
        <div
          className={
            "sysline enter" +
            ("tone" in it && it.tone ? " sysline--" + it.tone : "")
          }
        >
          <Icon name={it.icon} className="i-13" />
          {it.text}
        </div>
      );
    case "sentBack": {
      const active =
        p.order?.id === it.orderId &&
        p.order.status === "rejected" &&
        p.phase !== "waiting";
      return (
        <SentBack
          by={it.by}
          at={it.at}
          note={it.note}
          active={active}
          held={p.order?.pricesHeldUntil ?? p.basket?.pricesHeldUntil ?? null}
          match={active && p.basket ? noteOption(it.note, p.basket) : null}
          onResend={p.onResend}
          onSwitch={p.onSwitchResend}
          onReply={() => p.composerRef.current?.focus()}
        />
      );
    }
    case "failed":
      return <FailedCard text={it.text} onRetry={p.onRetryOrder} />;
  }
}

export function FailedCard({
  text,
  onRetry,
}: {
  text: string;
  onRetry: () => void;
}) {
  return (
    <div className="card enter">
      <div className="card__head">
        <span className="disc disc--red">
          <Icon name="circle-x" className="i-16" />
        </span>
        <h3 className="card__title">Valio Aimo didn't confirm</h3>
      </div>
      <p className="card__text">{text}</p>
      <div className="row-8">
        <button className="btn btn--teal" onClick={onRetry}>
          <Icon name="rotate-cw" className="i-16" /> Try again
        </button>
        <a className="btn btn--outline" href="tel:+358102000">
          Contact customer service
        </a>
      </div>
    </div>
  );
}

export function Route({ approver }: { approver: string }) {
  const m = PEOPLE[approver] ?? { name: approver, role: "Approver" };
  return (
    <div className="route">
      <Person initials="AV" name="Anna (you)" role="Head chef" tone="teal" />
      <Icon name="chevron-right" className="i-14 route__chev" />
      <Person
        initials={m.name
          .split(" ")
          .map((w) => w[0])
          .join("")}
        name={m.name}
        role={m.role}
        tone="berry"
      />
      <Icon name="chevron-right" className="i-14 route__chev" />
      <span className="route__end">Valio Aimo</span>
    </div>
  );
}
function Person({
  initials,
  name,
  role,
  tone,
}: {
  initials: string;
  name: string;
  role: string;
  tone: "teal" | "berry";
}) {
  return (
    <span className="person">
      <span className={"avatar avatar--" + tone}>{initials}</span>
      <span>
        <span className="person__name">{name}</span>
        <span className="person__role">{role}</span>
      </span>
    </span>
  );
}

const replacementImages = new Map<string, Promise<string | null>>();
function ReplacementPhoto({ sku, name, contains }: { sku: string; name: string; contains?: string[] }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setUrl(null);
    let request = replacementImages.get(sku);
    if (!request) { request = api.image(sku).catch(() => null); replacementImages.set(sku, request); }
    request.then(image => { if (active) setUrl(image); });
    return () => { active = false; };
  }, [sku]);
  return <span className="stock-replacement__photo">{url ? <img src={url} alt="" loading="lazy" onError={() => setUrl(null)} /> : <Icon name={productIcon(name, contains ?? [])} className="i-22" />}</span>;
}
function IssueDetail({ line }: { line: BasketLine }) {
  const detail = line.issue?.kind === "short" && line.stock.available != null
    ? `Only ${n2(line.stock.available)} available; you need ${n2(line.qty)}.`
    : line.issue?.kind === "cutoff" ? "The order cut-off has passed."
    : line.stock.availableDate ? `Next available ${dayLabel(line.stock.availableDate)}.`
    : "Unavailable for this delivery.";
  return <p className="stock-problem__reason">{detail}</p>;
}
export function Question({ line, basket, busy, onChoose, onSeeAll }: {
  line: BasketLine; index: number; count: number; basket: Basket; busy: boolean;
  onChoose: (lineId: string, sku: string) => void; onSeeAll: (lineId: string) => void;
}) {
  const issue = line.issue!;
  const short = issue.kind === "short" && line.stock.available != null;
  return <section className="question stock-problem enter" data-question={line.id} aria-label={`Delivery issue: ${niceName(line.name)}`}>
    <h3 className="question__head"><Icon name="circle-alert" className="i-16" /><span>{niceName(line.name)} {short ? "is short for delivery" : "can't arrive on time"}</span></h3>
    <span className="stock-problem__date"><Icon name="truck" className="i-14" />For delivery {dayLabel(basket.date)}</span>
    <IssueDetail line={line} />
    {issue.options.length > 0 && <p className="stock-replacement__intro">Replace it with</p>}
    {issue.options.slice(0, 2).map(o => {
      const available = o.stock.deliverable && !o.stock.cutoffPassed;
      const delta = Number.isFinite(line.total) && Number.isFinite(o.total) ? Math.round((o.total - line.total) * 100) / 100 : null;
      return <div className="stock-replacement" key={o.sku}>
        <ReplacementPhoto sku={o.sku} name={o.name} contains={o.contains} />
        <div className="stock-replacement__body">
          <strong className="stock-replacement__name">{niceName(o.name)}{o.frozen && <span className="stock-replacement__frozen" aria-label="Frozen" title="Frozen"><Icon name="snowflake" className="i-14" /></span>}</strong>
          <div className="stock-replacement__facts"><span>{qtyLabel(o.qty, o.pack)}</span><span>{money(o.total)}</span></div>
          {delta != null && <span className={"stock-replacement__difference" + (delta < 0 ? " stock-replacement__difference--less" : "")}>{Math.abs(delta) < 0.005 ? "Same price" : `${money(Math.abs(delta))} ${delta < 0 ? "cheaper" : "more"}`}</span>}
          <span className={"stock-replacement__delivery" + (!available ? " stock-replacement__delivery--late" : "")}><Icon name="truck" className="i-14" />{available ? "Arrives in time" : o.stock.availableDate ? `Available ${dayLabel(o.stock.availableDate)}` : "Not available in time"}</span>
          <button className="ans ans--primary stock-replacement__choose" disabled={busy || !available} onClick={() => onChoose(line.id, o.sku)} aria-label={`Use ${niceName(o.name)} instead of ${niceName(line.name)}`}>Use replacement</button>
        </div>
      </div>;
    })}
    {issue.options.length > 0 && <p className="stock-problem__vat">Prices excl. VAT</p>}
    <div className="answers stock-problem__actions">
      {short && <button className="stock-problem__text-action" disabled={busy} onClick={() => onChoose(line.id, "keep")}>Take the {n2(line.stock.available!)} available</button>}
      {issue.options.length > 2 && <button className="stock-problem__text-action" disabled={busy} onClick={() => onSeeAll(line.id)}>See all {issue.options.length} replacements</button>}
      <button className="stock-problem__text-action" disabled={busy} onClick={() => onChoose(line.id, "remove")}>Don't order it</button>
    </div>
  </section>;
}
export function NoSubstitute({ lines, date, busy, onRemove, onFind }: {
  lines: BasketLine[]; index: number; count: number; date: string; busy: boolean;
  onRemove: () => void; onFind: () => void;
}) {
  const single = lines.length === 1;
  return <section className="question stock-problem enter" data-question={lines[0].id} aria-label="Items without a suitable replacement">
    <h3 className="question__head"><Icon name="circle-alert" className="i-16" /><span>{single ? niceName(lines[0].name) + " can't arrive on time" : "These items can't arrive on time"}</span></h3>
    <span className="stock-problem__date"><Icon name="truck" className="i-14" />For delivery {dayLabel(date)}</span>
    {lines.map(line => <div className="stock-problem__unavailable" key={line.id}>{!single && <strong>{niceName(line.name)}</strong>}<IssueDetail line={line} /></div>)}
    <p className="stock-problem__help">No suitable replacement found.</p>
    <div className="answers stock-problem__actions">
      <button className="ans ans--primary" disabled={busy} aria-busy={busy || undefined} onClick={onFind}>{busy ? <><Icon name="loader" className="i-14 spin" />Finding alternatives...</> : "Find another"}</button>
      <button className="stock-problem__text-action" disabled={busy} onClick={onRemove}>{single ? "Don't order it" : "Don't order these items"}</button>
    </div>
  </section>;
}

function Waiting({ order }: { order: Order }) {
  const [seen, setSeen] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        setSeen(localStorage.getItem(`remind:${order.id}`));
      } catch {
        setSeen(null);
      }
    };
    read();
    window.addEventListener("storage", read);
    const t = setInterval(read, 3000);
    return () => {
      window.removeEventListener("storage", read);
      clearInterval(t);
    };
  }, [order.id]);
  return (
    <div className="notice notice--amber enter">
      <Icon name="hourglass" className="i-16 notice__icon" />
      <div className="grow">
        <div className="notice__head">
          <b>Waiting for Mikko</b>
          {seen && <span className="muted-12">reminded {timeLabel(seen)}</span>}
        </div>
        <p className="notice__text">
          {order.pricesHeldUntil
            ? `Prices and stock are held until ${stamp(order.pricesHeldUntil)}. `
            : ""}
          His answer shows up here as soon as he decides.
        </p>
      </div>
    </div>
  );
}

// An option in the basket that Mikko's note names ("Use the trout…"), so the card can offer exactly that.
function noteOption(note: string, b: Basket) {
  const words = note.toLowerCase().match(/[a-zåäö]{4,}/g) ?? [];
  for (const l of b.lines)
    for (const o of l.issue?.options ?? []) {
      if (o.sku === l.sku) continue;
      const n = o.name.toLowerCase();
      if (words.some((w) => n.includes(w)))
        return { lineId: l.id, sku: o.sku, name: o.name };
    }
  return null;
}

export function SentBack(p: {
  by: string;
  at: string;
  note: string;
  active: boolean;
  held: string | null;
  match: { lineId: string; sku: string; name: string } | null;
  onResend: () => void;
  onSwitch: (lineId: string, sku: string) => void;
  onReply: () => void;
}) {
  const m = PEOPLE[p.by]?.name ?? p.by;
  return (
    <div className="card enter">
      <div className="card__head">
        <span className="disc disc--amber">
          <Icon name="undo-2" className="i-16" />
        </span>
        <h3 className="card__title">{firstName(p.by)} sent it back</h3>
      </div>
      {p.note && (
        <div className="note">
          <div className="note__meta">
            {m} · {timeLabel(p.at)}
          </div>
          <div className="note__text">{p.note}</div>
        </div>
      )}
      <p className="card__small">
        Nothing is ordered.
        {p.held ? ` Your prices are still held until ${stamp(p.held)}.` : ""}
      </p>
      {p.active && (
        <div className="row-8">
          {p.match ? (
            <button
              className="btn btn--lime"
              onClick={() => p.onSwitch(p.match!.lineId, p.match!.sku)}
            >
              Switch to {shortName(p.match.name).split(",")[0]} and resend
            </button>
          ) : (
            <button className="btn btn--lime" onClick={p.onResend}>
              Change and resend
            </button>
          )}
          <button className="btn btn--outline" onClick={p.onReply}>
            Reply
          </button>
        </div>
      )}
    </div>
  );
}

export function Stale({
  checkedAt,
  onRefresh,
}: {
  checkedAt: string;
  onRefresh: () => void;
}) {
  const min = Math.round((Date.now() - Date.parse(checkedAt)) / 60000);
  return (
    <div className="notice enter">
      <span className="disc disc--amber">
        <Icon name="clock" className="i-14" />
      </span>
      <div className="grow">
        <b className="notice__title">Prices are {min} min old</b>
        <p className="notice__text">
          I'll re-check price and stock when you send. Refresh now to see
          changes first.
        </p>
        <button className="btn btn--outline btn--sm" onClick={onRefresh}>
          Refresh prices
        </button>
      </div>
    </div>
  );
}

// The planner is one ~20 s gateway call; these are its real stages in order (CONTRACT.md "Planner pipeline").
// Only the labels tick on a clock; nothing on screen is data until the gateway answers.
const STEPS: [string, string, string, number][] = [
  [
    "Planning the dishes",
    "Planned the dishes",
    "amounts per guest for each ingredient",
    0,
  ],
  [
    "Searching the catalogue",
    "Searched the catalogue",
    "local copy, no calls to Valio",
    12,
  ],
  ["Picking products", "Picked products", "your usual brands first", 13],
  [
    "Checking price and stock",
    "Checked price and stock",
    "one live call for the shortlist only",
    17,
  ],
  [
    "Looking for alternatives",
    "Looked for alternatives",
    "only for lines that can't arrive",
    19,
  ],
];
export function Thinking({ since }: { since: number }) {
  const [s, setS] = useState((Date.now() - since) / 1000);
  useEffect(() => {
    const t = setInterval(() => setS((Date.now() - since) / 1000), 250);
    return () => clearInterval(t);
  }, [since]);
  const cur = STEPS.filter((x) => s >= x[3]).length - 1;
  const next = STEPS[cur + 1]?.[3] ?? 24;
  const frac = Math.min(1, (s - STEPS[cur][3]) / (next - STEPS[cur][3]));
  return (
    <div className="turn enter" role="status">
      <ThinkingMark />
      <ol className="steps">
        {STEPS.map(([now, done, sub], i) =>
          i > cur ? null : (
            <li
              key={now}
              className={i < cur ? "step step--done" : "step step--now"}
            >
              <span className="step__dot">
                <Icon
                  name={i < cur ? "check" : "loader"}
                  className={"i-14" + (i < cur ? "" : " spin")}
                />
              </span>
              <span className="grow">
                <b className="step__title">{i < cur ? done : now + "…"}</b>
                {i === cur && <span className="step__sub">{sub}</span>}
                {i === cur && (
                  <span className="bar">
                    <span
                      className="bar__fill"
                      style={{ transform: `scaleX(${frac})` }}
                    />
                  </span>
                )}
              </span>
            </li>
          ),
        )}
        <li className="step__time">{Math.floor(s)} s · usually about 20 s</li>
      </ol>
    </div>
  );
}

export function ErrorCard({
  e,
  onDismiss,
}: {
  e: ChatError;
  onDismiss: () => void;
}) {
  return (
    <div className="turn enter" role="alert">
      <span className="disc disc--red disc--32">
        <Icon name="triangle-alert" className="i-16" />
      </span>
      <div className="turn__body">
        <b className="notice__title">{e.title}</b>
        <p className="notice__text">{e.text}</p>
        <div className="row-8">
          <button className="btn btn--teal" onClick={e.retry}>
            Try again
          </button>
          <button className="btn btn--outline" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function Suggestions({ p }: { p: Props }) {
  const b = p.basket;
  if (!b || p.building) return null;
  const chips: { label: string; run: () => void }[] = [];
  const thu = weekdayLong(addDays(b.date, -1));
  if (p.phase === "draft") {
    chips.push({
      label: `Make it ${b.people + 10} guests`,
      run: () => p.onGuests(b.people + 10),
    });
    chips.push({
      label: "Add a vegan main",
      run: () => p.onSend("Add a vegan main"),
    });
    chips.push({
      label: `Deliver ${thu}`,
      run: () => p.onSend(`Deliver on ${thu} instead`),
    });
  } else if (p.phase === "review") {
    const cheaper = cheaperSwap(b);
    if (cheaper)
      chips.push({
        label: `Switch to ${shortName(cheaper.name)}`,
        run: () => p.onChoose(cheaper.lineId, cheaper.sku),
      });
    chips.push({
      label: `Deliver ${thu}`,
      run: () => p.onSend(`Deliver on ${thu} instead`),
    });
  } else if (p.phase === "placed") {
    chips.push({ label: "Order this again next week", run: p.onAgain });
    chips.push({
      label: `Move delivery to ${thu}`,
      run: () => p.onSend(`Move delivery to ${thu}`),
    });
  }
  if (!chips.length) return null;
  return (
    <div className="chips">
      {chips.map((c) => (
        <button
          key={c.label}
          className="chip"
          disabled={p.busy}
          onClick={c.run}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

// A decided line whose other option is cheaper: the honest "stay under the limit" lever.
export function cheaperSwap(b: Basket) {
  let best: {
    lineId: string;
    sku: string;
    name: string;
    total: number;
  } | null = null;
  for (const l of b.lines) {
    if (!l.issue?.decided || l.qty === 0) continue;
    for (const o of l.issue.options) {
      if (o.sku === l.sku) continue;
      const t = b.total - l.total + o.total;
      if (t < b.total && (!best || t < best.total))
        best = { lineId: l.id, sku: o.sku, name: o.name, total: t };
    }
  }
  return best;
}

function Composer({ p }: { p: Props }) {
  const held = p.basket?.pricesHeldUntil;
  const placeholder = p.planningMenu && !p.building ? "Change the menu, e.g. add fruit..." :
    p.phase === "empty" || p.phase === "thinking"
      ? p.building
        ? "Building your order…"
        : "Describe what you need…"
      : p.phase === "waiting"
        ? "Ask for a change (this withdraws the request)…"
        : p.phase === "placed"
          ? held
            ? `Ask for a change (possible until ${stamp(held)})…`
            : "Ask for a change…"
          : "Ask for a change, or describe another order…";
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (p.building) p.onStop();
        else p.onSend(p.draft);
      }}
    >
      <label className="sr-only" htmlFor="composer">
        Message the assistant
      </label>
      <textarea
        id="composer"
        ref={p.composerRef}
        className="composer__input"
        rows={1}
        value={p.draft}
        placeholder={placeholder}
        disabled={!!p.building}
        onChange={(e) => p.onDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            p.onSend(p.draft);
          }
        }}
      />
      <div className="composer__tools">
        <button
          type="button"
          className="tool"
          aria-label="Add a photo"
          onClick={p.onAttach}
        >
          <Icon name="camera" className="i-18" />
        </button>
        <button
          type="button"
          className="tool"
          aria-label="Attach a file"
          onClick={p.onAttach}
        >
          <Icon name="paperclip" className="i-18" />
        </button>
        <span className="grow" />
        {p.building ? (
          <button type="submit" className="send" aria-label="Stop building">
            <Icon name="square" className="i-16" />
          </button>
        ) : (
          <button
            type="submit"
            className="send"
            aria-label="Send"
            disabled={p.busy || !p.draft.trim()}
          >
            <Icon
              name={p.busy ? "loader" : "arrow-up"}
              className={"i-16" + (p.busy ? " spin" : "")}
            />
          </button>
        )}
      </div>
    </form>
  );
}




