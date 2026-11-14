// In-memory state for the demo (baskets + orders). Restarting the server clears it.
import type { Basket } from "./plan";
import type { Order } from "./orders";

export const baskets = new Map<string, Basket>();
export const orders = new Map<string, Order>();

export const newId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

/** Placed + pending orders today for this customer (what the daily limit counts). */
export function dailySoFar(
  customer: string,
  excludeBasket?: string,
  day = new Date().toISOString().slice(0, 10),
): number {
  let sum = 0;
  for (const o of orders.values())
    if (
      o.customer === customer &&
      o.basketId !== excludeBasket &&
      (o.status === "placed" || o.status === "pending_approval") &&
      o.createdAt.slice(0, 10) === day
    )
      sum += o.total;
  return Math.round(sum * 100) / 100;
}

export function resetStore() {
  baskets.clear();
  orders.clear();
}
