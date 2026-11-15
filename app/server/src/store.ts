// In-memory state for the demo (baskets + orders). Restarting the server clears it.
import { readLedger, writeLedger } from "./ledger";
import type { Basket } from "./plan";
import { resetPreferences } from "./preferences";
import type { Order } from "./orders";
import { currentSession, visible } from "./session";

/** A Map that, on the hosted demo (SESSION_ISOLATION=1), only shows the current visitor's entries.
 *  Writes stamp the visitor; every read path (get/has/iteration/size) filters. Isolation off: a plain Map. */
export class SessionMap<V> extends Map<string, V> {
  owners: Map<string, string>;
  constructor(entries: [string, V][], owners: [string, string][] = []) {
    super();
    this.owners = new Map(owners);
    for (const [k, v] of entries) super.set(k, v);
  }
  private mine(k: string) {
    return visible(this.owners.get(k));
  }
  override set(k: string, v: V) {
    const s = currentSession();
    if (s && !this.owners.has(k)) this.owners.set(k, s);
    return super.set(k, v);
  }
  override get(k: string) {
    return this.mine(k) ? super.get(k) : undefined;
  }
  override has(k: string) {
    return this.mine(k) && super.has(k);
  }
  override delete(k: string) {
    if (!this.mine(k)) return false;
    this.owners.delete(k);
    return super.delete(k);
  }
  override clear() {
    for (const k of [...this.keys()]) this.delete(k);
  }
  override *entries(): MapIterator<[string, V]> {
    for (const e of super.entries()) if (this.mine(e[0])) yield e;
  }
  override *keys(): MapIterator<string> {
    for (const [k] of this.entries()) yield k;
  }
  override *values(): MapIterator<V> {
    for (const [, v] of this.entries()) yield v;
  }
  override [Symbol.iterator]() {
    return this.entries();
  }
  override forEach(fn: (v: V, k: string, m: Map<string, V>) => void) {
    for (const [k, v] of this.entries()) fn(v, k, this);
  }
  override get size() {
    let n = 0;
    for (const _ of this.entries()) n++;
    return n;
  }
  /** Every visitor's entries (persistence only). */
  all(): [string, V][] {
    return [...super.entries()];
  }
}

export const baskets = new SessionMap<Basket>(
  readLedger("baskets", []),
  readLedger("basketOwners", []),
);
export const orders = new SessionMap<Order>(
  readLedger("orders", []),
  readLedger("orderOwners", []),
);

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

/** Clears baskets and orders, plus the live purchase-memory events they produced (S48); synthetic history stays.
 *  On the hosted demo this clears only the current visitor's session. */
export function resetStore() {
  baskets.clear();
  orders.clear();
  resetPreferences();
  persistStore();
}

export function persistStore() {
  writeLedger("baskets", baskets.all());
  writeLedger("orders", orders.all());
  writeLedger("basketOwners", [...baskets.owners]);
  writeLedger("orderOwners", [...orders.owners]);
}

export const submitting = new Set<string>();
