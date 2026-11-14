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
  type Order,
  type OrderConflict,
} from "./api";
import { suggestMenu, editMenuFromChat, menuSummary, displayMenuRequest, plannerRequest, fallbackMatchesMenu, type MenuDraft } from "./menu";
import { MenuProposal } from "./components/MenuProposal";
import { EventRequirements } from './components/EventRequirements';
import { DeliveryPicker, type DeliveryChoice } from './components/DeliveryPicker';
import { detectRequirements, requestDeliveryDate } from './requirements';
import { AlternativeDraftReview } from "./components/AlternativeDraftReview";
import { MenuEconomics } from "./components/MinunAimo";
import { SAMPLE_CONTEXT_MARKER } from "./minunAimo";
import { Header, PhoneTabs } from "./components/Header";
import { ScheduledMenus, newSchedule } from './components/ScheduledMenus';
import { SCHEDULE_KEY, readSchedules, type Schedule } from './recurring';
import { Icon } from './icons';
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

type NewItem = LocalItem extends infer T ? (T extends LocalItem ? Omit<T, "key" | "at"> : never) : never;
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
  const [screen, setScreen] = useState<'shop' | 'schedules'>(params.get('view') === 'schedules' ? 'schedules' : 'shop');
  const [schedules, setSchedules] = useState(readSchedules);
  const [scheduleEditor, setScheduleEditor] = useState<Schedule | null>(null);
  const [scheduleNotice, setScheduleNotice] = useState('');
  const [scheduleLimit, setScheduleLimit] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuDraft | null>(null);
  const [delivery, setDelivery] = useState<DeliveryChoice | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [approvedSummary, setApprovedSummary] = useState<string | null>(null);
  const menuSubmitting = useRef(false);
  const [basket, setBasket] = useState<Basket | null>(null);
  const [alternativeDraft, setAlternativeDraft] = useState<Basket | null>(null);
  const [alternativeReviewOpen, setAlternativeReviewOpen] = useState(false);
  const [replacementRecovery, setReplacementRecovery] = useState<BasketLine[]>([]);
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
      setAlternativeDraft(null); setReplacementRecovery([]);
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
        const ord = o ? await api.getOrder(o) : (await api.orders()).find((x) => x.basketId === bk.id);
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
          : `${(e as Error).message}. Nothing is ordered.`,
      retry,
    });
  }, []);

  function propose(request: string) {
    if (building || menuSubmitting.current) return;
    setScheduleLimit(null);
    const known = detectRequirements(request);
    const chosenDelivery = delivery ? { ...delivery, date: requestDeliveryDate(request, delivery.date) } : null;
    if (chosenDelivery) setDelivery(chosenDelivery);
    const requirements = known.people !== null && known.dietary !== null && delivery ? { people: known.people, dietary: known.dietary, notes: '' } : undefined;
    setMenu({ ...suggestMenu(request), requirements, delivery: chosenDelivery ?? undefined }); setBasket(null); setOrder(null); setEvents([]); setLocal([]); setApprovedSummary(null); setError(null); setReviewing(false); setTab("assistant"); setDraft("");
    say({ kind: "user", who: BUYER, text: request });
  }
  async function approveMenu() {
    if (!menu?.requirements || !menu.delivery || menuSubmitting.current || !menu.categories.some(c => c.selected) || menu.categories.some(c => c.selected && !c.title.trim())) return;
    menuSubmitting.current = true;
    setApprovedSummary(menuSummary(menu));
    try { await build(plannerRequest(menu), menu.requirements.people, menu); } finally { menuSubmitting.current = false; }
  }
  async function build(request: string, people?: number, approved?: MenuDraft, chosenDelivery?: DeliveryChoice) {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setError(null);
    setBuilding({ since: Date.now(), request: approved ? menuSummary(approved) : request });
    setOrder(null);
    setReviewing(false);
    setLocal([]);
    setTab("assistant");
    try {
      const b = await api.build(
        request,
        chosenDelivery?.date ?? approved?.delivery?.date ?? basket?.date ?? delivery?.date ?? DELIVERY,
        people,
        ac.signal,
      );
      if (approved && b.planner === "fallback" && !fallbackMatchesMenu(approved, b.dishes)) throw new Error("The planner could not match your approved menu. Please retry; your selections are preserved and no order was created.");
      await adopt(b);
      setMenu(null);
    } catch (e) {
      if (approved && (e as Error).message.startsWith("The planner could not match")) setError({ title: "Could not match your approved menu", text: (e as Error).message, retry: () => build(request, people, approved) });
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

  // "Don't order them" on the grouped no-substitute card: one remove per line, in order.
  async function removeMany(ids: string[]) {
    if (!basket) return;
    setError(null);
    setBusy(true);
    let b = basket;
    try {
      for (const id of ids) b = await api.edit(b.id, id, { chooseOption: "remove" });
      await adopt(b);
    } catch (err) {
      fail(err, () => removeMany(ids), "edit");
    } finally {
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
    if (building || menuSubmitting.current) return;
    if (!basket && menu) {
      const changed = editMenuFromChat(menu, t);
      say({ kind: "user", who: BUYER, text: t });
      if (changed) { setMenu(changed); say({ kind: "assistant", text: "Updated the menu. Review your selections, then find products when you are ready." }); }
      else say({ kind: "assistant", text: "Open Review menu to edit, or say add fruit / remove soft drinks. Then choose Find products for this menu." });
      return;
    }
    if (!basket) return propose(t);
    if (order?.status === "pending_approval") {
      say({ kind: "user", who: BUYER, text: t });
      say({
        kind: "assistant",
        text: `It's with ${firstName(APPROVER)} now, and withdrawing isn't connected to Valio Aimo yet. Ask him to send it back and you can change anything.`,
      });
      return;
    }
    const pendingKey = 'pending-chat-' + crypto.randomUUID();
    setLocal(items => [...items, { kind: 'user', key: pendingKey, at: new Date().toISOString(), who: BUYER, text: t }]);
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
      setLocal(items => items.filter(item => item.key !== pendingKey));
      setBusy(false);
    }
  }

  async function findAlternatives(lines: BasketLine[], changeMenu = false) {
    if (!basket || busy || building || !lines.length) return;
    const source = basket;
    const names = lines.map(line => niceName(line.name)).join(', ');
    const ac = new AbortController();
    abort.current?.abort(); abort.current = ac;
    setError(null); setAlternativeDraft(null); setAlternativeReviewOpen(false); setReplacementRecovery([]); setBusy(true);
    say({ kind: 'user', who: BUYER, text: changeMenu ? `Suggest a menu change for ${names}.` : `Find alternatives for ${names}.` });
    try {
      const request = source.request + (changeMenu ? `\n\nThese ingredients cannot be delivered: ${names}. Suggest a suitable alternative ingredient or replace only the affected dish with a complete deliverable dish. Keep the guest count, dietary and allergy requirements, and all unaffected dishes. Explain the proposed menu change in the draft notes. Never silently omit a dish. Return a full revised purchasing draft for the buyer to review before applying it.` : `\n\nFind alternative catalogue products for these unavailable ingredients: ${names}. Keep the approved menu, guest count, diets and all other requested dishes. Look for equivalent ingredients in a different brand or suitable pack size. Do not drop requested ingredients or change the menu to hide an unavailable product. Return a full revised purchasing draft; prices and delivery will be checked by the gateway.`);
      const next = await api.build(request, source.date, source.people, ac.signal);
      if (ac.signal.aborted) return;
      if (next.planner === 'fallback' && source.planner === 'llm') throw new Error('The alternative planner is unavailable.');
      const newProducts = next.lines.filter(line => !source.lines.some(old => old.sku === line.sku));
      if ((!newProducts.length && next.openIssues >= source.openIssues) || next.notes.some(note => /no catalogue match/i.test(note))) {
        setReplacementRecovery(lines);
        say({ kind: 'assistant', text: changeMenu ? `I could not find a complete deliverable menu change for ${names}. Try a different dish in chat. Your current basket is unchanged.` : `No deliverable replacement found for ${names}. I can suggest a menu change instead. Your current basket is unchanged.` });
      } else {
        setAlternativeDraft(next); setAlternativeReviewOpen(true);
        say({ kind: 'assistant', text: `I prepared an alternative draft for ${names}. Click Review revised draft to open it.` });
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setError({ title: 'Could not find alternatives', text: `${(error as Error).message} Your current basket is unchanged.`, retry: () => findAlternatives(lines, changeMenu) });
    } finally { if (abort.current === ac) setBusy(false); }
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

  const thread = useMemo(
    () => (basket ? buildThread(events, basket).map(it => it.kind === "user" && it.text.includes("APPROVED MENU ONLY:") ? { ...it, text: approvedSummary ?? displayMenuRequest(it.text) } : it) : []),
    [events, basket, approvedSummary],
  );
  const stale =
    !!basket &&
    (phase === "draft" || phase === "review") &&
    now - Math.max(Date.parse(basket.checkedAt), freshAt ?? 0) > STALE_MS;
  const cartTotal = phase === "placed" ? 0 : basket ? basket.total : 0;
  const sheetLine = basket?.lines.find((l) => l.id === sheet) ?? null;
  const event = basket ? addDays(basket.date, 1) : addDays(DELIVERY, 1);

  function navigate(next: 'shop' | 'schedules') {
    setScreen(next);
    const url = new URL(location.href);
    if (next === 'schedules') url.searchParams.set('view', 'schedules'); else url.searchParams.delete('view');
    history.replaceState(null, '', url);
  }
  function saveSchedules(next: Schedule[]) {
    try { localStorage.setItem(SCHEDULE_KEY, JSON.stringify(next)); setSchedules(next); return true; }
    catch { setScheduleNotice('Could not save on this device. Check browser storage settings and try again.'); return false; }
  }
  function saveSchedule(s: Schedule) {
    const saved = saveSchedules(schedules.some(v => v.id === s.id) ? schedules.map(v => v.id === s.id ? s : v) : [...schedules, s]);
    if (saved) setScheduleNotice(`“${s.name}” saved on this device.`);
    return saved;
  }
  function repeatOrder() {
    const dishes = menu?.categories.filter(c => c.selected).map(c => c.title) ?? basket?.dishes.map(d => d.name) ?? [];
    setScheduleEditor(newSchedule({ name: dishes.join(', '), dishes, people: menu?.requirements?.people ?? basket?.people ?? 50, dietary: menu?.requirements?.dietary.join(', ') ?? [...new Set(basket?.dishes.flatMap(d => d.diet) ?? [])].join(', '), estimate: basket?.total ?? null, delivery: menu?.delivery ?? delivery ?? undefined }, delivery));
    setScheduleNotice(''); navigate('schedules');
  }
  function prepareSchedule(s: Schedule, date: string) {
    const choice = { ...s.delivery, date };
    const request = `Ingredients for ${s.people} people: ${s.dishes.join(', ')}. Dietary needs and allergies: ${s.dietary || 'Confirm before preparing products'}. Review threshold: EUR ${s.limit} per delivery. Require human review before ordering.`;
    reset(); setDelivery(choice); setScheduleLimit(s.limit);
    setMenu({ request, categories: s.dishes.map((title,i) => ({ id: `scheduled-${i}`, title, description: '', selected: true })), delivery: choice });
    say({ kind: 'user', who: BUYER, text: request });
    navigate('shop');
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
        <button aria-current={screen === 'shop' ? 'page' : undefined} onClick={() => navigate('shop')}><Icon name="shopping-basket" className="i-16" />Shopping assistant</button>
        <button aria-current={screen === 'schedules' ? 'page' : undefined} onClick={() => navigate('schedules')}><Icon name="repeat" className="i-16" />Scheduled menus</button>
      </nav>
      {screen === 'schedules' ? <ScheduledMenus schedules={schedules} editor={scheduleEditor} onEdit={s => { setScheduleEditor(s); setScheduleNotice(''); }} onSave={saveSchedule} onDelete={id => { if (saveSchedules(schedules.filter(s => s.id !== id))) { setScheduleEditor(null); setScheduleNotice('Schedule deleted from this device.'); } }} onPrepare={prepareSchedule} onBack={() => navigate('shop')} delivery={delivery} notice={scheduleNotice} /> : <>
      <PhoneTabs
        tab={tab}
        onTab={setTab}
        total={basket ? basket.total : 0}
        hasBasket={!!basket}
      />
      <main className="workspace">
        <Chat
          onFindAlternatives={findAlternatives}
          alternativeProposal={alternativeDraft ? <section className="replacement-notice" aria-label="Alternative draft ready"><p>A revised draft is ready to review.</p><button className="replacement-notice__review" disabled={busy} onClick={() => setAlternativeReviewOpen(true)}>Review revised draft</button></section> : replacementRecovery.length > 0 ? <section className="replacement-notice" aria-label="Replacement suggestions"><p>Try another product or a different dish.</p><div className="replacement-dialog__recovery"><button className="btn btn--outline" disabled={busy} onClick={() => void findAlternatives(replacementRecovery)}>Find another product</button><button className="btn btn--outline" disabled={busy} onClick={() => void findAlternatives(replacementRecovery, true)}>Suggest a menu change</button></div></section> : null}
          phase={phase}
          menuProposal={menu && !building ? !menu.requirements ? <EventRequirements key={menu.request} initial={detectRequirements(menu.request)} delivery={delivery} defaultDate={requestDeliveryDate(menu.request, DELIVERY)} onConfirm={(requirements, choice) => {
            setDelivery(choice);
            setMenu(current => current ? { ...current, requirements, delivery: choice } : current);
          }} /> : <MenuProposal compact menu={menu} busy={busy || !!building} onChange={setMenu} onApprove={approveMenu} /> : null}
          menuReviewTitle={menu && !menu.requirements ? 'A few event details' : 'Review your menu'}
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
            basket && propose(((approvedSummary ?? displayMenuRequest(basket.request)).split("\nApproved menu:")[0]).replace(/on \w+day/i, "next week"))
          }
        />
        <OrderPanel
          onRepeat={repeatOrder}
          deliveryTime={delivery?.time}
          insight={<>{basket?.request.includes(SAMPLE_CONTEXT_MARKER) && <MenuEconomics basket={basket} onReview={setSheet} />}{basket && scheduleLimit !== null && basket.total > scheduleLimit && <p className="schedule-notice" role="status">This draft exceeds your saved review threshold of €{scheduleLimit.toFixed(2)}. Review the total before ordering.</p>}</>}
          phase={phase}
          planningMenu={!!menu}
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
          onHero={() => propose(HERO)}
        />
      </main>
      </>}
      {deliveryOpen && <DeliveryPicker value={delivery} defaultDate={menu ? requestDeliveryDate(menu.request, DELIVERY) : basket?.date ?? DELIVERY} onClose={() => setDeliveryOpen(false)} onConfirm={choice => {
        setDelivery(choice);
        setMenu(current => current ? { ...current, delivery: choice } : current);
        if (basket && (choice.date !== basket.date || choice.placeId !== delivery?.placeId || choice.time !== delivery?.time)) {
          void build(basket.request + `\nConfirmed delivery update: ${choice.address}; ${choice.date}, ${choice.time}. Recheck the complete draft for this delivery.`, basket.people, undefined, choice);
        }
      }} />}
      {alternativeReviewOpen && alternativeDraft && <AlternativeDraftReview basket={alternativeDraft} busy={busy} onClose={() => setAlternativeReviewOpen(false)} onUse={async () => {
        const next = alternativeDraft; setAlternativeReviewOpen(false); setOrder(null); setReviewing(false); await adopt(next);
      }} />}
      {sheetLine && basket && (
        <SwapSheet
          time={delivery?.time}
          onFindAlternatives={() => { if (sheetLine) void findAlternatives([sheetLine]); }}
          onSuggestMenuChange={() => { if (sheetLine) void findAlternatives([sheetLine], true); }}
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
