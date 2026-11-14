import { purchasingIntent } from "../../server/src/intent";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  ApiError,
  APPROVER,
  BUYER,
  isNotFound,
  type AuditEvent,
  type Basket,
  type BasketLine,
  type RecipeProposal,
  type Order,
  type OrderConflict,
} from "./api";
import {
  suggestMenu,
  editMenuFromChat,
  fromServerItems,
  toServerItems,
  menuSummary,
  displayMenuRequest,
  plannerRequest,
  fallbackMatchesMenu,
  type MenuDraft,
} from "./menu";
import { MenuProposal } from "./components/MenuProposal";
import { EventRequirements } from "./components/EventRequirements";
import {
  DeliveryPicker,
  type DeliveryChoice,
} from "./components/DeliveryPicker";
import { detectRequirements, requestDeliveryDate } from "./requirements";
import { AlternativeDraftReview } from "./components/AlternativeDraftReview";
import { MenuEconomics } from "./components/MinunAimo";
import { SAMPLE_CONTEXT_MARKER } from "./minunAimo";
import { Header, PhoneTabs } from "./components/Header";
import {
  ScheduledMenus,
  ScheduleEditor,
  newSchedule,
} from "./components/ScheduledMenus";
import { SCHEDULE_KEY, readSchedules, type Schedule } from "./recurring";
import { Icon } from "./icons";
import { Chat, type LocalItem, type ChatError } from "./components/Chat";
import { OrderPanel } from "./components/OrderPanel";
import { SwapSheet, LogSheet } from "./components/Sheets";
import { MikkoView } from "./components/Mikko";
import { StatesView } from "./components/States";
import { addDays, lineIsOpen, niceName, timeLabel } from "./format";
import { buildThread, firstName, shortName } from "./thread";

// In-webshop assistant (owner: aleksei). Flow: request -> draft (answer questions in chat) -> review ->
// order (201 placed | 202 to Mikko) -> Mikko decides in ?view=mikko. All prices, stock and rules come from
// the gateway (CONTRACT.md v1.2); this file only holds UI state.
export const HERO =
  "Ingredients for a catering event for 50 people on Saturday: creamy salmon soup, rye bread, blueberry pie. 3 guests are lactose-free.";
const params = new URLSearchParams(location.search);
const DELIVERY = params.get("date") ?? "2026-11-20"; // Fri before the Saturday event
const STALE_MS = 20 * 60 * 1000;

type NewItem = LocalItem extends infer T
  ? T extends LocalItem
    ? Omit<T, "key" | "at">
    : never
  : never;
export type Phase =
  "empty" | "thinking" | "draft" | "review" | "waiting" | "placed";

export default function App() {
  if (params.get("view") === "mikko") return <MikkoView />;
  if (params.get("view") === "states") return <StatesView />;
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
  const [screen, setScreen] = useState<"shop" | "schedules">(
    params.get("view") === "schedules" ? "schedules" : "shop",
  );
  const [schedules, setSchedules] = useState(readSchedules);
  const [scheduleEditor, setScheduleEditor] = useState<Schedule | null>(null);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [scheduleNotice, setScheduleNotice] = useState("");
  const [scheduleLimit, setScheduleLimit] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuDraft | null>(null);
  const [delivery, setDelivery] = useState<DeliveryChoice | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [approvedSummary, setApprovedSummary] = useState<string | null>(null);
  const menuSubmitting = useRef(false);
  const menuCall = useRef<AbortController | null>(null);
  const [menuEditing, setMenuEditing] = useState(false);
  const [basket, setBasket] = useState<Basket | null>(null);
  const [alternativeDraft, setAlternativeDraft] =
    useState<RecipeProposal | null>(null);
  const [alternativeReviewOpen, setAlternativeReviewOpen] = useState(false);
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
  const [undoCount, setUndoCount] = useState(0);
  const lineEditInFlight = useRef(false);

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
    async (b: Basket, keepUndo = false) => {
      if (!keepUndo) {
        setUndoCount(0);
      }
      setAlternativeDraft(null);
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
        // Without ?o=, the newest order for this basket (orders are listed newest first).
        const ord = o
          ? await api.getOrder(o)
          : (await api.orders()).find((x) => x.basketId === bk.id);
        if (ord) {
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
          : `${(e as Error).message.replace(/\.+$/, "")}. Nothing is ordered.`,
      retry,
    });
  }, []);

  function propose(request: string) {
    if (building || menuSubmitting.current) return;
    setScheduleLimit(null);
    const known = detectRequirements(request);
    const chosenDelivery = delivery
      ? { ...delivery, date: requestDeliveryDate(request, delivery.date) }
      : null;
    if (chosenDelivery) setDelivery(chosenDelivery);
    const requirements =
      known.people !== null && known.dietary !== null && delivery
        ? { people: known.people, dietary: known.dietary, notes: "" }
        : undefined;
    // Instant offline draft (labelled planning) so event details can be confirmed while the gateway plans the real menu.
    setMenu({
      ...suggestMenu(request),
      requirements,
      delivery: chosenDelivery ?? undefined,
      planning: true,
    });
    setBasket(null);
    setOrder(null);
    setEvents([]);
    setLocal([]);
    setApprovedSummary(null);
    setError(null);
    setReviewing(false);
    setTab("assistant");
    setDraft("");
    say({ kind: "user", who: BUYER, text: request });
    menuCall.current?.abort();
    const ac = new AbortController();
    menuCall.current = ac;
    api
      .menu({ request }, ac.signal)
      .then((r) => {
        if (ac.signal.aborted) return;
        setMenu((current) =>
          current && current.request === request
            ? {
                ...current,
                categories: fromServerItems(r.items),
                planning: false,
              }
            : current,
        );
        say({ kind: "assistant", text: r.reply });
      })
      .catch((e) => {
        if (ac.signal.aborted || (e as Error).name === "AbortError") return;
        setMenu((current) =>
          current && current.request === request
            ? { ...current, planning: false }
            : current,
        );
      })
      .finally(() => {
        if (menuCall.current === ac) menuCall.current = null;
      });
  }
  async function editMenu(instruction: string) {
    if (!menu || menuEditing || menu.planning) return;
    const base = menu;
    say({ kind: "user", who: BUYER, text: instruction });
    setMenuEditing(true);
    try {
      const r = await api.menu({
        request: base.request,
        current: toServerItems(base),
        instruction,
      });
      setMenu((current) =>
        current && current.request === base.request
          ? { ...current, categories: fromServerItems(r.items) }
          : current,
      );
      say({ kind: "assistant", text: r.reply });
    } catch {
      const changed = editMenuFromChat(base, instruction);
      if (changed) {
        setMenu(changed);
        say({
          kind: "assistant",
          text: "Updated the menu. Review your selections, then find products when you are ready.",
        });
      } else
        say({
          kind: "assistant",
          text: "I couldn't reach the menu assistant. Edit the dishes in Review menu, or try add / remove.",
        });
    } finally {
      setMenuEditing(false);
    }
  }
  async function approveMenu() {
    if (
      !menu?.requirements ||
      !menu.delivery ||
      menu.planning ||
      menuEditing ||
      menuSubmitting.current ||
      !menu.categories.some((c) => c.selected) ||
      menu.categories.some((c) => c.selected && !c.title.trim())
    )
      return;
    menuSubmitting.current = true;
    setApprovedSummary(menuSummary(menu));
    try {
      await build(plannerRequest(menu), menu.requirements.people, menu);
    } finally {
      menuSubmitting.current = false;
    }
  }
  async function build(
    request: string,
    people?: number,
    approved?: MenuDraft,
    chosenDelivery?: DeliveryChoice,
  ) {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setError(null);
    setBuilding({
      since: Date.now(),
      request: approved ? menuSummary(approved) : request,
    });
    setOrder(null);
    setReviewing(false);
    setLocal([]);
    setTab("assistant");
    try {
      const b = await api.build(
        request,
        chosenDelivery?.date ??
          approved?.delivery?.date ??
          basket?.date ??
          delivery?.date ??
          DELIVERY,
        people,
        ac.signal,
        chosenDelivery ?? approved?.delivery ?? delivery ?? undefined,
      );
      if (
        approved &&
        b.planner === "fallback" &&
        !fallbackMatchesMenu(approved, b.dishes)
      )
        throw new Error(
          "The planner could not match your approved menu. Please retry; your selections are preserved and no order was created.",
        );
      await adopt(b);
      setMenu(null);
    } catch (e) {
      if (
        approved &&
        (e as Error).message.startsWith("The planner could not match")
      )
        setError({
          title: "Could not match your approved menu",
          text: (e as Error).message,
          retry: () => build(request, people, approved),
        });
      else fail(e, () => build(request, people, approved, chosenDelivery));
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
    e: { qty?: number; chooseOption?: string; included?: boolean },
  ) {
    if (!basket || busy || lineEditInFlight.current || building) return;
    lineEditInFlight.current = true;
    setError(null);
    setBusyLine(lineId);
    try {
      const next = await api.edit(basket.id, lineId, e);
      await adopt(next, true);
      setUndoCount((count) => Math.min(count + 1, 30));
    } catch (err) {
      fail(err, () => edit(lineId, e), "edit");
    } finally {
      lineEditInFlight.current = false;
      setBusyLine(null);
    }
  }

  async function undoCart() {
    if (
      !basket ||
      busy ||
      building ||
      lineEditInFlight.current ||
      !undoCount ||
      (order && order.status !== "rejected")
    )
      return;
    lineEditInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await api.undo(basket.id);
      await adopt(result.basket, true);
      setUndoCount((count) => (result.canUndo ? Math.max(0, count - 1) : 0));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setUndoCount(0);
      }
      fail(err, undoCart, "edit");
    } finally {
      lineEditInFlight.current = false;
      setBusy(false);
    }
  }

  // "Don't order them" on the grouped no-substitute card: one remove per line, in order.
  async function removeMany(ids: string[]) {
    if (!basket || busy || lineEditInFlight.current) return;
    lineEditInFlight.current = true;
    setError(null);
    setBusy(true);
    let b = basket;
    try {
      for (const id of ids) {
        b = await api.edit(b.id, id, { chooseOption: "remove" });
        await adopt(b, true);
        setUndoCount((count) => Math.min(count + 1, 30));
      }
    } catch (err) {
      fail(err, () => removeMany(ids), "edit");
    } finally {
      lineEditInFlight.current = false;
      setBusy(false);
    }
  }
  async function switchResend(lineId: string, sku: string) {
    await edit(lineId, { chooseOption: sku });
    setReviewing(true);
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
    if (l.issue?.decided === "remove") {
      if (l.issue.options[0])
        return edit(lineId, { chooseOption: l.issue.options[0].sku });
      if (l.issue.kind === "short")
        return edit(lineId, { chooseOption: "keep" });
      return setSheet(lineId); // cut-off passed / no delivery and no alternative: "keep" is impossible, show why
    }
    return edit(lineId, { included: l.qty === 0 });
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
    if (building || menuSubmitting.current) return;
    if (!basket && menu) {
      if (menu.planning || menuEditing) {
        setDraft(t);
        return;
      }
      return void editMenu(t);
    }
    if (!basket) {
      if (purchasingIntent(t) === "DIRECT_PURCHASE") {
        const requestedDate = requestDeliveryDate(t, delivery?.date ?? DELIVERY);
        return build(t, undefined, undefined, requestedDate ? { ...(delivery ?? {}), date:requestedDate } as DeliveryChoice : delivery ?? undefined);
      }
      return propose(t);
    }
    if (order?.status === "pending_approval") {
      say({ kind: "user", who: BUYER, text: t });
      say({
        kind: "assistant",
        text: `It's with ${firstName(APPROVER)} now, and withdrawing isn't connected to Valio Aimo yet. Ask him to send it back and you can change anything.`,
      });
      return;
    }
    const pendingKey = "pending-chat-" + crypto.randomUUID();
    setLocal((items) => [
      ...items,
      {
        kind: "user",
        key: pendingKey,
        at: new Date().toISOString(),
        who: BUYER,
        text: t,
      },
    ]);
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
          text: "I can't change that yet. Use the steppers and swap buttons in the order, or start a new order.",
        });
      else fail(e, () => send(t), "edit");
    } finally {
      setLocal((items) => items.filter((item) => item.key !== pendingKey));
      setBusy(false);
    }
  }

  async function suggestRecipe(line: BasketLine) {
    if (!basket || busy || building) return;
    setBusy(true);
    setError(null);
    setAlternativeDraft(null);
    try {
      const proposal = await api.recipeChange(basket.id, line.id);
      setAlternativeDraft(proposal);
      setAlternativeReviewOpen(true);
    } catch (e) {
      say({
        kind: "assistant",
        text: `Unfortunately, ${niceName(line.name)} is unavailable. ${(e as Error).message} Your menu has not been changed.`,
      });
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
    setScheduleLimit(null);
    setMenu(null);
    setApprovedSummary(null);
    menuSubmitting.current = false;
    setBasket(null);
    setAlternativeDraft(null);
    setBusy(false);
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
    const missing = basket?.lines.find(lineIsOpen);
    if (missing) setSheet(missing.id);
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.shiftKey ||
        event.altKey ||
        event.key.toLowerCase() !== "z" ||
        event.defaultPrevented
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog[open], [role="dialog"]',
        )
      )
        return;
      if (
        screen !== "shop" ||
        !basket ||
        !undoCount ||
        busy ||
        busyLine ||
        building ||
        phase === "waiting" ||
        phase === "placed"
      )
        return;
      event.preventDefault();
      void undoCart();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const thread = useMemo(
    () =>
      basket
        ? buildThread(events, basket).map((it) =>
            it.kind === "user" && it.text.includes("APPROVED MENU ONLY:")
              ? { ...it, text: approvedSummary ?? displayMenuRequest(it.text) }
              : it,
          )
        : [],
    [events, basket, approvedSummary],
  );
  const stale =
    !!basket &&
    (phase === "draft" || phase === "review") &&
    now - Math.max(Date.parse(basket.checkedAt), freshAt ?? 0) > STALE_MS;
  const cartTotal = phase === "placed" ? 0 : basket ? basket.total : 0;
  const sheetLine = basket?.lines.find((l) => l.id === sheet) ?? null;
  const event = basket ? addDays(basket.date, 1) : addDays(DELIVERY, 1);

  function navigate(next: "shop" | "schedules") {
    setScreen(next);
    const url = new URL(location.href);
    if (next === "schedules") url.searchParams.set("view", "schedules");
    else url.searchParams.delete("view");
    history.replaceState(null, "", url);
  }
  function saveSchedules(next: Schedule[]) {
    try {
      localStorage.setItem(SCHEDULE_KEY, JSON.stringify(next));
      setSchedules(next);
      return true;
    } catch {
      setScheduleNotice(
        "Could not save on this device. Check browser storage settings and try again.",
      );
      return false;
    }
  }
  function saveSchedule(s: Schedule) {
    const saved = saveSchedules(
      schedules.some((v) => v.id === s.id)
        ? schedules.map((v) => (v.id === s.id ? s : v))
        : [...schedules, s],
    );
    if (saved) setScheduleNotice(`“${s.name}” saved on this device.`);
    return saved;
  }
  function repeatOrder() {
    const dishes =
      menu?.categories.filter((c) => c.selected).map((c) => c.title) ??
      basket?.dishes.map((d) => d.name) ??
      [];
    setScheduleEditor(
      newSchedule(
        {
          name: dishes.join(", "),
          dishes,
          people: menu?.requirements?.people ?? basket?.people ?? 50,
          dietary:
            menu?.requirements?.dietary.join(", ") ??
            [...new Set(basket?.dishes.flatMap((d) => d.diet) ?? [])].join(
              ", ",
            ),
          estimate: basket?.total ?? null,
          delivery: menu?.delivery ?? delivery ?? undefined,
        },
        delivery,
      ),
    );
    setScheduleNotice("");
    setRepeatOpen(true);
  }
  function prepareSchedule(s: Schedule, date: string) {
    const choice = { ...s.delivery, date };
    const request = `Ingredients for ${s.people} people: ${s.dishes.join(", ")}. Dietary needs and allergies: ${s.dietary || "Confirm before preparing products"}. Review threshold: EUR ${s.limit} per delivery. Require human review before ordering.`;
    reset();
    setDelivery(choice);
    setScheduleLimit(s.limit);
    setMenu({
      request,
      categories: s.dishes.map((title, i) => ({
        id: `scheduled-${i}`,
        title,
        description: "",
        selected: true,
      })),
      delivery: choice,
    });
    say({ kind: "user", who: BUYER, text: request });
    navigate("shop");
  }

  return (
    <div className="app" data-tab={tab}>
      <Header
        delivery={delivery}
        onDelivery={() => setDeliveryOpen(true)}
        cartTotal={cartTotal}
        date={basket?.date ?? delivery?.date ?? DELIVERY}
        orderBy={basket?.pricesHeldUntil ?? null}
        pickup={pickup}
        onPickup={setPickup}
        locked={phase === "waiting" || phase === "placed" || !!building || busy}
      />
      <nav className="shop-nav" aria-label="Shop sections">
        <button
          aria-current={screen === "shop" ? "page" : undefined}
          onClick={() => navigate("shop")}
        >
          <Icon name="shopping-basket" className="i-16" />
          Shopping assistant
        </button>
        <button
          aria-current={screen === "schedules" ? "page" : undefined}
          onClick={() => navigate("schedules")}
        >
          <Icon name="repeat" className="i-16" />
          Scheduled menus
        </button>
      </nav>
      {screen === "schedules" ? (
        <ScheduledMenus
          schedules={schedules}
          editor={scheduleEditor}
          onEdit={(s) => {
            setScheduleEditor(s);
            setScheduleNotice("");
          }}
          onSave={saveSchedule}
          onDelete={(id) => {
            if (saveSchedules(schedules.filter((s) => s.id !== id))) {
              setScheduleEditor(null);
              setScheduleNotice("Schedule deleted from this device.");
            }
          }}
          onPrepare={prepareSchedule}
          onBack={() => navigate("shop")}
          delivery={delivery}
          notice={scheduleNotice}
        />
      ) : (
        <>
          <PhoneTabs
            tab={tab}
            onTab={setTab}
            total={basket ? basket.total : 0}
            hasBasket={!!basket}
          />
          <main className="workspace">
            <Chat
              alternativeProposal={
                alternativeDraft ? (
                  <section
                    className="replacement-notice"
                    aria-label="Recipe suggestion"
                  >
                    <p>
                      Try {alternativeDraft.to} instead of{" "}
                      {alternativeDraft.from}?
                    </p>
                    <button
                      className="replacement-notice__review"
                      disabled={busy}
                      onClick={() => setAlternativeReviewOpen(true)}
                    >
                      Review recipe change
                    </button>
                    <button
                      className="schedule-text"
                      onClick={() => {
                        setAlternativeDraft(null);
                        say({
                          kind: "assistant",
                          text: "Unfortunately, the item is unavailable. Your menu has not been changed.",
                        });
                      }}
                    >
                      No thanks
                    </button>
                  </section>
                ) : null
              }
              phase={phase}
              menuProposal={
                menu && !building ? (
                  !menu.requirements ? (
                    <EventRequirements
                      key={menu.request}
                      initial={detectRequirements(menu.request)}
                      delivery={delivery}
                      defaultDate={requestDeliveryDate(menu.request, DELIVERY)}
                      onConfirm={(requirements, choice) => {
                        setDelivery(choice);
                        setMenu((current) =>
                          current
                            ? { ...current, requirements, delivery: choice }
                            : current,
                        );
                      }}
                    />
                  ) : (
                    <MenuProposal
                      compact
                      menu={menu}
                      busy={
                        busy || !!building || menuEditing || !!menu.planning
                      }
                      onChange={setMenu}
                      onApprove={approveMenu}
                      onInstruction={(text) => void editMenu(text)}
                    />
                  )
                ) : null
              }
              menuReviewTitle={
                menu && !menu.requirements
                  ? "A few event details"
                  : "Review your menu"
              }
              planningMenu={!!menu}
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
              onRemoveMany={removeMany}
              onSwitchResend={switchResend}
              onRetryOrder={placeOrder}
              onLog={() => setLogOpen(true)}
              onAttach={noAttach}
              onHero={() => propose(HERO)}
              onAgain={() =>
                basket &&
                propose(
                  (approvedSummary ?? displayMenuRequest(basket.request))
                    .split("\nApproved menu:")[0]
                    .replace(/on \w+day/i, "next week"),
                )
              }
            />
            <OrderPanel
              canUndo={undoCount > 0}
              onUndo={() => void undoCart()}
              onRepeat={repeatOrder}
              deliveryTime={delivery?.time}
              insight={
                <>
                  {basket?.request.includes(SAMPLE_CONTEXT_MARKER) && (
                    <MenuEconomics basket={basket} onReview={setSheet} />
                  )}
                  {basket &&
                    scheduleLimit !== null &&
                    basket.total > scheduleLimit && (
                      <p className="schedule-notice" role="status">
                        This draft exceeds your saved review threshold of €
                        {scheduleLimit.toFixed(2)}. Review the total before
                        ordering.
                      </p>
                    )}
                </>
              }
              phase={phase}
              planningMenu={!!menu}
              basket={basket}
              order={order}
              event={event}
              busy={busy || !!busyLine}
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
              onHero={() => propose(HERO)}
            />
          </main>
        </>
      )}
      {repeatOpen && scheduleEditor && (
        <ScheduleEditor
          initial={scheduleEditor}
          existing={false}
          onSave={saveSchedule}
          onCancel={() => {
            setRepeatOpen(false);
            setScheduleEditor(null);
          }}
          onDelete={() => {}}
          notice={scheduleNotice}
        />
      )}
      {deliveryOpen && (
        <DeliveryPicker
          value={delivery}
          defaultDate={
            menu
              ? requestDeliveryDate(menu.request, DELIVERY)
              : (basket?.date ?? DELIVERY)
          }
          onClose={() => setDeliveryOpen(false)}
          onConfirm={(choice) => {
            setDelivery(choice);
            setMenu((current) =>
              current ? { ...current, delivery: choice } : current,
            );
            if (
              basket &&
              (choice.date !== basket.date ||
                choice.placeId !== delivery?.placeId ||
                choice.time !== delivery?.time)
            ) {
              void build(
                basket.request +
                  `\nConfirmed delivery update: ${choice.address}; ${choice.date}, ${choice.time}. Recheck the complete draft for this delivery.`,
                basket.people,
                undefined,
                choice,
              );
            }
          }}
        />
      )}
      {alternativeReviewOpen && alternativeDraft && (
        <AlternativeDraftReview
          proposal={alternativeDraft}
          busy={busy}
          onClose={() => {
            setAlternativeReviewOpen(false);
            setAlternativeDraft(null);
            say({
              kind: "assistant",
              text: "Unfortunately, the item is unavailable. Your menu has not been changed.",
            });
          }}
          onUse={async () => {
            if (!basket) return;
            setBusy(true);
            try {
              const next = await api.applyRecipeChange(
                basket.id,
                alternativeDraft.id,
              );
              setAlternativeReviewOpen(false);
              setOrder(null);
              setReviewing(false);
              await adopt(next);
            } catch (e) {
              setAlternativeReviewOpen(false);
              setAlternativeDraft(null);
              say({
                kind: "assistant",
                text: `Could not apply the recipe change: ${(e as Error).message}`,
              });
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {sheetLine && basket && (
        <SwapSheet
          time={delivery?.time}
          onCheck={async () => {
            const next = await api.checkReplacements(basket.id, sheetLine.id);
            await adopt(next);
          }}
          onSuggestMenuChange={
            sheetLine.dishId || sheetLine.usedIn?.length
              ? () => void suggestRecipe(sheetLine)
              : undefined
          }
          onUnavailable={() =>
            say({
              kind: "assistant",
              text: `Unfortunately, ${niceName(sheetLine.name)} is unavailable for this delivery.`,
            })
          }
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
