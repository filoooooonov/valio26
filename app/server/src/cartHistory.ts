import { audit } from "./audit";
import {
  assertEditable,
  editLine,
  HttpError,
  recompute,
  type Basket,
  type BasketLine,
  type LineEdit,
} from "./plan";
import { baskets } from "./store";
import { retractLastChoice } from "./preferences";

type Entry = { line: BasketLine; after: string };
const histories = new WeakMap<Basket, Entry[]>();
// Purchase-memory labels are derived (S48) and may change when another basket learns; they are not cart changes.
const DERIVED = new Set(["preference", "offerPermission"]);
const fingerprint = (b: Basket) =>
  JSON.stringify(
    [b.request, b.people, b.date, b.dishes, b.lines, b.assumed, b.notes],
    (k, v) => (DERIVED.has(k) ? undefined : v),
  );

// Only server-owned line snapshots can be restored. Other basket changes invalidate the stack.
export function editCartLine(
  basketId: string,
  lineId: string,
  edit: LineEdit,
): Basket {
  const b = baskets.get(basketId);
  if (!b) throw new HttpError(404, "basket not found");
  assertEditable(b);
  const line = b.lines.find((l) => l.id === lineId);
  if (!line) throw new HttpError(404, "line not found");
  const before = fingerprint(b);
  const previous = structuredClone(line);
  const result = editLine(basketId, lineId, edit);
  const after = fingerprint(result);
  if (before !== after) {
    const history = histories.get(b) ?? [];
    if (history.length && history.at(-1)!.after !== before) history.length = 0;
    history.push({ line: previous, after });
    if (history.length > 30) history.shift();
    histories.set(b, history);
  }
  return result;
}

export function undoCartLine(basketId: string, by = "buyer") {
  const b = baskets.get(basketId);
  if (!b) throw new HttpError(404, "basket not found");
  assertEditable(b);
  const history = histories.get(b);
  const entry = history?.at(-1);
  if (!entry) throw new HttpError(409, "No cart changes to undo");
  if (entry.after !== fingerprint(b)) {
    history!.length = 0;
    throw new HttpError(
      409,
      "The cart changed elsewhere; this edit can no longer be undone",
    );
  }
  const index = b.lines.findIndex((l) => l.id === entry.line.id);
  if (index < 0) throw new HttpError(409, "This item is no longer in the cart");
  const current = b.lines[index];
  if (
    current.issue?.decided &&
    !entry.line.issue?.decided &&
    current.issue.decided !== "keep" &&
    current.issue.decided !== "remove"
  )
    retractLastChoice(b.customer, b.id);
  b.lines[index] = structuredClone(entry.line);
  history!.pop();
  recompute(b);
  audit(b.id, by, "undo", `Undid the last cart change to ${entry.line.name}`, {
    lineId: entry.line.id,
  });
  return { basket: b, canUndo: !!history!.length };
}
