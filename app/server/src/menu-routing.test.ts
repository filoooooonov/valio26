import { beforeAll, expect, test } from "bun:test";
import { getProduct, loadCatalog, search } from "./catalog";
import { breaksHardRule, type Basket, type BasketLine } from "./plan";
import { requestAllergens } from "./intent";
import { hardAllergen, requirementsText } from "../../web/src/requirements";
import { plannerRequest } from "../../web/src/menu";

beforeAll(() => loadCatalog());

const basket = (forbidden: string[], diet: string[] = []) =>
  ({
    intent: "MENU_PLANNING",
    forbiddenAllergens: forbidden,
    rules: { forbiddenAllergens: [] },
    dishes: [{ id: "d1", diet }],
  }) as unknown as Basket;
const line = { dishId: "d1" } as unknown as BasketLine;
const find = (q: string, ok: (p: NonNullable<ReturnType<typeof getProduct>>) => boolean) =>
  search(q, { limit: 80 }).map((h) => getProduct(h.id)!).find((p) => p && ok(p))!;

test("menu review dietary choices reach the gateway as hard exclusions vs soft diets", () => {
  expect(hardAllergen("Nut-free")).toBe("nuts");
  expect(hardAllergen("Milk allergy")).toBe("milk");
  expect(hardAllergen("Lactose-free")).toBeNull();
  expect(hardAllergen("Vegetarian")).toBeNull();
  const text = requirementsText({ people: 50, dietary: ["Vegetarian", "Nut-free", "Egg-free"], notes: "no pork" });
  expect(text).toContain("Dietary requirements: Vegetarian.");
  expect(text).toContain("no nuts, no eggs");
  expect(text).toContain("Other requirements: no pork.");
  // The approved-menu planner request carries them into buildBasket, which parses the hard ones.
  const req = plannerRequest({
    request: "Plan a three-course dinner for 50 people",
    categories: [{ id: "a", title: "Lasagna", description: "", selected: true }],
    requirements: { people: 50, dietary: ["Vegetarian", "Nut-free"], notes: "" },
  });
  expect(req).toContain("APPROVED MENU ONLY");
  expect(requestAllergens(req)).toEqual(["nuts"]);
});

test("a substitute is never chosen silently when it could break a hard allergen or diet rule", () => {
  const nutty = find("pähkinä", (p) => p.contains.includes("AN"));
  expect(nutty).toBeTruthy();
  expect(breaksHardRule(basket(["nuts"]), line, nutty.id)).toBe(true);
  // No explicit free-from evidence = unknown safety, so not automatic either.
  const plain = find("maito", (p) => !p.contains.includes("AN") && !p.freeFromAllergen?.includes("AN"));
  expect(breaksHardRule(basket(["nuts"]), line, plain.id)).toBe(true);
  // Diet: fish fails a vegetarian dish.
  const fish = find("lohi", (p) => p.contains.includes("AF"));
  expect(breaksHardRule(basket([], ["vegetarian"]), line, fish.id)).toBe(true);
  // No constraints: no objection.
  expect(breaksHardRule(basket([]), line, plain.id)).toBe(false);
});
