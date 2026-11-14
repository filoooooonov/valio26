import { afterEach, expect, test } from "bun:test";
import { app } from "./app";
import { setLlm, type Llm, type MenuInput } from "./llm";
import { fallbackEdit, fallbackMenu } from "./menu";

const CRAYFISH = "im planning a fancy crayfish party for 100 people, i need starter, main, desert and champagne";
afterEach(() => setLlm(null));
const post = (body: unknown) => app.request("/api/menu", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("fallback follows the requested courses and theme, never the old snack default", () => {
  const items = fallbackMenu(CRAYFISH);
  expect(items.map((i) => i.course)).toEqual(["starter", "main", "dessert", "drinks"]);
  expect(items[0].title).toMatch(/crayfish/i);
  expect(items[3].title).toBe("Champagne");
  expect(items.some((i) => /croissant|chips|cand(y|ies)|soft drink/i.test(i.title + i.description))).toBe(false);
});

test("fallback with no course words proposes a full generic menu", () => {
  const items = fallbackMenu("catering for 50 people on Saturday, lactose-free");
  expect(items.map((i) => i.course)).toEqual(["starter", "main", "dessert", "drinks"]);
  expect(items[1].description).toContain("lactose-free");
});

test("fallback edits: remove and swap", () => {
  const menu = fallbackMenu(CRAYFISH);
  expect(fallbackEdit(menu, "remove the dessert").items.map((i) => i.course)).toEqual(["starter", "main", "drinks"]);
  const swapped = fallbackEdit(menu, "swap champagne for sparkling wine").items;
  expect(swapped[3].title).toBe("Sparkling wine");
  expect(swapped.slice(0, 3)).toEqual(menu.slice(0, 3));
});

test("POST /api/menu uses the LLM and passes the current menu and instruction through", async () => {
  let seen: MenuInput | null = null;
  const llm: Llm = {
    draft: async () => { throw new Error("unused"); },
    pick: async () => { throw new Error("unused"); },
    menu: async (input) => { seen = input; return { items: [{ title: "Vegetable terrine", description: "x", course: "starter" }], reply: "Made the starter vegetarian." }; },
  };
  setLlm(llm);
  const current = [{ title: "Crayfish with dill", description: "y", course: "starter" }];
  const r = await post({ request: CRAYFISH, current, instruction: "make the starter vegetarian" });
  expect(r.status).toBe(200);
  const body = await r.json();
  expect(body.planner).toBe("llm");
  expect(body.items[0].title).toBe("Vegetable terrine");
  expect(seen!.current).toEqual(current);
  expect(seen!.instruction).toBe("make the starter vegetarian");
});

test("POST /api/menu falls back when the LLM fails, and rejects bad bodies", async () => {
  setLlm({ draft: async () => { throw new Error("x"); }, pick: async () => { throw new Error("x"); }, menu: async () => { throw new Error("down"); } });
  const ok = await (await post({ request: CRAYFISH })).json();
  expect(ok.planner).toBe("fallback");
  expect(ok.items).toHaveLength(4);
  expect((await post({ request: "  " })).status).toBe(400);
  expect((await post({ request: "x", current: [{ title: 1 }] })).status).toBe(400);
});
