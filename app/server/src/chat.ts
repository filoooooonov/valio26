// Chat -> gateway actions (CONTRACT v1.2: POST /api/basket/:id/chat). Claude maps the chef's text to actions
// ONLY; every action runs through the same handlers and rules as the buttons (rescaleGuests, editLine,
// buildBasket). Claude never edits prices or the mandate. Without Claude, a small deterministic parser runs.
import { audit } from "./audit";
import { getLlm, type ChatPlan } from "./llm";
import { eur } from "./policy";
import {
  buildBasket,
  editLine,
  HttpError,
  isOpen,
  recompute,
  rescaleGuests,
  type Basket,
} from "./plan";
import { baskets } from "./store";

export type ChatAction = {
  kind: "set_guests" | "set_qty" | "choose_option" | "remove_line" | "replan";
  summary: string;
};
export type ChatReply = {
  reply: string;
  actions: ChatAction[];
  basket: Basket;
  question?: string;
};
type Planned = ChatPlan["actions"][number];

export const ASK =
  "I can change guests, quantities, swaps or remove items. What should I change?";

/** Compact basket view for Claude: ids, names, quantities, open issues with their option skus. */
export function summarize(b: Basket): string {
  const rows = b.lines.map((l) => {
    const head = `${l.id} | ${l.name} | ${l.qty} × ${l.pack}${l.qty === 0 ? " (removed)" : ""}`;
    if (!isOpen(l)) return head;
    const opts = l.issue!.options.map((o) => `${o.sku} = ${o.name}`).join("; ");
    return `${head} | OPEN ISSUE: ${l.issue!.text} | options: ${opts || "none"}${l.issue!.kind === "short" ? "; keep" : ""}; remove`;
  });
  return [
    `Guests: ${b.people}`,
    `Dishes: ${b.dishes.map((d) => `${d.name} × ${d.portions}`).join(", ") || "-"}`,
    ...rows,
  ].join("\n");
}

// ---------- deterministic fallback parser ----------
const STOP = new Set([
  "the",
  "a",
  "an",
  "instead",
  "please",
  "of",
  "to",
  "for",
  "with",
  "and",
  "use",
  "it",
  "one",
  "them",
  "that",
]);
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9åäö]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
const matches = (name: string, ws: string[]) => {
  const n = name.toLowerCase();
  return ws.filter(
    (w) => n.includes(w) || (w.endsWith("s") && n.includes(w.slice(0, -1))),
  ).length;
};

export function parseFallback(
  text: string,
  b: Basket,
): { actions: Planned[]; question?: string } {
  const t = text.trim();
  const base = {
    people: null,
    lineId: null,
    qty: null,
    option: null,
    change: null,
  };
  const g = t.match(
    /(\d+)\s*(guests?|people|persons?|pax|portions|hengelle|henkeä)/i,
  );
  if (g)
    return { actions: [{ ...base, kind: "set_guests", people: Number(g[1]) }] };
  const rm = t.match(/\b(remove|drop|delete)\s+(.+)/i);
  if (rm) {
    const ws = words(rm[2]);
    const best = b.lines
      .filter((l) => l.qty > 0)
      .map((l) => ({ l, s: matches(l.name, ws) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s)[0];
    if (best)
      return { actions: [{ ...base, kind: "remove_line", lineId: best.l.id }] };
  }
  const use = t.match(
    /\b(use|take|choose|pick|go with|swap to|switch to)\s+(.+)/i,
  );
  if (use) {
    const ws = words(use[2]);
    let best: { lineId: string; sku: string; s: number } | null = null;
    for (const l of b.lines.filter(isOpen))
      for (const o of l.issue!.options) {
        const s = matches(o.name, ws);
        if (s > 0 && (!best || s > best.s))
          best = { lineId: l.id, sku: o.sku, s };
      }
    if (best)
      return {
        actions: [
          {
            ...base,
            kind: "choose_option",
            lineId: best.lineId,
            option: best.sku,
          },
        ],
      };
  }
  return { actions: [], question: ASK };
}

// ---------- run ----------
export async function chat(
  basketId: string,
  text: string,
  by = "buyer",
): Promise<ChatReply> {
  let b = baskets.get(basketId);
  if (!b) throw new HttpError(404, "basket not found");
  if (!text?.trim()) throw new HttpError(400, "text required");
  audit(b.id, by, "chat", `"${text.trim().slice(0, 200)}"`);

  let plan: { actions: Planned[]; question?: string | null };
  let via = "parser";
  const llm = getLlm();
  try {
    if (!llm?.chat) throw new Error("no LLM");
    plan = await llm.chat(text, summarize(b));
    via = "Claude";
  } catch {
    plan = parseFallback(text, b);
  }
  if (!plan.actions.length) {
    const question = plan.question || ASK;
    return { reply: question, actions: [], basket: recompute(b), question };
  }

  const done: ChatAction[] = [];
  const failed: string[] = [];
  for (const a of plan.actions.slice(0, 5)) {
    const line = a.lineId ? b.lines.find((l) => l.id === a.lineId) : undefined;
    try {
      if (a.kind === "set_guests") {
        if (a.people == null) throw new HttpError(400, "how many guests?");
        const was = b.people;
        b = await rescaleGuests(b.id, a.people, by);
        done.push({ kind: a.kind, summary: `Guests ${was} → ${a.people}` });
      } else if (a.kind === "set_qty") {
        if (!line || a.qty == null)
          throw new HttpError(400, "which line and how many?");
        const was = line.qty;
        b = editLine(b.id, line.id, { qty: a.qty, by });
        done.push({ kind: a.kind, summary: `${line.name}: ${was} → ${a.qty}` });
      } else if (a.kind === "choose_option") {
        if (!line || !a.option) throw new HttpError(400, "which product?");
        const before = line.name;
        b = editLine(b.id, line.id, { chooseOption: a.option, by });
        const after = b.lines.find((l) => l.id === line.id)!;
        done.push({
          kind: a.kind,
          summary:
            a.option === "remove"
              ? `Removed ${before}`
              : a.option === "keep"
                ? `Kept ${before} at ${after.qty}`
                : `Swapped ${before} → ${after.name}`,
        });
      } else if (a.kind === "remove_line") {
        if (!line) throw new HttpError(400, "which product?");
        b = isOpen(line)
          ? editLine(b.id, line.id, { chooseOption: "remove", by })
          : editLine(b.id, line.id, { qty: 0, by });
        done.push({ kind: a.kind, summary: `Removed ${line.name}` });
      } else if (a.kind === "replan") {
        if (!a.change)
          throw new HttpError(400, "what should change in the menu?");
        const nb = await buildBasket({
          request: `${b.request}\nChange: ${a.change}`,
          people: b.people,
          date: b.date,
          customer: b.customer,
        });
        audit(b.id, by, "replan", `Replanned as ${nb.id}: ${a.change}`, {
          newBasket: nb.id,
        });
        audit(nb.id, by, "replan", `Replanned from ${b.id}: ${a.change}`, {
          from: b.id,
        });
        b = nb;
        done.push({ kind: a.kind, summary: `New plan: ${a.change}` });
        break; // later actions referred to the old basket's lines
      }
    } catch (e) {
      failed.push((e as Error).message);
    }
  }
  audit(
    b.id,
    "assistant",
    "chat",
    `${via}: ${done.map((d) => d.summary).join("; ") || "no change"}`,
    {
      actions: done,
      failed,
    },
  );

  const total = `New total ${eur(b.total)}${b.openIssues ? ` (${eur(b.totalIfAccepted)} if you accept the suggested swaps)` : ""}.`;
  const did = done.length
    ? `${done.map((d) => d.summary).join(". ")}.`
    : "I couldn't change anything.";
  const bad = failed.length ? ` Not done: ${failed.join("; ")}.` : "";
  return { reply: `${did} ${total}${bad}`, actions: done, basket: b };
}
