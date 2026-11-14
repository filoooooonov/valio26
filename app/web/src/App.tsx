import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  ApiError,
  APPROVER,
  BUYER,
  isNotFound,
  type AuditEvent,
  type Basket,
  type Order,
  type OrderConflict,
} from "./api";
import { Header, PhoneTabs } from "./components/Header";
import { Chat, type LocalItem, type ChatError } from "./components/Chat";
import { OrderPanel } from "./components/OrderPanel";
import { SwapSheet, LogSheet } from "./components/Sheets";
import { MikkoView } from "./components/Mikko";
import { addDays, timeLabel } from "./format";
import { buildThread, firstName, shortName } from "./thread";

// In-webshop assistant (owner: aleksei). Flow: request -> draft (answer questions in chat) -> review ->
// order (201 placed | 202 to Mikko) -> Mikko decides in ?view=mikko. All prices, stock and rules come from
// the gateway (CONTRACT.md v1.2); this file only holds UI state.
export const HERO =
  "Ingredients for a catering event for 50 people on Saturday: creamy salmon soup, rye bread, blueberry pie. 3 guests are lactose-free.";
const params = new URLSearchParams(location.search);
const DELIVERY = params.get("date") ?? "2026-11-20"; // Fri before the Saturday event
const STALE_MS = 20 * 60 * 1000;

type NewItem = LocalItem extends infer T ? (T extends LocalItem ? Omit<T, "key" | "at"> : never) : never;
export type Phase =
  "empty" | "thinking" | "draft" | "review" | "waiting" | "placed";

export default function App() {
  if (params.get("view") === "mikko") return <MikkoView />;
  return <Shop />;
}

function setUrl(b?: string, o?: string) {
  const p = new URLSearchParams(location.search);
  p.delete("b");
  p.delete("o");
  if (b) p.set("b", b);
  if (o) p.set("o", o);
  history.replaceState(
    null,
    "",
    `${location.pathname}${p.size ? "?" + p : ""}`,
  );
}

function Shop() {
  const [basket, setBasket] = useState<Basket | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [local, setLocal] = useState<LocalItem[]>([]);
  const [building, setBuilding] = useState<{
    since: number;
    request: string;
  } | null>(null);
  const [error, setError] = useState<ChatError | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [tab, setTab] = useState<"assistant" | "order">("assistant");
  const [draft, setDraft] = useState(params.get("q") ?? "");
  const [pickup, setPickup] = useState(false);
  const [freshAt, setFreshAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const abort = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const qtyMemo = useRef<Record<string, number>>({});

  const say = useCallback((item: NewItem) => {
    const at = new Date().toISOString();
    setLocal((l) => [
      ...l,
      { ...item, at, key: "local-" + at + "-" + l.length } as LocalItem,
    ]);
  }, []);

  const refreshAudit = useCallback(async (id: string) => {
    try {
      setEvents(await api.basketAudit(id));
    } catch {
      /* the thread keeps its last state; the next action retries */
    }
  }, []);

  const adopt = useCallback(
    async (b: Basket) => {
      setBasket(b);
      setFreshAt(null);
      await refreshAudit(b.id);
    },
    [refreshAudit],
  );

  // Restore a session from the URL (?b=basket&o=order) so a reload or a second tab keeps the record.
  useEffect(() => {
    const b = params.get("b");
    if (!b) return;
    (async () => {
      try {
        const bk = await api.basket(b);
        await adopt(bk);
        const o = params.get("o");
        if (o) {
          const ord = await api.getOrder(o);
          setOrder(ord);
          if (ord.status === "rejected") setReviewing(true);
        }
      } catch {
        setUrl();
      }
    })();
  }, [adopt]);

  useEffect(() => setUrl(basket?.id, order?.id), [basket?.id, order?.id]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  // Waiting: poll the order every 3 s until Mikko decides.
  useEffect(() => {
    if (order?.status !== "pending_approval") return;
    const t = setInterval(async () => {
      try {
        const o = await api.getOrder(order.id);
        if (o.status !== order.status) {
          setOrder(o);
          if (basket) await refreshAudit(basket.id);
          if (o.status === "rejected") setReviewing(true);
        }
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [order, basket, refreshAudit]);

  const fail = useCallback((e: unknown, retry: () => void, what = "stock") => {
    if ((e as Error).name === "AbortError") return;
    const status = e instanceof ApiError ? e.status : 0;
    setError({
      title:
        what === "stock"
          ? "Couldn't reach Valio's stock service"
          : "That didn't go through",
      text:
        status >= 500 || status === 0
          ? `The gateway didn't answer${status ? ` (${status})` : ""}. Nothing is ordered.`
          : `${(e as Error).message}. Nothing is ordered.`,
      retry,
    });
  }, []);

  async function build(request: string, people?: number) {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setError(null);
    setBuilding({ since: Date.now(), request });
    setOrder(null);
    setReviewing(false);
    setLocal([]);
    setTab("assistant");
    try {
      const b = await api.build(
        request,
        basket?.date ?? DELIVERY,
        people,
        ac.signal,
      );
      await adopt(b);
    } catch (e) {
      fail(e, () => build(request, people));
    } finally {
      if (abort.current === ac) setBuilding(null);
    }
  }
  function stop() {
    abort.current?.abort();
    setBuilding(null);
    say({
      kind: "assistant",
      text: "Stopped. Nothing was ordered. Tell me what to change and I'll start again.",
    });
  }

  async function edit(
    lineId: string,
    e: { qty?: number; chooseOption?: string },
  ) {
    if (!basket) return;
    setError(null);
    setBusyLine(lineId);
    try {
      await adopt(await api.edit(basket.id, lineId, e));
    } catch (err) {
      fail(err, () => edit(lineId, e), "edit");
    } finally {
      setBusyLine(null);
    }
  }

  function toggleLine(lineId: string) {
    const l = basket?.lines.find((x) => x.id === lineId);
    if (!l) return;
    if (l.issue && !l.issue.decided) {
      if (l.issue.options[0])
        return edit(lineId, { chooseOption: l.issue.options[0].sku });
      if (l.issue.kind === "short")
        return edit(lineId, { chooseOption: "keep" });
      return setSheet(lineId);
    }
    if (l.issue?.decided === "remove")
      return edit(lineId, { chooseOption: l.issue.options[0]?.sku ?? "keep" });
    if (l.qty > 0) {
      qtyMemo.current[lineId] = l.qty;
      return edit(lineId, { qty: 0 });
    }
    return edit(lineId, { qty: qtyMemo.current[lineId] ?? 1 });
  }

  async function setGuests(people: number) {
    if (!basket || people < 1) return;
    setError(null);
    setBusy(true);
    try {
      await adopt(await api.guests(basket.id, people));
    } catch (e) {
      if (isNotFound(e)) {
        // v1.2 rescale not live on this gateway: rebuild with the new guest count (one planner run).
        setBusy(false);
        return build(
          basket.request.replace(
            /\b\d+\s+(people|guests|persons)/i,
            `${people} $1`,
          ),
          people,
        );
      }
      fail(e, () => setGuests(people), "edit");
    } finally {
      setBusy(false);
    }
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t) return;
    setDraft("");
    if (!basket || building) return build(t);
    if (order?.status === "pending_approval") {
      say({ kind: "user", who: BUYER, text: t });
      say({
        kind: "assistant",
        text: `It's with ${firstName(APPROVER)} now, and withdrawing isn't connected to Valio Aimo yet. Ask him to send it back and you can change anything.`,
      });
      return;
    }
    setBusy(true);
    try {
      const r = await api.chat(basket.id, t);
      if (r.basket.id !== basket.id) setOrder(null);
      await adopt(r.basket);
      if (r.question) say({ kind: "assistant", text: r.question });
    } catch (e) {
      say({ kind: "user", who: BUYER, text: t });
      if (isNotFound(e))
        say({
          kind: "assistant",
          text: "I can't change that yet. Use the steppers and swap buttons in the order, or start a new request.",
        });
      else fail(e, () => send(t), "edit");
    } finally {
      setBusy(false);
    }
  }

  async function placeOrder() {
    if (!basket) return;
    setError(null);
    setBusy(true);
    try {
      const r = await api.order(basket.id);
      if (r.status === 409) {
        const c = r.data as OrderConflict;
        if (c.error === "needs_your_ok") {
          setReviewing(false);
          say({
            kind: "assistant",
            text: "One thing still needs your answer before anything is sent.",
          });
        } else
          say({
            kind: "failed",
            text: c.changes?.length
              ? `Prices or stock changed since you looked: ${c.changes.map((x) => `${shortName(x.name)} ${x.was} → ${x.now}`).join("; ")}. Nothing was ordered.`
              : `Valio Aimo didn't take it: ${c.error}. Nothing was ordered.`,
          });
        await refreshAudit(basket.id);
        return;
      }
      setOrder(r.data as Order);
      await refreshAudit(basket.id);
    } catch (e) {
      fail(e, placeOrder, "edit");
    } finally {
      setBusy(false);
    }
  }

  async function refreshPrices() {
    if (!basket) return;
    const lines = basket.lines.filter((l) => l.qty > 0);
    try {
      const s = await api.stock(
        lines.map((l) => l.sku),
        basket.date,
      );
      const changed = s.lines.filter((x) => {
        const l = lines.find((y) => y.sku === x.sku);
        return l && Math.abs(l.stock.price - x.price) > 0.001;
      });
      setFreshAt(Date.now());
      say({
        kind: "assistant",
        text: changed.length
          ? `Re-checked ${s.lines.length} products: ${changed.length} prices changed. I'll use the new prices when you send.`
          : `Re-checked ${s.lines.length} products at ${timeLabel(s.checkedAt)}: no changes.`,
      });
    } catch (e) {
      fail(e, refreshPrices);
    }
  }

  function remind() {
    if (!order) return;
    try {
      localStorage.setItem(`remind:${order.id}`, new Date().toISOString());
    } catch {
      /* private mode: the line below still records it in this chat */
    }
    say({
      kind: "system",
      icon: "bell",
      text: `You reminded ${firstName(APPROVER)} · ${timeLabel(new Date().toISOString())}`,
    });
  }

  function reset() {
    abort.current?.abort();
    setBasket(null);
    setEvents([]);
    setOrder(null);
    setLocal([]);
    setError(null);
    setReviewing(false);
    setBuilding(null);
    setTab("assistant");
    setDraft("");
  }

  function noAttach() {
    say({
      kind: "assistant",
      text: "Photos and files aren't connected yet. Type the menu or the list and I'll build it.",
    });
  }

  function focusQuestion() {
    setTab("assistant");
    requestAnimationFrame(() => {
      const q = document.querySelector<HTMLElement>("[data-question] button");
      q?.scrollIntoView({ block: "center", behavior: "smooth" });
      q?.focus({ preventScroll: true });
    });
  }
  function prefill(text: string) {
    setDraft(text);
    setTab("assistant");
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  const phase: Phase = building
    ? "thinking"
    : !basket
      ? "empty"
      : order?.status === "placed"
        ? "placed"
        : order?.status === "pending_approval"
          ? "waiting"
          : reviewing && basket.openIssues === 0
            ? "review"
            : "draft";

  const thread = useMemo(
    () => (basket ? buildThread(events, basket) : []),
    [events, basket],
  );
  const stale =
    !!basket &&
    (phase === "draft" || phase === "review") &&
    now - Math.max(Date.parse(basket.checkedAt), freshAt ?? 0) > STALE_MS;
  const cartTotal = phase === "placed" ? 0 : basket ? basket.total : 0;
  const sheetLine = basket?.lines.find((l) => l.id === sheet) ?? null;
  const event = basket ? addDays(basket.date, 1) : addDays(DELIVERY, 1);

  return (
    <div className="app" data-tab={tab}>
      <Header
        cartTotal={cartTotal}
        date={basket?.date ?? DELIVERY}
        pickup={pickup}
        onPickup={setPickup}
        locked={phase === "waiting" || phase === "placed"}
      />
      <PhoneTabs
        tab={tab}
        onTab={setTab}
        total={basket ? basket.total : 0}
        hasBasket={!!basket}
      />
      <main className="workspace">
        <Chat
          phase={phase}
          basket={basket}
          thread={thread}
          local={local}
          order={order}
          building={building}
          error={error}
          stale={stale}
          busy={busy}
          draft={draft}
          composerRef={composerRef}
          onDraft={setDraft}
          onSend={send}
          onStop={stop}
          onNew={reset}
          onChoose={(lineId, sku) => edit(lineId, { chooseOption: sku })}
          onSeeAll={setSheet}
          onGuests={setGuests}
          onRefreshPrices={refreshPrices}
          onDismissError={() => setError(null)}
          onResend={() => setReviewing(true)}
          onRetryOrder={placeOrder}
          onLog={() => setLogOpen(true)}
          onAttach={noAttach}
          onHero={() => build(HERO)}
          onAgain={() =>
            basket && build(basket.request.replace(/on \w+day/i, "next week"))
          }
        />
        <OrderPanel
          phase={phase}
          basket={basket}
          order={order}
          event={event}
          busy={busy}
          busyLine={busyLine}
          pickup={pickup}
          onPickup={setPickup}
          onToggle={toggleLine}
          onQty={(lineId, qty) => edit(lineId, { qty })}
          onSwap={setSheet}
          onGuests={setGuests}
          onReview={() =>
            basket && basket.openIssues > 0
              ? focusQuestion()
              : setReviewing(true)
          }
          onOrder={placeOrder}
          onChoose={(lineId, sku) => edit(lineId, { chooseOption: sku })}
          onRemind={remind}
          onWithdraw={() =>
            say({
              kind: "assistant",
              text: `Withdrawing isn't connected to Valio Aimo yet. Ask ${firstName(APPROVER)} to send it back and you can edit everything; nothing is ordered until he approves.`,
            })
          }
          onView={() => setLogOpen(true)}
          onDone={reset}
          onPrefill={prefill}
          onHero={() => build(HERO)}
        />
      </main>
      {sheetLine && basket && (
        <SwapSheet
          line={sheetLine}
          date={basket.date}
          locked={phase === "waiting" || phase === "placed"}
          onClose={() => setSheet(null)}
          onChoose={(sku) => {
            setSheet(null);
            edit(sheetLine.id, { chooseOption: sku });
          }}
        />
      )}
      {logOpen && basket && (
        <LogSheet
          basket={basket}
          order={order}
          events={events}
          onClose={() => setLogOpen(false)}
        />
      )}
    </div>
  );
}
