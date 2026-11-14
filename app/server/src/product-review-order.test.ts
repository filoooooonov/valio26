import { expect, test } from "bun:test";
import type { Basket, BasketLine } from "../../web/src/api";
import { reviewProductKey, syncProductReviews, type ProductReviewTimeline } from "../../web/src/thread";

const at = (second: number) => `2026-11-14T12:00:${String(second).padStart(2, "0")}.000Z`;
const context = [
  { kind: "user", key: "request", at: at(0) },
  { kind: "assistant", key: "plan-1", at: at(2) },
];
const empty = (): ProductReviewTimeline => ({ basketId: null, messages: [] });
const line = (id = "line-1") => ({ id, sku: id, issue: { kind: "unavailable" } }) as BasketLine;
const basket = (lines = [line()], id = "basket") => ({ id, createdAt: at(1), lines }) as Basket;
const chronological = (messages: { key: string; at: string }[]) => [...messages]
  .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map(m => m.key);

test("review stays after the original assistant response and above subsequent user messages", () => {
  const b = basket();
  const first = syncProductReviews(empty(), b, context);
  const newer = [...context, { kind: "user", key: "new-message", at: at(5) }, { kind: "assistant", key: "reply", at: at(6) }];
  const next = syncProductReviews(first, b, newer);
  expect(next).toBe(first);
  expect(chronological([...newer, ...next.messages])).toEqual(["request", "plan-1", first.messages[0].key, "new-message", "reply"]);
  // Restoring an existing conversation also places initial issues at its original plan.
  expect(syncProductReviews(empty(), b, newer).messages[0].at).toBe(at(2));
});

test("basket arriving before audit data anchors to the plan when it loads", () => {
  const b = basket();
  const early = syncProductReviews(empty(), b, []);
  const loaded = syncProductReviews(early, b, context);
  expect(loaded.messages[0].at).toBe(at(2));
  expect(loaded.messages[0].key).toBe(early.messages[0].key);
  expect(syncProductReviews(loaded, b, context)).toBe(loaded);
});

test("new issues get their own later turn while existing reviews keep their place", () => {
  const b = basket();
  const first = syncProductReviews(empty(), b, context);
  const newer = [...context, { kind: "user", key: "add", at: at(5) }, {
    kind: "assistant", key: "added", at: at(6), added: [{ lineId: "line-2" }],
  }];
  const second = syncProductReviews(first, basket([line(), line("line-2")]), newer);
  expect(second.messages).toHaveLength(2);
  expect(second.messages[0]).toBe(first.messages[0]);
  expect(second.messages[1].at).toBe(at(6));
});

test("initially healthy baskets can discover an issue after a later conversation turn", () => {
  const healthy = syncProductReviews(empty(), basket([]), context);
  const newer = [...context, { kind: "user", key: "change", at: at(5) }];
  expect(syncProductReviews(healthy, basket(), newer).messages[0].at).toBe(at(5));
});

test("partial resolution and undo do not duplicate or move the original review", () => {
  const b = basket([line(), line("line-2")]);
  const first = syncProductReviews(empty(), b, context);
  const resolved = { ...line(), issue: { ...line().issue!, decided: "remove" } };
  const next = syncProductReviews(first, basket([resolved, line("line-2")]), context);
  expect(next).toBe(first);
  expect(syncProductReviews(next, b, context)).toBe(first);
  expect(first.messages[0].products).toEqual([reviewProductKey(line()), reviewProductKey(line("line-2"))]);
});

test("new baskets and reset clear previous review positions", () => {
  const first = syncProductReviews(empty(), basket(), context);
  const next = syncProductReviews(first, basket([line()], "new-basket"), context);
  expect(next.messages).toHaveLength(1);
  expect(next.messages[0].key).not.toBe(first.messages[0].key);
  expect(syncProductReviews(next, null, [])).toEqual(empty());
});
