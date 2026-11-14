import { useState } from "react";
import type { Basket, BasketLine, Option } from "../api";
import { QtyText } from "./QtyText";
import { Icon, productIcon } from "../icons";
import {
  dayShort,
  delta,
  isLF,
  lineIsOpen,
  money,
  niceName,
  optionReliability,
  stockStatus,
  timeLabel,
  type Status,
} from "../format";

type Edit = (
  lineId: string,
  e: { qty?: number; chooseOption?: string },
) => void;

export function Cart({
  basket,
  onEdit,
  busyLine,
  onAcceptAll,
}: {
  basket: Basket;
  onEdit: Edit;
  busyLine: string | null;
  onAcceptAll: () => void;
}) {
  const day = dayShort(basket.date);
  const issues = basket.lines.filter((l) => l.issue);
  const open = issues.filter(lineIsOpen);
  const ready = basket.lines.filter((l) => !l.issue);
  const dish = (id: string | null) =>
    basket.dishes.find((d) => d.id === id)?.name ?? "Extra";
  return (
    <section className="cart" aria-label="Cart">
      <div className="cart__head">
        <span>Product</span>
        <span>Delivery {day}</span>
        <span>Qty</span>
        <span className="r">Total</span>
        <span />
      </div>
      <div className="cart__scroll">
        {issues.length > 0 && (
          <div className="cart__section">
            <h3 className="cart__h">
              {open.length
                ? `${open.length} ${open.length === 1 ? "line needs" : "lines need"} your OK`
                : `Your ${issues.length} decisions`}
              <span className="cart__hsub">
                {open.length
                  ? "Nothing is ordered until you decide. The total updates as you go."
                  : "You can change any of them before you send."}
              </span>
              {open.some((l) => l.issue!.options.length) && (
                <button className="linkbtn cart__all" disabled={!!busyLine} onClick={onAcceptAll}>
                  Accept all suggested picks
                </button>
              )}
            </h3>
            {[...open, ...issues.filter((l) => !lineIsOpen(l))].map((l) => (
              <IssueCard
                key={l.id}
                line={l}
                dish={dish(l.dishId)}
                day={day}
                onEdit={onEdit}
                busy={busyLine === l.id}
              />
            ))}
          </div>
        )}
        <ReadyGroups
          basket={basket}
          lines={ready}
          day={day}
          onEdit={onEdit}
          busyLine={busyLine}
        />
        {basket.assumed.length > 0 && (
          <p className="cart__foot">
            Not ordered, assumed in your kitchen: {basket.assumed.join(", ")}.
            Tell the assistant if you need them.
          </p>
        )}
        {basket.notes.map((n) => (
          <p key={n} className="cart__foot">
            <Icon name="info" size={14} /> {n}
          </p>
        ))}
      </div>
    </section>
  );
}

export function StatusLine({ basket }: { basket: Basket }) {
  const n = basket.lines.length;
  const done = basket.openIssues === 0;
  return (
    <p className="statusline">
      <Icon name="checkCircle" size={20} className="ok" />
      <b>
        {done
          ? "All decided."
          : `Filled from your request: ${basket.dishes.length} dishes, ${basket.people} guests, ${n} lines.`}
      </b>
      <span className="muted">
        Checked live {timeLabel(basket.checkedAt)} · {basket.apiCalls} API calls
        · your prices and stock
        {basket.planner === "fallback" && " · demo planner (no AI)"}
      </span>
    </p>
  );
}

function IssueCard({
  line,
  dish,
  day,
  onEdit,
  busy,
}: {
  line: BasketLine;
  dish: string;
  day: string;
  onEdit: Edit;
  busy: boolean;
}) {
  const iss = line.issue!;
  const decided = iss.decided;
  const original = line.replaced?.name ?? line.name;
  const removed = decided === "remove";
  return (
    <div
      className={`issue ${decided ? "is-decided" : ""} ${busy ? "is-busy" : ""}`}
    >
      <p className="issue__top">
        <Icon
          name={
            decided ? "checkCircle" : iss.kind === "cutoff" ? "alarm" : "warn"
          }
          size={18}
          className={decided ? "ok" : "warnc"}
        />
        <span className="muted">
          {dish} · {niceName(original)}
        </span>
        <b title={iss.text}>{shortIssue(iss.kind, day)}</b>
        {!decided && iss.options.length > 1 && (
          <span className="muted">· pick one</span>
        )}
        {decided && (
          <span className="muted">
            · you {removed ? "removed it" : "picked"}
            {iss.decidedBy ? ` (${iss.decidedBy})` : ""}
          </span>
        )}
      </p>
      {iss.options.map((o, i) => (
        <OptionRow
          key={o.sku}
          o={o}
          day={day}
          chosen={decided === o.sku}
          suggested={!decided && i === 0}
          onChoose={() => onEdit(line.id, { chooseOption: o.sku })}
          disabled={busy}
        />
      ))}
      {iss.options.length === 0 && (
        <div className="row row--none">
          <Tile name={original} contains={line.contains} />
          <div className="row__name">
            <b>{niceName(original)}</b>
            <span className="muted small">
              No deliverable alternative found for {day}. Remove it, or ask your
              sales rep.
            </span>
          </div>
          <StatusCell s={stockStatus(line.stock, day, line.reliability)} />
          <span className="qty qty--static">
            {removed ? "–" : <QtyText qty={line.qty} pack={line.pack} />}
          </span>
          <span className="row__total r">
            {removed ? money(0) : <s className="muted">{money(line.total)}</s>}
          </span>
          <span className="r">
            {removed ? <span className="tag">Removed</span> : null}
          </span>
        </div>
      )}
      {!removed && (
        <p className="issue__alt">
          <button
            className="linkbtn"
            disabled={busy}
            onClick={() => onEdit(line.id, { chooseOption: "remove" })}
          >
            Don't order {iss.options.length ? "this ingredient" : "it"}
          </button>
        </p>
      )}
    </div>
  );
}

function OptionRow({
  o,
  day,
  chosen,
  suggested,
  onChoose,
  disabled,
}: {
  o: Option;
  day: string;
  chosen: boolean;
  suggested: boolean;
  onChoose: () => void;
  disabled: boolean;
}) {
  const rel = optionReliability(o.reason);
  const price = o.stock.comparisonPrice
    ? `${money(o.stock.comparisonPrice)}/${(o.stock.comparisonUnit ?? "").toLowerCase()}`
    : money(o.stock.price);
  return (
    <div className={`row ${chosen ? "row--chosen" : ""}`}>
      <Tile name={o.name} contains={o.contains} />
      <div className="row__name">
        <b>{niceName(o.name)}</b> <Chips contains={o.contains} />
        {suggested && <span className="tag tag--lime">suggested</span>}
        <span className="muted small">
          {o.why} · {price}{" "}
          {o.stock.customerPrice ? "your price" : "list price"}
        </span>
      </div>
      <StatusCell s={stockStatus(o.stock, day, rel)} />
      <span className="qty qty--static"><QtyText qty={o.qty} pack={o.pack} /></span>
      <span className="row__total r">
        <b>{money(o.total)}</b>
        <span className={o.delta <= 0 ? "pos small" : "small"}>
          {delta(o.delta)}
        </span>
      </span>
      <span className="r">
        {chosen ? (
          <span className="tag tag--ok">
            <Icon name="check" size={14} /> Chosen
          </span>
        ) : (
          <button
            className="button button--outline btn-sm"
            onClick={onChoose}
            disabled={disabled}
          >
            Choose
          </button>
        )}
      </span>
    </div>
  );
}

function ReadyGroups({
  basket,
  lines,
  day,
  onEdit,
  busyLine,
}: {
  basket: Basket;
  lines: BasketLine[];
  day: string;
  onEdit: Edit;
  busyLine: string | null;
}) {
  const [openGroups, setOpen] = useState(true);
  const total = lines.reduce((s, l) => s + l.total, 0);
  const groups = basket.dishes
    .map((d) => ({ d, ls: lines.filter((l) => l.dishId === d.id) }))
    .filter((g) => g.ls.length);
  const extra = lines.filter(
    (l) => !basket.dishes.some((d) => d.id === l.dishId),
  );
  return (
    <div className="cart__section">
      <button
        className="ready__toggle"
        onClick={() => setOpen(!openGroups)}
        aria-expanded={openGroups}
      >
        <Icon name={openGroups ? "chevronDown" : "chevron"} size={20} />
        <span className="cart__h cart__h--inline">
          {lines.length} lines ready
        </span>
        <span className="muted">
          deliverable {day} ·{" "}
          {groups
            .map(
              (g) =>
                `${g.d.name.split(" ").slice(0, 2).join(" ").toLowerCase()} ${g.ls.length}`,
            )
            .join(" · ")}
        </span>
        <b className="ready__sum">{money(total)}</b>
      </button>
      {openGroups &&
        [
          ...groups,
          ...(extra.length
            ? [
                {
                  d: {
                    id: "x",
                    name: "Other",
                    portions: basket.people,
                    basis: "",
                    diet: [],
                  },
                  ls: extra,
                },
              ]
            : []),
        ].map(({ d, ls }) => (
          <div key={d.id} className="dish">
            <p className="dish__h">
              {d.name} · {d.portions} portions{d.basis ? ` · ${d.basis}` : ""}
            </p>
            {ls.map((l) => (
              <LineRow
                key={l.id}
                l={l}
                day={day}
                onEdit={onEdit}
                busy={busyLine === l.id}
              />
            ))}
          </div>
        ))}
    </div>
  );
}

function LineRow({
  l,
  day,
  onEdit,
  busy,
}: {
  l: BasketLine;
  day: string;
  onEdit: Edit;
  busy: boolean;
}) {
  const step = l.pack === "by kg" ? 0.5 : 1;
  return (
    <div className={`row row--line ${busy ? "is-busy" : ""}`}>
      <Tile name={l.name} contains={l.contains} />
      <div className="row__name">
        <b>{niceName(l.name)}</b> <Chips contains={l.contains} lf={isLF(l)} />
        <span className="muted small">
          {l.why} · {money(l.stock.price)}{" "}
          {l.stock.customerPrice ? "your price" : "list price"}
        </span>
      </div>
      <StatusCell s={stockStatus(l.stock, day, l.reliability)} />
      <span className="qty">
        <button
          aria-label="Less"
          disabled={busy || l.qty <= 0}
          onClick={() => onEdit(l.id, { qty: Math.max(0, l.qty - step) })}
        >
          −
        </button>
        <span><QtyText qty={l.qty} pack={l.pack} /></span>
        <button
          aria-label="More"
          disabled={busy}
          onClick={() => onEdit(l.id, { qty: l.qty + step })}
        >
          +
        </button>
      </span>
      <span className="row__total r">
        <b>{money(l.total)}</b>
      </span>
      <span />
    </div>
  );
}

function StatusCell({ s }: { s: Status }) {
  return (
    <span className="status">
      <i className={`dot dot--${s.tone}`} />
      <span>
        {s.text}
        {s.sub && (
          <span
            className={`small ${s.tone === "ok" ? "pos" : s.tone === "warn" ? "amber" : "neg"}`}
          >
            {s.sub}
          </span>
        )}
      </span>
    </span>
  );
}

function Chips({ contains, lf }: { contains: string[]; lf?: boolean }) {
  return (
    <>
      {contains.includes("fish") && <span className="chip">Fish</span>}
      {contains.some((c) => c === "gluten" || c === "wheat") && (
        <span className="chip">Gluten</span>
      )}
      {contains.includes("egg") && <span className="chip">Egg</span>}
      {lf ? (
        <span className="chip chip--lf">LF</span>
      ) : (
        !contains.includes("milk") && (
          <span className="chip chip--lf">no lactose</span>
        )
      )}
    </>
  );
}

function Tile({ name, contains }: { name: string; contains: string[] }) {
  return (
    <span className="tile">
      <Icon name={productIcon(name, contains)} size={22} />
    </span>
  );
}

function shortIssue(kind: string, day: string) {
  if (kind === "cutoff") return `ordering closed for ${day} (supplier cut-off passed)`;
  if (kind === "short") return `not enough stock for ${day}`;
  return `no delivery date for ${day}`;
}
