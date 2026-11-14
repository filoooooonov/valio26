import { useEffect, useState, type ReactNode, type CSSProperties } from "react";
import {
  api,
  BUYER,
  isNotFound,
  type Basket,
  type BasketLine,
  type Order,
} from "../api";
import { dishIcon, Icon, productIcon, type IconName } from "../icons";
import {
  addDays,
  dayLabel,
  lineIsOpen,
  money,
  whole,
  n2,
  niceName,
  perUnit,
  qtyLabel,
  SLOT,
  stamp,
  timeLabel,
  weekday,
} from "../format";
import { cleanIssue, firstName, isAutoSwap, orderLabel, PEOPLE, plain, shortName } from "../thread";
import type { Phase } from "../App";
import { cheaperSwap } from "./Chat";
import { Segmented } from "./Header";
import { AssistantGlyph } from "./Mark";
import "./order-polish.css";
import { RecipeDialog } from "./RecipeDialog";

export type OrderProps = {
  canUndo?: boolean;
  onUndo?: () => void;
  onRepeat?: () => void;
  deliveryTime?: string;
  insight?: ReactNode;
  planningMenu?: boolean;
  phase: Phase;
  basket: Basket | null;
  order: Order | null;
  event: string;
  busy: boolean;
  busyLine: string | null;
  pickup: boolean;
  onPickup: (p: boolean) => void;
  onToggle: (lineId: string) => void;
  onQty: (lineId: string, qty: number) => void;
  onSwap: (lineId: string) => void;
  onGuests: (n: number) => void;
  onReview: () => void;
  onOrder: () => void;
  onChoose: (lineId: string, sku: string) => void;
  onRemind: () => void;
  onWithdraw: () => void;
  onView: () => void;
  onDone: () => void;
  onPrefill: (s: string) => void;
  onHero: () => void;
};

export function OrderPanel(p: OrderProps) {
  const b = p.basket;
  if (p.phase === "placed" && p.order && b) return <OrderDone p={p} b={b} order={p.order} />;
  const eyebrow =
    p.phase === "review"
      ? "Review and confirm · step 2 of 3"
      : p.phase === "waiting"
        ? `Sent for approval · waiting for ${firstName(b?.rules.approver ?? "Mikko")}`
        : p.phase === "placed"
          ? `Order placed · ${p.order ? orderLabel(p.order.id) : ""}`
          : null;
  return (
    <section className="order" aria-label="Order">
      <div className="order__head">
        {eyebrow && <div className="eyebrow">
          <AssistantGlyph />
          {eyebrow}
        </div>}
        <h1 className="order__title">
          {b ? `Catering for ${b.people} · ${dayLabel(p.event)}` : "Your order"}
        </h1>
        {b && <Controls p={p} b={b} />}
        {(p.phase === "draft" || p.phase === "review") && p.insight}

      </div>
      <div className="order__lines">
        {!b ? (
          <EmptyOrder planningMenu={p.planningMenu} thinking={p.phase === "thinking"} onHero={p.onHero} />
        ) : (
          <Lines key={b.id} p={p} b={b} />
        )}
      </div>
      {b && <Footer p={p} b={b} />}
    </section>
  );
}

function OrderDone({ p, b, order }: { p: OrderProps; b: Basket; order: Order }) {
  const actor = order.decidedBy ?? order.by;
  return <section className="order order--done" aria-label="Order confirmation">
    <div className="order__lines order-done">
      <div className="order-done__mark"><Icon name="circle-check" className="i-22" /></div>
      <p className="order-done__eyebrow">Order {orderLabel(order.id)}</p>
      <h1>Order complete</h1>
      <p>Your order and its fixed-price record are saved in the prototype gateway.</p>
      <dl className="order-done__facts">
        <div><dt>Total, excl. VAT</dt><dd>{money(order.total)}</dd></div>
        <div><dt>Requested delivery</dt><dd>{dayLabel(b.date)}, {p.deliveryTime ?? SLOT}</dd></div>
        <div><dt>{order.decidedBy ? "Approved by" : "Placed by"}</dt><dd>{actor === BUYER ? 'You' : PEOPLE[actor]?.name ?? actor}</dd></div>
        <div><dt>Recorded at</dt><dd>{stamp(order.decidedAt ?? order.createdAt)}</dd></div>
      </dl>
      <p className="order-done__prototype">Local prototype order. Nothing has been submitted to Valio Aimo's ordering systems.</p>
      <button className="btn order-done__view" onClick={p.onView}><Icon name="file-text" className="i-16" /> View order and audit trail</button>
      <button className="link" onClick={p.onDone}>Back to shop</button>
      <details className="order-done__products"><summary>View {order.lines.length} products</summary><Lines key={b.id} p={p} b={b} /></details>
    </div>
  </section>;
}

function EmptyOrder({
  planningMenu,
  thinking,
  onHero,
}: {
  thinking: boolean;
  planningMenu?: boolean;
  onHero: () => void;
}) {
  if (planningMenu && !thinking) return <div className="order__empty"><p>Agree on your menu in the assistant first. Products, quantities and prices will appear here after you approve it.</p></div>;
  if (thinking)
    return (
      <div className="skeleton" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton__row">
            <span className="skeleton__tile" />
            <span className="skeleton__lines">
              <span className="skeleton__bar" />
              <span className="skeleton__bar skeleton__bar--short" />
            </span>
          </div>
        ))}
      </div>
    );
  return (
    <div className="order__empty">
      <p>
        Nothing here yet. Tell the assistant what you're cooking and the order
        builds here, with your prices and Friday stock.
      </p>
      <button className="btn btn--outline" onClick={onHero}>
        Try: catering for 50 on Saturday
      </button>
    </div>
  );
}

function Controls({ p, b }: { p: OrderProps; b: Basket }) {
  const [recipeOpen, setRecipeOpen] = useState(false);
  const perGuest =
    (b.openIssues ? b.totalIfAccepted : b.total) / Math.max(1, b.people);
  const per = (
    <div className="perguest">
      <b>{money(perGuest)} per guest</b>
      <span>your prices, excl. VAT</span>
    </div>
  );
  if (p.phase === "placed" && p.order) {
    const o = p.order;
    const approved = o.decidedBy && o.status === "placed";
    return (
      <div className="controls">
        <Fact
          tone="green"
          icon="circle-check"
          label={approved ? "Approved" : "Placed"}
          value={`${approved ? (PEOPLE[o.decidedBy!]?.name ?? o.decidedBy) : o.by === BUYER ? 'You' : firstName(o.by)} · ${timeLabel(o.decidedAt ?? o.createdAt)}`}
        />
        <Fact
          icon="truck"
          label="Delivery"
          value={`${dayLabel(b.date)}, ${p.deliveryTime ?? SLOT}`}
        />
        <Fact
          icon="lock"
          label="Fixed price"
          value={`${money(o.total)} excl. VAT`}
        />
      </div>
    );
  }
  const locked = p.phase === "waiting";
  return (
    <>
      <div className="phone-only">
        <Segmented
          pickup={p.pickup}
          onPickup={p.onPickup}
          label={`Delivery · ${dayLabel(b.date)}, ${p.deliveryTime ?? SLOT}`}
          disabled={locked}
        />
      </div>
      <div className="controls">
        {locked ? (
          <span className="pill pill--plain">
            <Icon name="users" className="i-16" /> <b>{b.people} guests</b>
          </span>
        ) : (
          <div className="guests" role="group" aria-label="Guests">
            <button
              className="round"
              aria-label="Fewer guests"
              disabled={p.busy || b.people <= 1}
              onClick={() =>
                p.onGuests(b.people - 10 >= 1 ? b.people - 10 : b.people - 1)
              }
            >
              <Icon name="minus" className="i-16" />
            </button>
            <span className="guests__value">
              <Icon name="users" className="i-16 desk-only" />
              {b.people} guests
            </span>
            <button
              className="round"
              aria-label="More guests"
              disabled={p.busy}
              onClick={() => p.onGuests(b.people + 10)}
            >
              <Icon name="plus" className="i-16" />
            </button>
          </div>
        )}
        <button className="pill" type="button" onClick={() => setRecipeOpen(true)} aria-haspopup="dialog"><Icon name="utensils" className="i-16" />Recipe</button>
        {recipeOpen && <RecipeDialog basket={b} onClose={() => setRecipeOpen(false)} />}
        <span className="grow" />
        {per}
      </div>
    </>
  );
}

function Fact({
  icon,
  label,
  value,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  tone?: "green";
}) {
  return (
    <div className={"fact" + (tone ? " fact--" + tone : "")}>
      <Icon name={icon} className="i-16" />
      <span>
        <span className="fact__label">{label}</span>
        <span className="fact__value">{value}</span>
      </span>
    </div>
  );
}

function Lines({ p, b }: { p: OrderProps; b: Basket }) {
  const [entering, setEntering] = useState(true);
  useEffect(() => { const timer = setTimeout(() => setEntering(false), 340); return () => clearTimeout(timer); }, []);
  const frozen = p.phase === "waiting" || p.phase === "placed";
  const shown = frozen
    ? b.lines.filter((l) => l.qty > 0 && !lineIsOpen(l))
    : b.lines.filter(l => l.qty > 0 || l.excludedQty != null || lineIsOpen(l));
  const groups = [
    ...b.dishes.map((d) => ({
      dish: d,
      lines: shown.filter((l) => l.dishId === d.id),
    })),
    {
      dish: null,
      lines: shown.filter(
        (l) => !l.dishId || !b.dishes.some((d) => d.id === l.dishId),
      ),
    },
  ].filter((g) => g.lines.length);
  return (
    <div className={"product-list" + (entering ? " product-list--entering" : "")}>
      {groups.map((g) => {
        const total = g.lines
          .filter((l) => !lineIsOpen(l))
          .reduce((s, l) => s + l.total, 0);
        return (
          <div key={g.dish?.id ?? "other"} className="dish">
            <div className="dish__head">
              <span className="dish__photo dish__photo--icon">
                <Icon name={dishIcon(g.dish?.name ?? "Other")} className="i-22" />
              </span>
              <div className="grow">
                <h3 className="dish__name">
                  {g.dish?.name ?? "Other products"}
                </h3>
                {g.dish && (
                  <div className="dish__sub">
                    {g.dish.portions} portions ·{" "}
                    {g.lines.length}{" "}
                    {g.lines.length === 1 ? "product" : "products"}
                  </div>
                )}
              </div>
              <b className="dish__total">{money(total)}</b>
            </div>
            {g.lines.map((l, index) => (
              <LineRow
                key={l.id}
                revealIndex={index}
                l={l}
                b={b}
                p={p}
                frozen={frozen}
                placed={p.phase === "placed"}
              />
            ))}
          </div>
        );
      })}
      {b.assumed.length > 0 && (
        <p className="assumed">
          Not ordered, assumed in your kitchen: {b.assumed.join(", ")}.
        </p>
      )}
    </div>
  );
}


const reasonShort = (l: BasketLine, date: string) =>
  l.issue?.kind === "cutoff"
    ? "order cut-off passed"
    : l.issue?.kind === "short"
      ? `not enough for ${weekday(date)}`
      : `no ${weekday(date)} delivery`;

export function LineRow({
  l,
  b,
  p,
  frozen,
  placed,
  revealIndex = 0,
}: {
  l: BasketLine;
  b: Basket;
  p: OrderProps;
  frozen: boolean;
  placed: boolean;
  revealIndex?: number;
}) {
  const open = lineIsOpen(l);
  const off = !open && (l.qty === 0 || l.issue?.decided === "remove");
  const sku = l.sku;
  const name = niceName(l.name);
  const frozenItem = l.frozen ?? /\b(?:frozen|deep[ -]?frozen|deepfrost|FRO)\b/i.test(l.name);
  const stock = l.stock;
  const total = l.total;
  const qty = l.qty;
  const pack = l.pack;
  const busy = p.busyLine === l.id;

  let tag: { text: string; tone: string } | null = null;
  if (!open && l.replaced && isAutoSwap(l.issue?.decidedBy))
    tag = { text: "Swapped", tone: "blue" };
  else if (l.replaced || (l.issue?.decided && l.issue.decided !== "remove"))
    tag = { text: "Chosen by you", tone: "green" };
  else if (off)
    tag = {
      text: l.issue?.decided === "remove" ? "Not ordered" : "Left out",
      tone: "grey",
    };

  const why0 = l.replaced
      ? `Instead of ${shortName(l.replaced.name)} (${reasonShort(l, b.date)}) · ${l.why} · ${sku}`
      : open
        ? `${cleanIssue(l.issue!.text)} · ${sku}`
        : `${l.why} · ${sku}`;
  const why = plain(why0);

  const st = stockLine(l, open ? l.stock : stock, b.date, open);
  const unit = perUnit(stock);
  const sub =
    stock.customerPrice && stock.comparisonPrice ? (
      <span
        className="price__yours"
        title={
          stock.listPrice ? `List price ${money(stock.listPrice)}` : undefined
        }
      >
        your price · {money(stock.comparisonPrice)}/{unit}
      </span>
    ) : (
      <span className="price__unit">
        {money(stock.price)} / {pack === "by kg" ? "kg" : "pack"}
      </span>
    );
  const atLimit =
    !open && !off && stock.available != null && qty + 1 > stock.available;

  return (
    <div
      className={
        "line" +
        (open ? " line--open" : "") +
        (off ? " line--off" : "") +
        (placed ? " line--placed" : "")
      }
      aria-busy={busy || undefined}
      onClick={open && !frozen && !busy && !p.busy ? event => { if (!(event.target as Element).closest("button, input, a, summary, details, textarea, select")) p.onSwap(l.id); } : undefined}
      style={{ "--product-delay": `${Math.min(revealIndex * 12, 90)}ms` } as CSSProperties}
    >
      {!placed && (
        <button
          className="check"
          role="checkbox"
          aria-checked={!open && !off}
          aria-label={`Include ${name}`}
          disabled={frozen || busy || p.busy}
          onClick={() => open ? p.onSwap(l.id) : p.onToggle(l.id)}
        >
          <span className="check__box">
            {!open && !off && <Icon name="check" className="i-14" />}
          </span>
        </button>
      )}
      <ProductTile
        sku={sku}
        name={name}
        contains={l.contains}
      />
      <div className="line__text">
        <div className="line__name">
          {open && !frozen ? <button type="button" className="line__missing-name" disabled={busy || p.busy} aria-label={"Review replacements for " + name} onClick={() => p.onSwap(l.id)}>{name}</button> : <span>{name}</span>}
          {frozenItem && <span className="line__frozen" role="img" aria-label="Frozen" title="Frozen"><Icon name="snowflake" className="i-16" /></span>}
          {tag && !open && (
            <span className={"tag tag--" + tag.tone}>
              {tag.text}
            </span>
          )}
        </div>
        {!off && st.tone !== "green" && <div className={"line__stock line__stock--" + st.tone}>
          <Icon name={open ? "circle-alert" : st.icon} className="i-14" />
          {st.text}
        </div>}
        {open && !frozen && <button type="button" className="line__resolve" disabled={busy || p.busy} onClick={() => p.onSwap(l.id)}>{l.issue!.options.length ? 'Choose replacement' : 'Review options'}<Icon name="arrow-right" className="i-16" /></button>}
        {!open && <details className="line__details">
          <summary aria-label={`Product details for ${name}`}>Product details</summary>
          <p className="line__catalogue">{l.name}</p>
          <p className="line__catalogue">SKU {sku}</p>
          <div className="line__why">{why}</div>
          {!off && <div className="line__unit">{sub}</div>}
        </details>}
        {atLimit && !frozen && (
          <div className="line__limit">
            That's all Valio has for {weekday(b.date)} ({n2(stock.available!)})
          </div>
        )}
      </div>
      <div className="price">
        <b className={off ? "price__off" : ""}>{off ? "—" : money(total)}</b>
      </div>
      {frozen || open ? (
        <span className="line__qty">{qtyLabel(qty, pack)}</span>
      ) : off ? (
        <span className="line__qty line__qty--off">{qtyLabel(l.excludedQty ?? 0, pack)}</span>
      ) : (
        <div
          className={"stepper" + (open ? " stepper--white" : "")}
          role="group"
          aria-label={`Quantity of ${name}`}
        >
          <button
            className="stepper__btn"
            aria-label="Less"
            disabled={open || busy || p.busy || qty <= 1}
            onClick={() => p.onQty(l.id, qty - 1)}
          >
            <Icon name="minus" className="i-14" />
          </button>
          <span className="stepper__value" aria-live="polite">
            {busy ? (
              <Icon name="loader" className="i-14 spin" />
            ) : (
              qtyLabel(qty, pack)
            )}
          </span>
          <button
            className="stepper__btn"
            aria-label="More"
            disabled={open || busy || p.busy || atLimit}
            onClick={() => p.onQty(l.id, qty + 1)}
          >
            <Icon name="plus" className="i-14" />
          </button>
        </div>
      )}
      {!frozen && (!off || l.excludedQty != null) && <button type="button" className="swapbtn line__remove" title="Remove item" aria-label={`Remove ${name} from cart`} disabled={busy || p.busy || !!p.busyLine} onClick={() => l.issue ? p.onChoose(l.id, 'remove') : p.onQty(l.id, 0)}><Icon name="x" className="i-16" /></button>}
    </div>
  );
}

function stockLine(
  l: BasketLine,
  s: BasketLine["stock"],
  date: string,
  broken: boolean,
): { tone: string; icon: IconName; text: string } {
  const day = dayLabel(date);
  if (l.issue?.kind === "short" && !l.issue.decided && l.stock.available != null)
    return {
      tone: "amber",
      icon: "circle-alert",
      text: `Only ${n2(l.stock.available)} for ${day} · you need ${n2(l.qty)}`,
    };
  if (s.available != null && l.qty > s.available) return { tone: "amber", icon: "circle-alert", text: `Only ${n2(s.available)} available; you need ${n2(l.qty)}` };
  if (broken || s.cutoffPassed || !s.deliverable)
    return {
      tone: "red",
      icon: "circle-x",
      text: s.cutoffPassed
        ? `Ordering closed for ${day}`
        : `No delivery ${day}${s.availableDate ? ` · from ${dayLabel(s.availableDate)}` : ""}`,
    };
  return { tone: "green", icon: "truck", text: `${day} ${SLOT}` };
}

// Product photo: GET /api/products/:sku/image only for products on screen; icon tile otherwise.
const imgCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();
let imagesMissing = false;
export function useProductImage(sku?: string) {
  const [url, setUrl] = useState<string | null>(
    sku ? (imgCache.get(sku) ?? null) : null,
  );
  useEffect(() => {
    if (!sku || imagesMissing) return;
    if (imgCache.has(sku)) return setUrl(imgCache.get(sku) ?? null);
    let live = true;
    const pr =
      inflight.get(sku) ??
      api.image(sku).catch((e) => {
        if (isNotFound(e)) imagesMissing = true; // endpoint not on this gateway: stop asking
        return null;
      });
    inflight.set(sku, pr);
    pr.then((u) => {
      imgCache.set(sku, u);
      if (live) setUrl(u);
    });
    return () => {
      live = false;
    };
  }, [sku]);
  return url;
}

function ProductTile({
  sku,
  name,
  contains,
}: {
  sku: string;
  name: string;
  contains: string[];
}) {
  const url = useProductImage(sku);
  const [broken, setBroken] = useState(false);
  return (
    <span className="tile">
      {url && !broken ? (
        <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Icon name={productIcon(name, contains)} className="i-22" />
      )}
    </span>
  );
}

function Footer({ p, b }: { p: OrderProps; b: Basket }) {
  const max = b.rules.maxOrderEur;
  const held = b.pricesHeldUntil ? stamp(b.pricesHeldUntil) : null;
  const count = b.lines.filter(
    (l) => l.qty > 0 && l.issue?.decided !== "remove",
  ).length;
  const active = b.lines.filter(l => l.qty > 0 && l.issue?.decided !== "remove");
  const allDeliverable = (p.phase === "draft" || p.phase === "review") && active.length > 0 && b.openIssues === 0 && active.every(l => !lineIsOpen(l) && l.stock.deliverable && !l.stock.cutoffPassed && (l.stock.available == null || l.qty <= l.stock.available));
  const open = b.lines.filter(lineIsOpen);
  const ordering = p.busy;
  let cta: ReactNode;
  let note = "";
  let alt: ReactNode = null;

  if ((p.phase === "draft" || p.phase === "review") && open.length) {
    cta = <button className="cta cta--issues" disabled={ordering} onClick={p.onReview}>
      <Icon name="circle-alert" className="i-18" />
      <span className="cta__label">Resolve {open.length} product {open.length === 1 ? 'issue' : 'issues'}</span>
      <span className="grow" /><span className="cta__total">{money(b.total)}</span>
    </button>;
    note = 'Subtotal excludes ' + open.length + ' unresolved ' + (open.length === 1 ? 'product.' : 'products.');
  } else if (p.phase === "draft") {
    cta = <button className="cta cta--lime" disabled={ordering} onClick={p.onReview}>
      <span className="cta__label">Review and confirm<span className="desk-only"> {count} products</span></span>
      <span className="grow" /><span className="cta__total">{money(b.total)}</span>
    </button>;
    note = 'Prices exclude VAT.';
  } else if (p.phase === "review") {
    const st = b.mandate.state;
    const label =
      st === "needs_approval"
        ? `Send to ${firstName(b.rules.approver)} for approval`
        : st === "agent_may_order"
          ? "Place order"
          : "Answer the open questions first";
    const loading =
      st === "needs_approval"
        ? `Sending to ${firstName(b.rules.approver)}…`
        : "Placing order…";
    cta = (
      <button
        className="cta cta--lime"
        disabled={ordering || st === "needs_your_ok"}
        aria-busy={ordering || undefined}
        onClick={p.onOrder}
      >
        <Icon
          name={
            ordering ? "loader" : st === "agent_may_order" ? "check" : "send"
          }
          className={"i-18" + (ordering ? " spin" : "")}
        />
        <span className="cta__label">{ordering ? loading : label}</span>
        <span className="grow" />
        <span className="cta__total">{money(b.total)}</span>
      </button>
    );
    const why =
      st === "needs_approval"
        ? b.total > max
          ? `Over your ${whole(max)} limit`
          : `Over your ${whole(b.rules.maxDailyEur)} daily limit with today's orders`
        : `Inside your ${whole(max)} limit`;
    note = `${why}${held ? ` · prices held until ${held}` : ""} · excl. VAT (${money(b.totalWithVat)} with VAT)`;
    const c = cheaperSwap(b);
    if (st === "needs_approval" && b.total > max && c && c.total <= max)
      alt = (
        <>
          Rather stay under {whole(max)}?{" "}
          <button className="link" onClick={() => p.onChoose(c.lineId, c.sku)}>
            Switch to {shortName(c.name)} · {money(c.total)}, no
            sign-off
          </button>
        </>
      );
  } else if (p.phase === "waiting") {
    cta = (
      <button className="cta cta--outline" onClick={p.onRemind}>
        <Icon name="bell" className="i-18" />
        <span className="cta__label">Remind {firstName(b.rules.approver)}</span>
      </button>
    );
    note = `Nothing is ordered until ${firstName(b.rules.approver)} approves${held ? ` · prices and stock held until ${held}` : ""} · excl. VAT`;
    alt = (
      <>
        Need to change something?{" "}
        <button className="link" onClick={p.onWithdraw}>
          Withdraw and edit the order
        </button>
      </>
    );
  } else if (p.phase === "placed" && p.order) {
    cta = (
      <button className="cta cta--teal" onClick={p.onView}>
        <Icon name="file-text" className="i-18" />
        <span className="cta__label">View order</span>
        <span className="grow" />
        <span className="cta__total">{money(p.order.total)}</span>
      </button>
    );
    note = `Recorded in the prototype gateway ${timeLabel(p.order.decidedAt ?? p.order.createdAt)} · prices fixed · changes possible until ${dayLabel(addDays(b.date, -1))}, 14:00`;
    alt = (
      <>
        Done here?{" "}
        <button className="link" onClick={p.onDone}>
          Back to shop
        </button>
      </>
    );
  } else return null;

  return (
    <div className="order__foot">
      {cta}
      {allDeliverable && <p className="order-delivery"><Icon name="truck" className="i-16" /> All products will arrive on {dayLabel(b.date)}, {p.deliveryTime ?? SLOT}.</p>}
      <p className="foot-note">{note}</p>
      {alt && <p className="foot-alt">{alt}</p>}
    </div>
  );
}
