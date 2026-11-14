// Audit trail: one event list per basket (orders log into their basket's list too), so the record reads
// request -> plan -> catalogue search -> stock check -> swaps -> mandate -> order -> approval, with API call counts.
import { createHash } from "node:crypto";

export type AuditEvent = {
  at: string;
  actor: string; // "assistant" | "gateway" | a person ("Anna K.", "Mikko L.") | an agent id
  kind: string; // request | plan | search | pick | stock | issues | alternatives | edit | swap | mandate | order | recheck | decision
  summary: string; // one plain-language line
  data?: object;
  prev?: string;
  hash?: string;
};

const byScope = new Map<string, AuditEvent[]>();

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${canonical(obj[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function audit(
  scope: string,
  actor: string,
  kind: string,
  summary: string,
  data?: object,
): AuditEvent {
  if (data !== undefined) data = JSON.parse(JSON.stringify(data));
  const list = byScope.get(scope) ?? [];
  const at = new Date().toISOString();
  const prev = list.length ? list[list.length - 1].hash! : "genesis";
  const hash = createHash("sha256").update(canonical({ at, actor, kind, summary, data: data ?? null, prev })).digest("hex");
  const e: AuditEvent = {
    at,
    actor,
    kind,
    summary,
    ...(data ? { data } : {}),
    prev,
    hash,
  };
  list.push(e);
  byScope.set(scope, list);
  return e;
}

export function verifyChain(scope: string): { intact: boolean; count: number; head: string | null; brokenAt?: number } {
  const list = byScope.get(scope) ?? [];
  const count = list.length;
  const head = list[count - 1]?.hash ?? null;
  let prev = "genesis";
  for (let i = 0; i < count; i++) {
    const e = list[i];
    const hash = createHash("sha256").update(canonical({ at: e.at, actor: e.actor, kind: e.kind, summary: e.summary, data: e.data ?? null, prev })).digest("hex");
    if (e.prev !== prev || e.hash !== hash) return { intact: false, count, head, brokenAt: i };
    prev = hash;
  }
  return { intact: true, count, head };
}

export const _tamper = (scope: string, i: number, summary: string) => { const l = byScope.get(scope); if (l?.[i]) l[i] = { ...l[i], summary }; };

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
