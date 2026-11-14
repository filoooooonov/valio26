import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  type AuditEvent,
  type Basket,
  type Mandate,
  type Order,
} from "./api";
import { Header } from "./components/Header";
import { RequestBox } from "./components/RequestBox";
import { Loading } from "./components/Loading";
import { Cart, StatusLine } from "./components/Cart";
import { Rules, Summary } from "./components/Summary";
import { Placed } from "./components/Placed";
import { dayLabel } from "./format";

// In-webshop order builder (owner: aleksei). Flow: request -> basket -> decide swaps -> order / approval -> trail.
// All prices, stock and rules come from the gateway (CONTRACT.md v1.1); this file only holds UI state.
const HERO =
  "Ingredients for a catering event for 50 people on Saturday: creamy salmon soup, rye bread with butter and cheese, and blueberry pie with vanilla sauce. Everything lactose-free.";
const CUSTOMER = "123";
const params = new URLSearchParams(location.search);
const DELIVERY = params.get("date") ?? "2026-11-20"; // Fri before the Saturday event

export default function App() {
  const [request, setRequest] = useState(params.get("q") ?? HERO);
  const [rules, setRules] = useState<Mandate | null>(null);
  const [basket, setBasket] = useState<Basket | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Order | null>(null);
  const [done, setDone] = useState<{
    order: Order;
    audit: AuditEvent[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .mandate(CUSTOMER)
      .then(setRules)
      .catch(() =>
        setError("Can't reach the Valio Aimo gateway (/api). Is it running?"),
      );
  }, []);

  const fail = (e: unknown) =>
    setError(
      e instanceof ApiError
        ? e.message
        : `Gateway error: ${String((e as Error).message ?? e)}`,
    );

  async function build() {
    setError(null);
    setLoading(true);
    setPending(null);
    setDone(null);
    try {
      setBasket(await api.build(request, DELIVERY));
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }
  async function edit(
    lineId: string,
    e: { qty?: number; chooseOption?: string },
  ) {
    if (!basket) return;
    setError(null);
    setBusyLine(lineId);
    try {
      setBasket(await api.edit(basket.id, lineId, e));
    } catch (err) {
      fail(err);
    } finally {
      setBusyLine(null);
    }
  }
  // The buyer accepting every suggestion in one click is still the buyer's OK (by: Anna K.).
  async function acceptAll() {
    if (!basket) return;
    setError(null);
    let b = basket;
    try {
      for (const l of basket.lines) {
        if (!l.issue || l.issue.decided || !l.issue.options.length) continue;
        setBusyLine(l.id);
        b = await api.edit(b.id, l.id, { chooseOption: l.issue.options[0].sku });
        setBasket(b);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusyLine(null);
    }
  }
  async function order() {
    if (!basket) return;
    setError(null);
    setBusy(true);
    try {
      const r = await api.order(basket.id);
      if (r.status === 409) {
        setError(
          (r.data as { error: string }).error === "needs_your_ok"
            ? "Decide the open lines first."
            : (r.data as { error: string }).error,
        );
        return;
      }
      const o = r.data as Order;
      if (o.status === "pending_approval") setPending(o);
      else setDone({ order: o, audit: await api.audit(o.id) });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function decide(d: "approve" | "reject", note: string) {
    if (!pending) return;
    setError(null);
    setBusy(true);
    try {
      const o = await api.decide(pending.id, d, note);
      setPending(null);
      setDone({ order: o, audit: await api.audit(o.id) });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    setBasket(null);
    setDone(null);
    setPending(null);
    setError(null);
  }

  const cartTotal = done
    ? 0
    : basket
      ? basket.openIssues
        ? basket.totalIfAccepted
        : basket.total
      : 0;
  const reviewing = basket && basket.openIssues === 0 && !pending;
  return (
    <>
      <Header cartTotal={done?.order.status === "placed" ? 0 : cartTotal} />
      <main className="page">
        {error && (
          <p className="error" role="alert">
            {error}{" "}
            <button className="linkbtn" onClick={() => setError(null)}>
              Dismiss
            </button>
          </p>
        )}
        {done && basket ? (
          <Placed
            order={done.order}
            basket={basket}
            audit={done.audit}
            onNew={reset}
          />
        ) : (
          <div className="layout">
            <div className="col">
              <div className="titlerow">
                <h1 className="title">
                  {pending
                    ? "Sent for approval"
                    : reviewing
                      ? "Review and confirm"
                      : "Cart"}
                </h1>
                <span className="muted">
                  {basket
                    ? `${basket.lines.filter((l) => l.qty > 0).length} products · ${basket.dishes.length} dishes · delivery ${dayLabel(basket.date)}, ${basket.people} guests`
                    : `Delivery ${dayLabel(DELIVERY)} · your prices and live stock`}
                </span>
              </div>
              <RequestBox
                value={request}
                onChange={setRequest}
                onSubmit={build}
                busy={loading}
                hasCart={!!basket}
              />
              {loading ? (
                <Loading />
              ) : basket ? (
                <>
                  <StatusLine basket={basket} />
                  <Cart basket={basket} onEdit={edit}
                    onAcceptAll={acceptAll} busyLine={busyLine} />
                </>
              ) : (
                <div className="empty">
                  <p>
                    <b>Tell the assistant what you're cooking.</b> It turns the
                    request into dishes and amounts per guest, finds the
                    products, and checks your prices and stock for that day,
                    only for the products it picked.
                  </p>
                  <p className="muted">
                    Anything it can't deliver comes back to you to decide.
                    Orders over your limit go to{" "}
                    {rules?.approver ?? "your manager"}
                  </p>
                </div>
              )}
            </div>
            <div className="col col--side">
              <Summary
                basket={loading ? null : basket}
                pending={pending}
                busy={busy}
                onOrder={order}
                onDecide={decide}
              />
              <Rules rules={basket?.rules ?? rules} />
            </div>
          </div>
        )}
      </main>
    </>
  );
}
