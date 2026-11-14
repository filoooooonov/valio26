import { useState } from "react";
import type { Basket, Mandate, Order } from "../api";
import { Icon } from "../icons";
import { dateTime, dayLabel, money, timeLeft, whole } from "../format";

type Props = {
  basket: Basket | null;
  pending: Order | null;
  busy: boolean;
  onOrder: (note: string) => void;
  onDecide: (d: "approve" | "reject", note: string) => void;
};

export function Summary({ basket, pending, busy, onOrder, onDecide }: Props) {
  const [note, setNote] = useState("");
  if (!basket) {
    return (
      <aside className="panel summary">
        <h2 className="panel__h">Order summary</h2>
        <p className="muted">
          Describe what you need on the left. The assistant fills this cart with
          your products, your prices and live stock. You decide anything it
          can't.
        </p>
      </aside>
    );
  }
  const r = basket.rules;
  const open = basket.openIssues;
  const shown = open ? basket.totalIfAccepted : basket.total;
  const vat = open ? shown * 0.135 : basket.totalWithVat - basket.total;
  const contract = basket.lines.filter(
    (l) => l.qty > 0 && l.stock.customerPrice,
  ).length;
  const counted = basket.lines.filter((l) => l.qty > 0).length;
  const state = pending ? "pending" : basket.mandate.state;
  return (
    <aside className="panel summary">
      <h2 className="panel__h">{pending ? "Your order" : "Order summary"}</h2>
      <div className="sum__deliv">
        <Icon name="truck" size={26} />
        <div>
          <b className="sum__day">{dayLabel(basket.date)}</b>
          <span className="muted">Hotelli Kaleva, Kamppi · loading dock</span>
          {basket.pricesHeldUntil && (
            <span className="sum__cut">
              <Icon name="alarm" size={16} /> Order by{" "}
              {dateTime(basket.pricesHeldUntil)} ·{" "}
              {timeLeft(basket.pricesHeldUntil)}
            </span>
          )}
        </div>
      </div>
      <div className="sum__total">
        <div>
          <b>Total</b>
          <span className="muted small">
            excl. VAT
            {open
              ? ` · if you take the suggested picks · ${money(basket.total)} orderable now`
              : ""}
          </span>
        </div>
        <span className="sum__big" data-testid="total">
          {money(shown)}
        </span>
      </div>
      <p className="sum__row">
        <span>VAT 13.5 %</span>
        <span>{money(vat)}</span>
      </p>
      <p className="sum__row">
        <span>Total incl. VAT</span>
        <span>{money(shown + vat)}</span>
      </p>
      <p className="sum__held">
        {basket.pricesHeldUntil ? (
          <>
            Prices held until {dateTime(basket.pricesHeldUntil)} (first order
            cut-off)
            <br />
          </>
        ) : null}
        <span className="muted">
          {contract} of {counted} lines at your contract price,{" "}
          {counted - contract} list price
        </span>
      </p>
      <Meter shown={shown} rules={r} />
      {state === "needs_your_ok" && (
        <>
          <button className="cta" disabled>
            Decide {open} {open === 1 ? "line" : "lines"} to continue
          </button>
        </>
      )}
      {state === "agent_may_order" && (
        <>
          <p className="sum__why">
            {basket.mandate.reasons[0] ?? "Within your rules."} You can order
            now.
          </p>
          <button
            className="cta cta--go"
            disabled={busy}
            onClick={() => onOrder("")}
          >
            {busy ? "Checking prices again…" : "Place order"}{" "}
            <Icon name="send" size={20} />
          </button>
        </>
      )}
      {state === "needs_approval" && (
        <div className="mikko">
          <Approver rules={r} />
          {basket.mandate.reasons.map((t) => (
            <p key={t} className="mikko__text">
              {t}
            </p>
          ))}
          <label className="mikko__note">
            <span>Note to {r.approver.split(" ")[0]} (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Salmon is the dish here, thanks!"
            />
          </label>
          <button
            className="cta cta--go"
            disabled={busy}
            onClick={() => onOrder(note)}
          >
            {busy
              ? "Checking prices again…"
              : `Send to ${r.approver.split(" ")[0]} for approval`}{" "}
            <Icon name="send" size={20} />
          </button>
          <p className="muted small">
            <Icon name="info" size={14} /> Prices and stock are checked again
            when he approves. Nothing is ordered until then.
          </p>
        </div>
      )}
      {state === "pending" && pending && (
        <div className="mikko">
          <Approver rules={r} />
          <p className="mikko__text">
            <b>Sent {dateTime(pending.createdAt)}.</b> Waiting for {r.approver} to decide:{" "}
            {money(pending.total)} excl. VAT, {pending.lines.length} lines.
          </p>
          {note && <p className="mikko__quote">“{note}”</p>}
          <div className="phone" aria-label="Approver view (demo)">
            <p className="phone__label">
              {r.approver.split(" ")[0]}'s phone · demo, acting as {r.approver}
            </p>
            <p className="small">{pending.mandate.reasons[0]}</p>
            <div className="phone__btns">
              <button
                className="cta cta--go"
                disabled={busy}
                onClick={() => onDecide("approve", "OK, go ahead.")}
              >
                {busy ? "Re-checking…" : "Approve"}
              </button>
              <button
                className="button button--outline"
                disabled={busy}
                onClick={() => onDecide("reject", "Not this week.")}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function Approver({ rules }: { rules: Mandate }) {
  const initials = rules.approver
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .replace(".", "");
  return (
    <div className="mikko__who">
      <span className="avatar">{initials}</span>
      <div>
        <b>{rules.approver.split(" ")[0]} approves this one</b>
        <span className="muted small">
          {rules.approver} · purchasing manager
        </span>
      </div>
    </div>
  );
}

function Meter({ shown, rules }: { shown: number; rules: Mandate }) {
  const max = Math.max(rules.maxOrderEur * 1.25, shown * 1.05);
  const over = shown > rules.maxOrderEur;
  return (
    <div className={`meter ${over ? "is-over" : ""}`}>
      <p className="meter__t">
        <b>
          {over
            ? `${money(shown - rules.maxOrderEur)} over your ${whole(rules.maxOrderEur)} limit`
            : `${money(rules.maxOrderEur - shown)} under your ${whole(rules.maxOrderEur)} limit`}
        </b>
        <span>
          {over
            ? `${rules.approver.split(" ")[0]} approves`
            : "you can order alone"}
        </span>
      </p>
      <div className="meter__bar">
        <i
          style={{
            width: `${Math.min(100, (Math.min(shown, rules.maxOrderEur) / max) * 100)}%`,
          }}
        />
        {over && (
          <i
            className="meter__over"
            style={{
              left: `${(rules.maxOrderEur / max) * 100}%`,
              width: `${((shown - rules.maxOrderEur) / max) * 100}%`,
            }}
          />
        )}
        <b
          className="meter__mark"
          style={{ left: `${(rules.maxOrderEur / max) * 100}%` }}
        />
      </div>
      <p
        className="meter__lim"
        style={{
          paddingLeft: `calc(${(rules.maxOrderEur / max) * 100}% - 40px)`,
        }}
      >
        {whole(rules.maxOrderEur)} limit
      </p>
    </div>
  );
}

export function Rules({ rules }: { rules: Mandate | null }) {
  if (!rules) return null;
  return (
    <aside className="panel rules">
      <p className="rules__h">
        <Icon name="shield" size={24} /> <b>Your rules</b>{" "}
        <span className="muted small">
          set by {rules.approver.split(" ")[0]} · enforced by Valio Aimo
        </span>
      </p>
      <p className="rules__row">
        <Icon name="bot" size={18} />
        <b>Assistant alone</b>
        <span>fills the cart, never orders a swap</span>
      </p>
      <p className="rules__row">
        <Icon name="chef" size={18} />
        <b>Anna, head chef</b>
        <span>any swap · orders up to {whole(rules.maxOrderEur)}</span>
      </p>
      <p className="rules__row">
        <Icon name="user" size={18} />
        <b>{rules.approver.split(" ")[0]}, manager</b>
        <span>
          orders over {whole(rules.maxOrderEur)} or {whole(rules.maxDailyEur)} a
          day
        </span>
      </p>
      <p className="muted small">
        Checked by the Valio Aimo gateway on every order, from this page or from
        any buyer agent.
      </p>
    </aside>
  );
}
