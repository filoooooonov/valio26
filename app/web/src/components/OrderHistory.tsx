import { useEffect, useState } from "react";
import { api, type HistoryOrder } from "../api";
import { dayLabel, money, niceName, n2 } from "../format";
import { Dialog, Icon } from "../ui";
import "./order-history.css";

// Past orders for the demo account: synthetic 8-week history (clearly labelled) plus orders placed in this demo.
export function OrderHistory({
  onClose,
  onReorder,
}: {
  onClose: () => void;
  onReorder?: () => void;
}) {
  const [orders, setOrders] = useState<HistoryOrder[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api.history().then(
      (r) => setOrders(r.orders),
      () => setFailed(true),
    );
  }, []);
  return (
    <Dialog
      title="Order history"
      eyebrow="Bistro Kallio · synthetic demo history"
      onClose={onClose}
      className="order-history"
      footer={
        onReorder ? (
          <button type="button" className="btn" onClick={onReorder}>
            Prepare my usual order
          </button>
        ) : undefined
      }
    >
      {failed && (
        <p className="order-history__empty">
          Couldn&apos;t load your orders. Nothing changed.
        </p>
      )}
      {!orders && !failed && (
        <p className="order-history__empty" role="status">
          Loading orders…
        </p>
      )}
      {orders && !orders.length && (
        <p className="order-history__empty">No past orders yet.</p>
      )}
      {orders && orders.length > 0 && (
        <ul className="order-history__list">
          {orders.map((o) => (
            <li key={o.id}>
              <details className="order-history__order">
                <summary>
                  <span className="order-history__when">
                    <b>{dayLabel(o.date)}</b>
                    <span>
                      {o.lines.length} products
                      {o.source === "demo_order"
                        ? " · placed in this demo"
                        : ""}
                    </span>
                  </span>
                  <b className="order-history__total">{money(o.total)}</b>
                  <Icon
                    name="chevron-down"
                    className="i-16 order-history__chevron"
                  />
                </summary>
                <ul className="order-history__lines">
                  {o.lines.map((l) => (
                    <li key={l.sku}>
                      <span>
                        {niceName(l.name)}
                        {l.substitutedFor && (
                          <span className="order-history__sub">
                            instead of {niceName(l.substitutedFor)}
                          </span>
                        )}
                      </span>
                      <span className="order-history__qty">{n2(l.qty)} ×</span>
                      <span className="order-history__line-total">
                        {money(l.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
      <p className="order-history__note">
        Prices excl. VAT. Past prices are for reference; new orders always use
        today&apos;s prices.
      </p>
    </Dialog>
  );
}
