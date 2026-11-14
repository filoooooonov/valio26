// The chat thread is the record: it is rebuilt from the gateway's audit events (GET /api/basket/:id/audit),
// so it never rewrites history. Live things (open questions, waiting, errors) are appended at the end by Chat.
import type { AuditEvent, Basket, MandateResult } from "./api";
import type { IconName } from "./icons";
import {
  money,
  niceName,
  whole,
  SLOT,
  timeLabel,
  weekday,
  weekdayLong,
} from "./format";

export type Did = { icon: IconName; text: string };
export type Item =
  | {
      kind: "user";
      key: string;
      at: string;
      who: string;
      text: string;
      long?: boolean;
    }
  | {
      kind: "assistant";
      key: string;
      at: string;
      text: string;
      did?: Did[];
      route?: boolean;
      log?: number;
    }
  | {
      kind: "system";
      key: string;
      at: string;
      icon: IconName;
      text: string;
      tone?: "green" | "amber" | "red";
    }
  | {
      kind: "sentBack";
      key: string;
      at: string;
      orderId: string;
      by: string;
      note: string;
    };

// Demo personas of the webshop account (not API data): the API only knows "Anna K." and "Mikko L.".
export const PEOPLE: Record<
  string,
  { name: string; first: string; role: string }
> = {
  "Anna K.": { name: "Anna Korhonen", first: "Anna", role: "Head chef" },
  "Mikko L.": { name: "Mikko Laine", first: "Mikko", role: "Purchasing" },
};
export const firstName = (who: string) =>
  PEOPLE[who]?.first ?? who.split(" ")[0];

// Swaps the gateway applied itself (same-use rule) or an outside agent made: not the chef's OK.
export const isAutoSwap = (who?: string) =>
  !!who &&
  (who.startsWith("agent") || who.startsWith("gateway") || who === "assistant");
// User-facing copy: no API-call counts, no repeated "no alternative" sentences, decimal commas.
export const plain = (s: string) =>
  s.replace(/\s*\(\d+ (Valio )?API calls?\)/g, "").replace(/(\d)\.(\d)/g, "$1,$2");
export const cleanIssue = (s: string) =>
  plain(s.replace(/\s*No deliverable alternative found\.?/i, "").trim().replace(/\.?$/, "."));
export const orderLabel = (id: string) => "AIM-" + id.replace(/^o_/, "").toUpperCase();
const OPEN_IN = ["Done: {n} is in.", "{N} it is.", "Switched to {n}.", "Okay, {n} is in the order now."];
const OPEN_OUT = ["Okay, no {n} this time.", "{N} is off the order.", "Left out: {n}."];
const fill = (t: string, n: string) => t.replace("{n}", n).replace("{N}", n.charAt(0).toUpperCase() + n.slice(1));
const quoted = (s: string) => s.match(/"([\s\S]*)"/)?.[1];
const shortName = (s: string) => {
  const n = niceName(s)
    .replace(/\s+\d+([.,]\d+)?\s*(kg|g|l|dl|ml|cl)(?![a-z]).*$/i, "")
    .replace(/\s*,?\s*(apx\.?|approx\.?).*$/i, "");
  return n.length > 34 ? n.slice(0, 32).trimEnd() + "…" : n;
};
export { shortName };

const stateOf = (summary: string): MandateResult["state"] | null => {
  const m = summary.match(/^(agent_may_order|needs_your_ok|needs_approval)/);
  return m ? (m[1] as MandateResult["state"]) : null;
};
const reasonOf = (summary: string) => summary.replace(/^[a-z_]+:\s*/, "");

export function mandateSentence(
  state: MandateResult["state"] | null,
  reason: string,
  total: number | undefined,
  b: Basket,
) {
  const t = total != null ? `The order is ${money(total)}. ` : "";
  const who = PEOPLE[b.rules.approver]?.name ?? b.rules.approver;
  if (state === "needs_approval")
    return total != null && total > b.rules.maxOrderEur
      ? `The order is ${money(total)}, which is ${money(total - b.rules.maxOrderEur)} over your ${whole(b.rules.maxOrderEur)} limit, so ${who} signs off before anything is sent.`
      : `${t}With today's other orders it's over your ${whole(b.rules.maxDailyEur)} daily limit, so ${who} signs off before anything is sent.`;
  if (state === "agent_may_order")
    return `${t}That's inside your ${whole(b.rules.maxOrderEur)} limit, so you can place it yourself.`;
  const n = reason.match(/^(\d+) products?/)?.[1];
  return n
    ? `${n} ${n === "1" ? "item needs" : "items need"} your attention. Click an item to review its options.`
    : "";
}

export function buildThread(events: AuditEvent[], b: Basket): Item[] {
  const out: Item[] = [];
  let build: AuditEvent[] = [];
  let inBuild = false;
  let awaitingReply: { at: string; text: string } | null = null;
  let lastState: MandateResult["state"] | null = null;
  let firstUser = true;
  let nReply = -1;
  let lastRemove: { item: Item; names: string[]; at: string } | null = null;

  const flushBuild = (mandate: AuditEvent) => {
    const plan = build.find((e) => e.kind === "plan");
    const stock = build.find((e) => e.kind === "stock");
    const alt = build.find((e) => e.kind === "alternatives");
    const pd = (plan?.data ?? {}) as { dishes?: string[]; planner?: string };
    const base = new Set(
      (pd.dishes ?? b.dishes.map((d) => d.name)).map((d) =>
        d.replace(/\s*[×x]\s*\d+$/, "").replace(/\s*\(.*\)\s*$/, ""),
      ),
    );
    const lf = b.dishes.find((d) => d.diet.length && d.name.includes("("));
    const people = b.people;
    const text =
      `I planned ${base.size} ${base.size === 1 ? "dish" : "dishes"} for ${people}` +
      (lf ? `, with a ${lf.diet.join(", ")} version for ${lf.portions}` : "") +
      `. Prices are your Hotelli Kaleva prices; stock is for ${weekdayLong(b.date)}'s delivery.`;
    const skus = Number((stock?.data as { skus?: number })?.skus ?? 0);
    const altN = Number(
      alt?.summary.match(/checked (\d+) alternatives/)?.[1] ?? 0,
    );
    const calls = Number(
      (mandate.data as { apiCalls?: number })?.apiCalls ?? b.apiCalls,
    );
    const problems = Number(alt?.summary.match(/^(\d+) problems?/)?.[1] ?? 0);
    const did: Did[] = [
      {
        icon: "scan-search",
        text: `Checked ${skus + altN} products only · ${calls} calls to Valio Aimo`,
      },
    ];
    const agentSwaps = b.lines.filter(
      (l) => l.replaced && isAutoSwap(l.issue?.decidedBy),
    );
    if (agentSwaps.length)
      did.push({
        icon: "repeat",
        text:
          agentSwaps.length > 2
            ? `Swapped ${agentSwaps.length} products that can't arrive ${weekday(b.date)} for the same use`
            : `Swapped ${agentSwaps.map((l) => shortName(l.replaced!.name)).join(" and ")} for ${weekday(b.date)} · same use`,
      });
    else if (problems)
      did.push({
        icon: "repeat",
        text: `${problems} ${problems === 1 ? "product" : "products"} can't arrive ${weekday(b.date)} as asked, so I found alternatives`,
      });
    else
      did.push({
        icon: "circle-check",
        text: `Everything arrives ${weekday(b.date)} as asked`,
      });
    if (pd.planner === "fallback")
      did.push({
        icon: "circle-alert",
        text: "Planner offline, so I used the standard menu",
      });
    did.push(
      b.totalIfAccepted > b.rules.maxOrderEur
        ? {
            icon: "shield-check",
            text: `Over ${whole(b.rules.maxOrderEur)}, so ${firstName(b.rules.approver)} will sign off before it's sent`,
          }
        : {
            icon: "shield-check",
            text: `Under your ${whole(b.rules.maxOrderEur)} order limit; the daily limit is checked when you send`,
          },
    );
    out.push({
      kind: "assistant",
      key: "plan-" + mandate.at,
      at: mandate.at,
      text,
      did,
    });
    build = [];
    inBuild = false;
  };

  for (const [idx, e] of events.entries()) {
    const key = e.kind + "-" + e.at + "-" + idx;
    switch (e.kind) {
      case "request": {
        out.push({
          kind: "user",
          key,
          at: e.at,
          who: "Anna K.",
          text: quoted(e.summary) ?? b.request,
          long: firstUser,
        });
        firstUser = false;
        inBuild = true;
        break;
      }
      case "plan":
      case "search":
      case "pick":
      case "stock":
      case "alternatives":
        if (inBuild) build.push(e);
        break;
      case "mandate": {
        const st = stateOf(e.summary);
        if (inBuild) {
          flushBuild(e);
        } else if (awaitingReply || st !== lastState) {
          const total = (e.data as { total?: number })?.total;
          const lead = awaitingReply?.text ?? "";
          const tail = mandateSentence(
            st,
            reasonOf(e.summary),
            st === "needs_your_ok" ? undefined : total,
            b,
          );
          const text = [lead, tail].filter(Boolean).join(" ");
          if (text)
            out.push({
              kind: "assistant",
              key,
              at: e.at,
              text,
              route: st === "needs_approval" && lastState !== "needs_approval",
            });
        }
        awaitingReply = null;
        lastState = st;
        break;
      }
      case "swap": {
        const d = (e.data ?? {}) as { decision?: string };
        const m = e.summary.match(/^Swapped (.*) → (.*)$/);
        const who = e.actor;
        if (isAutoSwap(who)) {
          if (who.startsWith("gateway")) break; // same-use rule: reported in the plan turn
          if (inBuild) break; // reported in the plan turn's "what I did"
          out.push({
            kind: "system",
            key,
            at: e.at,
            icon: "repeat",
            text: e.summary,
          });
          break;
        }
        const name = m
          ? shortName(m[2])
          : shortName(e.summary.replace(/^(Removed|Kept)\s+/, ""));
        const text =
          d.decision === "remove"
            ? `Don't order the ${name}`
            : d.decision === "keep"
              ? `Take what's available of ${name}`
              : `Use ${name}`;
        out.push({ kind: "user", key, at: e.at, who, text });
        // Several "don't order" answers in one go (the grouped card) read as one message.
        const ri = lastRemove ? out.indexOf(lastRemove.item) : -1;
        if (d.decision === "remove" && lastRemove && ri >= 0 && ri >= out.length - 2 && Date.parse(e.at) - Date.parse(lastRemove.at) < 10000) {
          out.splice(ri + 1); // drop the reply to the previous removal; one reply follows for all
          lastRemove.names.push(name);
          const list = lastRemove.names.join(", ");
          out[ri] = { ...(lastRemove.item as Extract<Item, { kind: "user" }>), text: `Don't order the ${list}` };
          lastRemove.item = out[ri];
          awaitingReply = { at: e.at, text: fill(OPEN_OUT[nReply % OPEN_OUT.length], list) };
          break;
        }
        nReply++;
        awaitingReply = {
          at: e.at,
          text: fill((d.decision === "remove" ? OPEN_OUT : OPEN_IN)[nReply % (d.decision === "remove" ? OPEN_OUT.length : OPEN_IN.length)], name),
        };
        lastRemove = null;
        if (d.decision === "remove") lastRemove = { item: out[out.length - 1], names: [name], at: e.at };
        break;
      }
      case "edit":
        out.push({
          kind: "system",
          key,
          at: e.at,
          icon: "repeat",
          text: `${firstName(e.actor)} changed ${shortName(e.summary.replace(/:.*$/, ""))}: ${e.summary.replace(/^.*:\s*/, "")} · ${timeLabel(e.at)}`,
        });
        break;
      case "guests":
        out.push({
          kind: "system",
          key,
          at: e.at,
          icon: "users",
          text: `${plain(e.summary)} · ${timeLabel(e.at)}`,
        });
        awaitingReply = {
          at: e.at,
          text: "Amounts recalculated for the new guest count.",
        };
        break;
      case "chat": {
        if (e.actor === "assistant") {
          out.push({
            kind: "assistant",
            key,
            at: e.at,
            text: e.summary.replace(/^[^:]*:\s*/, ""),
          });
          awaitingReply = null;
        } else
          out.push({
            kind: "user",
            key,
            at: e.at,
            who: e.actor,
            text: quoted(e.summary) ?? e.summary,
          });
        break;
      }
      case "replan":
        out.push({
          kind: "system",
          key,
          at: e.at,
          icon: "rotate-cw",
          text: e.summary,
        });
        break;
      case "recheck": {
        const ch = ((e.data as { changes?: unknown[] })?.changes ?? []).length;
        if (ch)
          out.push({
            kind: "system",
            key,
            at: e.at,
            icon: "circle-alert",
            tone: "amber",
            text: `${plain(e.summary)} · ${timeLabel(e.at)}`,
          });
        break;
      }
      case "order": {
        const d = (e.data ?? {}) as { status?: string; orderId?: string };
        if (d.status === "pending_approval")
          out.push({
            kind: "system",
            key,
            at: e.at,
            icon: "send",
            text: `You sent it to ${firstName(b.rules.approver)} · ${timeLabel(e.at)}`,
          });
        else if (d.status === "placed") {
          out.push({
            kind: "system",
            key,
            at: e.at,
            icon: "circle-check",
            tone: "green",
            text: `Order placed · ${timeLabel(e.at)}`,
          });
          out.push(placedTurn(e.at, d.orderId ?? "", b, events));
        }
        break;
      }
      case "decision": {
        const d = (e.data ?? {}) as { status?: string; orderId?: string };
        if (d.status === "placed") {
          out.push({
            kind: "system",
            key,
            at: e.at,
            icon: "circle-check",
            tone: "green",
            text: `${firstName(e.actor)} approved · ${timeLabel(e.at)}`,
          });
          out.push(placedTurn(e.at, d.orderId ?? "", b, events));
        } else if (d.status === "rejected") {
          out.push({
            kind: "sentBack",
            key,
            at: e.at,
            orderId: d.orderId ?? "",
            by: e.actor,
            note: quoted(e.summary) ?? "",
          });
        } else
          out.push({
            kind: "system",
            key,
            at: e.at,
            icon: "circle-alert",
            tone: "red",
            text: e.summary,
          });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function placedTurn(
  at: string,
  orderId: string,
  b: Basket,
  events: AuditEvent[],
): Item {
  const calls = events.reduce(
    (n, e) => n + Number((e.data as { calls?: number })?.calls ?? 0),
    0,
  );
  return {
    kind: "assistant",
    key: "placed-" + at,
    at,
    text: `Order ${orderLabel(orderId)} is with Valio Aimo, and the prices are fixed. See you ${weekdayLong(b.date)} ${SLOT} at the loading dock.`,
    log: calls,
  };
}
