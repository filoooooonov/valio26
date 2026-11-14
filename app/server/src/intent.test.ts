import { expect, test } from "bun:test";
import { purchasingIntent } from "./intent";

test("history requests bypass menu planning, including extra items and trade scaling", () => {
  for (const request of [
    "Prepare my usual weekend order.",
    "Order the same products as last week.",
    "Prepare my usual dairy order.",
    "Prepare my usual order but add 10 litres of milk.",
    "We're expecting 30% more customers this weekend.",
    "Same as last week please",
    "Last week's order please",
    "Our regular weekend order",
    "Prepare the normal dairy order",
  ]) {
    expect(purchasingIntent(request)).toBe("REORDER");
  }
});

test("history routing preserves direct product and menu requests", () => {
  expect(purchasingIntent("I need 1,000 litres of lactose-free milk delivered Monday.")).toBe("DIRECT_PURCHASE");
  expect(purchasingIntent("Catering for 50 people on Saturday.")).toBe("MENU_PLANNING");
  expect(purchasingIntent("Prepare my usual order", [{ query: "milk", quantity: 10, unit: "l" }])).toBe("DIRECT_PURCHASE");
});
