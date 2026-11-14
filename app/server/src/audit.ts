import { readLedger, writeLedger } from "./ledger";
// Audit trail: one event list per basket (orders log into their basket's list too), so the record reads
// request -> plan -> catalogue search -> stock check -> swaps -> mandate -> order -> approval, with API call counts.

export type AuditEvent = {
  at: string;
  actor: string; // "assistant" | "gateway" | a person ("Anna K.", "Mikko L.") | an agent id
  kind: string; // request | plan | search | pick | stock | issues | alternatives | edit | swap | mandate | order | recheck | decision
  summary: string; // one plain-language line
  data?: object;
};

const byScope = new Map<string, AuditEvent[]>(readLedger("audit", []));

export function audit(
  scope: string,
  actor: string,
  kind: string,
  summary: string,
  data?: object,
): AuditEvent {
  const e: AuditEvent = {
    at: new Date().toISOString(),
    actor,
    kind,
    summary,
    ...(data ? { data } : {}),
  };
  const list = byScope.get(scope) ?? [];
  list.push(e);
  byScope.set(scope, list);
  writeLedger("audit", [...byScope]);
  return e;
}

export const events = (scope: string): AuditEvent[] => [
  ...(byScope.get(scope) ?? []),
];

/** Every event across baskets/orders, newest first, each tagged with its scope (basket id). */
export const allEvents = (limit = 200): (AuditEvent & { scope: string })[] =>
  [...byScope.entries()]
    .flatMap(([scope, list]) => list.map((e) => ({ ...e, scope })))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit);

export const resetAudit = () => byScope.clear();
