import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Basket, BasketLine, Order } from "../api";
import { BUYER } from "../api";
import { Icon, type IconName } from "../icons";
import {
  addDays,
  lineIsOpen,
  money,
  n2,
  sameDay,
  stamp,
  timeLabel,
  weekday,
  weekdayLong,
} from "../format";
import { firstName, PEOPLE, shortName, type Item } from "../thread";
import type { Phase } from "../App";
import { AssistantBadge } from "./Mark";

export type LocalItem =
  | { kind: "user"; key: string; at: string; who: string; text: string }
  | { kind: "assistant"; key: string; at: string; text: string }
  | { kind: "system"; key: string; at: string; icon: IconName; text: string }
  | { kind: "failed"; key: string; at: string; text: string };
export type ChatError = { title: string; text: string; retry: () => void };

type Props = {
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
  const items = [...p.thread, ...p.local].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
  const open =
    p.basket && (p.phase === "draft" || p.phase === "review")
      ? p.basket.lines.filter(lineIsOpen)
      : [];
  const firstAt = items.find((i) => i.kind === "user")?.at;

  // Keep the newest turn in view (the thread only grows; nothing above is rewritten).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, open.length, p.phase, p.error, p.stale, !!p.building]);

  return (
    <section className="chat" aria-label="Aimo assistant">
      <div className="chat__head">
        <AssistantBadge />
        <h2 className="chat__title">Aimo assistant</h2>
        <span className="grow" />
        <button className="btn-ghost" onClick={p.onNew}>
          <Icon name="plus" className="i-14" /> New request
        </button>
      </div>

      <div className="thread" ref={scroller} aria-live="polite">
        {p.phase === "empty" && !p.error && (
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
        {open.map((l, i) => (
          <Question
            key={l.id}
            line={l}
            index={i}
            count={open.length}
            basket={p.basket!}
            p={p}
          />
        ))}
        {p.phase === "waiting" && p.order && <Waiting order={p.order} />}
        {p.stale && p.basket && (
          <Stale basket={p.basket} onRefresh={p.onRefreshPrices} />
        )}
        {p.building && <Thinking since={p.building.since} />}
        {p.error && <ErrorCard e={p.error} onDismiss={p.onDismissError} />}
      </div>

      <Suggestions p={p} />
      <Composer p={p} />
      <p className="foot">
        Rules are checked by Valio Aimo on every order, not by the assistant.
      </p>
    </section>
  );
}

function Intro({
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
  const name = firstName(who);
  const when =
    long || (firstAt && !sameDay(at, firstAt)) ? stamp(at) : timeLabel(at);
  return (
    <div className="user enter">
      <div className={"bubble" + (long ? " bubble--long" : "")}>
        <div className="bubble__meta">
          {name} · {when}
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
                <Icon name="list" className="i-14" /> Full technical log ·{" "}
                {it.log} API calls
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
    case "sentBack":
      return (
        <SentBack
          by={it.by}
          at={it.at}
          note={it.note}
          active={
            p.order?.id === it.orderId &&
            p.order.status === "rejected" &&
            p.phase !== "waiting"
          }
          held={p.order?.pricesHeldUntil ?? p.basket?.pricesHeldUntil ?? null}
          onResend={p.onResend}
          onReply={() => p.composerRef.current?.focus()}
        />
      );
    case "failed":
      return (
        <div className="card enter">
          <div className="card__head">
            <span className="disc disc--red">
              <Icon name="circle-x" className="i-16" />
            </span>
            <h3 className="card__title">Valio Aimo didn't confirm</h3>
          </div>
          <p className="card__text">{it.text}</p>
          <div className="row-8">
            <button className="btn btn--teal" onClick={p.onRetryOrder}>
              <Icon name="rotate-cw" className="i-16" /> Try again
            </button>
            <a className="btn btn--outline" href="tel:+358102000">
              Contact customer service
            </a>
          </div>
        </div>
      );
  }
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

// One question card per open line: the chef's call, answered with the line's real options.
function Question({
  line,
  index,
  count,
  basket,
  p,
}: {
  line: BasketLine;
  index: number;
  count: number;
  basket: Basket;
  p: Props;
}) {
  const issue = line.issue!;
  const opts = issue.options;
  const name = shortName(line.name).toLowerCase();
  const day = weekday(basket.date);
  const head =
    count === 1
      ? `One question: the ${name}`
      : `Question ${index + 1} of ${count}: the ${name}`;
  const short = issue.kind === "short" && line.stock.available != null;
  let text = issue.text.replace(/\.$/, "") + ".";
  if (opts[0])
    text += ` ${shortName(opts[0].name)} keeps the dish as planned (${money(opts[0].total)}).`;
  if (opts[1])
    text += ` ${shortName(opts[1].name)} is ${money(opts[1].total)}.`;
  if (!opts.length && !/no deliverable alternative/i.test(issue.text))
    text += ` I found nothing that arrives ${weekdayLong(basket.date)} for the same use.`;
  const busy = p.busy;
  return (
    <div className="question enter" data-question={line.id}>
      <div className="question__head">
        <Icon name="circle-alert" className="i-16" />
        {head}
      </div>
      {short && (
        <div className="question__sub">
          Only {n2(line.stock.available!)} for {day} · you need {n2(line.qty)}
        </div>
      )}
      <p className="question__text">{text}</p>
      <div className="answers">
        {opts.slice(0, 2).map((o, i) => (
          <button
            key={o.sku}
            className={"ans" + (i === 0 ? " ans--primary" : "")}
            disabled={busy}
            onClick={() => p.onChoose(line.id, o.sku)}
          >
            {i === 0 && short ? <Icon name="check" className="i-14" /> : null}
            Use {shortName(o.name).toLowerCase()}
          </button>
        ))}
        {short && (
          <button
            className={"ans" + (opts.length ? "" : " ans--primary")}
            disabled={busy}
            onClick={() => p.onChoose(line.id, "keep")}
          >
            Take the {n2(line.stock.available!)} available
          </button>
        )}
        {opts.length > 2 ? (
          <button className="ans" onClick={() => p.onSeeAll(line.id)}>
            See all {opts.length}
          </button>
        ) : (
          <button
            className={"ans" + (opts.length || short ? "" : " ans--primary")}
            disabled={busy}
            onClick={() => p.onChoose(line.id, "remove")}
          >
            Don't order it
          </button>
        )}
      </div>
    </div>
  );
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

function SentBack(p: {
  by: string;
  at: string;
  note: string;
  active: boolean;
  held: string | null;
  onResend: () => void;
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
          <button className="btn btn--lime" onClick={p.onResend}>
            Change and resend
          </button>
          <button className="btn btn--outline" onClick={p.onReply}>
            Reply
          </button>
        </div>
      )}
    </div>
  );
}

function Stale({
  basket,
  onRefresh,
}: {
  basket: Basket;
  onRefresh: () => void;
}) {
  const min = Math.round((Date.now() - Date.parse(basket.checkedAt)) / 60000);
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
const STEPS: [string, string, number][] = [
  ["Planning the dishes", "amounts per guest for each ingredient", 0],
  ["Searching the catalogue", "local copy, no calls to Valio", 12],
  ["Picking products", "your usual brands first", 13],
  ["Checking price and stock", "one live call for the shortlist only", 17],
  ["Looking for alternatives", "only for lines that can't arrive", 19],
];
function Thinking({ since }: { since: number }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setS((Date.now() - since) / 1000), 250);
    return () => clearInterval(t);
  }, [since]);
  const cur = STEPS.filter((x) => s >= x[2]).length - 1;
  const next = STEPS[cur + 1]?.[2] ?? 24;
  const frac = Math.min(1, (s - STEPS[cur][2]) / (next - STEPS[cur][2]));
  return (
    <div className="turn enter" role="status">
      <AssistantBadge />
      <ol className="steps">
        {STEPS.map(([t, sub], i) =>
          i > cur ? null : (
            <li
              key={t}
              className={i < cur ? "step step--done" : "step step--now"}
            >
              <span className="step__dot">
                <Icon
                  name={i < cur ? "check" : "loader"}
                  className={"i-14" + (i < cur ? "" : " spin")}
                />
              </span>
              <span className="grow">
                <b className="step__title">
                  {i < cur
                    ? t.replace("Checking", "Checked").replace("ing ", "ed ")
                    : t + "…"}
                </b>
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

function ErrorCard({ e, onDismiss }: { e: ChatError; onDismiss: () => void }) {
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
        label: `Switch to ${shortName(cheaper.name).toLowerCase()}`,
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
  const placeholder =
    p.phase === "empty" || p.phase === "thinking"
      ? p.building
        ? "Building your order…"
        : "Describe what you need…"
      : p.phase === "waiting"
        ? "Ask for a change (this withdraws the request)…"
        : p.phase === "placed"
          ? `Ask for a change (possible until ${weekday(addDays(p.basket!.date, -1))} 14:00)…`
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
