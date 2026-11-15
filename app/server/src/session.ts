// Per-visitor demo sessions (hosted demo only, SESSION_ISOLATION=1). Each browser gets its own baskets, orders,
// approval queue, daily spend, learned preferences and policy edits; nobody sees another visitor's orders.
// Off (local dev, tests): one shared demo, exactly as before.
import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage<string>();
export const isolated = () => process.env.SESSION_ISOLATION === "1";
export const SESSION_COOKIE = "aimo_session";
export const SESSION_HEADER = "x-aimo-session";
export const validSession = (s: string | undefined | null): s is string =>
  !!s && /^[a-z0-9]{8,40}$/.test(s);
export const newSession = () =>
  crypto.randomUUID().replace(/-/g, "").slice(0, 12);

/** The visitor of the current request (undefined outside a request or when isolation is off). */
export const currentSession = (): string | undefined =>
  isolated() ? als.getStore() : undefined;
export const runInSession = <T>(session: string, fn: () => T): T =>
  als.run(session, fn);

/** True when a record stamped with `owner` belongs to the current visitor. Unstamped records are hidden when isolated. */
export const visible = (owner: string | undefined) => {
  const s = currentSession();
  return !s || owner === s;
};
