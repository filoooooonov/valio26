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

// S50: menu planning is optional. Only an explicit ask for a menu opens menu review.
import { namedDishes, requestAllergens, requestRoute } from "./intent";

test("direct product requests bypass menu review", () => {
  expect(requestRoute("I need 10 kg of chicken and 5 litres of cream.")).toBe("DIRECT_PURCHASE");
  expect(requestRoute("Prepare my usual weekend order.")).toBe("REORDER");
});

test("known-dish requests skip menu generation", () => {
  for (const r of [
    "I need ingredients for lasagna for 50 people.",
    "Ingredients for beef stew for 40 guests on Friday",
    "We're making moussaka for 30 people",
    "Ingredients for a catering event for 50 people on Saturday: creamy salmon soup, rye bread, blueberry pie. 3 guests are lactose-free.",
    "Catering for 50 people on Saturday: lasagna, green salad",
  ])
    expect(requestRoute(r)).toBe("KNOWN_DISH");
  expect(namedDishes("I need ingredients for lasagna for 50 people.")).toEqual(["lasagna"]);
  expect(namedDishes("Catering for 50: salmon soup, rye bread and blueberry pie")).toEqual(["salmon soup", "rye bread", "blueberry pie"]);
});

test("explicit menu asks open menu review; bare events ask once", () => {
  for (const r of [
    "Plan a three-course dinner for 50 people.",
    "Suggest a menu for 40 guests on Friday",
    "What should we serve at a party for 30 people?",
  ])
    expect(requestRoute(r)).toBe("MENU_PLANNING");
  for (const r of [
    "Catering for 50 people on Saturday.",
    "Ingredients for a catering event for 50 people on Saturday",
    "Dinner for 50 guests on Friday",
    "We're serving 80 guests on Saturday",
  ])
    expect(requestRoute(r)).toBe("ASK_MENU");
});

test("hard allergen exclusions are parsed from requests and menu requirements; diets are not", () => {
  expect(requestAllergens("Hard allergen exclusions (never substitute; unknown safety needs review): no nuts, no milk.")).toEqual(["nuts", "milk"]);
  expect(requestAllergens("nut-free and egg allergy, peanut-free")).toEqual(["nuts", "eggs", "peanuts"]);
  expect(requestAllergens("3 guests are lactose-free, vegetarian, gluten-free")).toEqual([]);
});
