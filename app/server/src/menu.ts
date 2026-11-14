// Menu step (CONTRACT S35): request -> proposed menu, and natural-language edits of it.
// Language work only: no catalogue, price or stock calls. Claude when a key is set; otherwise a labelled
// deterministic fallback that follows the course words in the request.
import { getLlm, COURSES, type MenuItem, type MenuInput } from "./llm";
import { HttpError } from "./plan";

export type MenuResult = {
  items: MenuItem[];
  reply: string;
  planner: "llm" | "fallback";
};
type Course = MenuItem["course"];

const COURSE_WORDS: [RegExp, Course, string | null][] = [
  [/\b(starters?|appeti[sz]ers?|entr[eé]es?|first course)\b/i, "starter", null],
  [/\b(mains?|main course|main dish)\b/i, "main", null],
  [/\b(desserts?|deserts?|sweets?|puddings?)\b/i, "dessert", null],
  [/\bchampagne\b/i, "drinks", "Champagne"],
  [/\b(sparkling wine|prosecco|cava)\b/i, "drinks", "Sparkling wine"],
  [/\bwine\b/i, "drinks", "Wine"],
  [/\bcoffee\b/i, "drinks", "Coffee and tea"],
  [/\bjuice\b/i, "drinks", "Juice"],
  [/\b(drinks?|beverages?)\b/i, "drinks", "Drinks"],
];
const GENERIC: Record<Course, [string, string]> = {
  starter: ["Starter", "A light first course for the guests."],
  main: ["Main course", "A warm main dish with a side."],
  dessert: ["Dessert", "A plated or shared dessert."],
  drinks: ["Drinks", "Drinks in portions suitable for the guest count."],
  side: ["Side", "A side dish."],
  snack: ["Snacks", "Something to share."],
  other: ["Item", "Choose suitable products."],
};
// Small theme table: only used when no LLM is configured.
const THEMES: [RegExp, Partial<Record<Course, [string, string]>>][] = [
  [
    /crayfish|rapu/i,
    {
      starter: [
        "Crayfish with dill and toast",
        "Whole crayfish cooked in dill brine, served with toast and aioli.",
      ],
      main: [
        "Vasterbotten cheese pie",
        "Savoury cheese pie, the classic crayfish-party main, with green salad.",
      ],
      dessert: [
        "Lingonberry parfait",
        "Frozen lingonberry parfait with a crumble topping.",
      ],
    },
  ],
  [
    /salmon|lohi/i,
    { main: ["Creamy salmon soup", "Salmon soup with potatoes and dill."] },
  ],
  [
    /christmas|joulu/i,
    {
      starter: ["Rosolli and gravlax", "Beetroot salad with cured salmon."],
      main: ["Christmas ham", "Oven-baked ham with root vegetable casseroles."],
      dessert: [
        "Rice porridge with plum kisel",
        "Christmas rice porridge with plum kisel.",
      ],
    },
  ],
  [
    /\b(bbq|grill|barbecue)\b/i,
    {
      main: [
        "Grilled chicken and sausages",
        "Grilled meats with potato salad.",
      ],
    },
  ],
];
const DIET =
  /\b(lactose[- ]free|milk[- ]free|vegan|vegetarian|gluten[- ]free)\b/gi;

function themed(request: string, course: Course): [string, string] | null {
  for (const [re, t] of THEMES)
    if (re.test(request) && t[course]) return t[course]!;
  return null;
}

export function fallbackMenu(request: string): MenuItem[] {
  const found: { at: number; course: Course; title: string | null }[] = [];
  for (const [re, course, title] of COURSE_WORDS) {
    const m = re.exec(request);
    if (!m) continue;
    if (course === "drinks" && found.some((f) => f.course === "drinks"))
      continue; // first, most specific drink wins
    found.push({ at: m.index, course, title });
  }
  found.sort((a, b) => a.at - b.at);
  const diets = [
    ...new Set(
      (request.match(DIET) ?? []).map((d) => d.toLowerCase().replace(" ", "-")),
    ),
  ];
  const dietNote = diets.length ? ` Make it ${diets.join(", ")}.` : "";
  if (found.length)
    return found.map(({ course, title }) => {
      const [t, d] = title
        ? [title, GENERIC.drinks[1]]
        : (themed(request, course) ?? GENERIC[course]);
      return {
        title: t,
        description: d + (course === "drinks" ? "" : dietNote),
        course,
      };
    });
  // A plain list ("salmon soup, rye bread and blueberry pie") becomes one item per entry.
  if (
    request.includes(":") ||
    !/catering|event|party|restock|guests|people/i.test(request)
  ) {
    const list = (request.split(":")[1] ?? request)
      .split(/[.;]/)[0]
      .split(/,|\s+and\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length)
      return list.map((title) => ({
        title: title[0].toUpperCase() + title.slice(1),
        description: "Select products and quantities for this item.",
        course: "other",
      }));
  }
  return (["starter", "main", "dessert", "drinks"] as Course[]).map(
    (course) => {
      const [title, description] = themed(request, course) ?? GENERIC[course];
      return {
        title,
        description: description + (course === "drinks" ? "" : dietNote),
        course,
      };
    },
  );
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[.!?]+$/, "")
    .trim();
const matches = (item: MenuItem, what: string) => {
  const w = norm(what);
  return (
    item.title.toLowerCase().includes(w) ||
    w.includes(item.title.toLowerCase()) ||
    item.course === w.replace(/\s*course$/, "") ||
    (w === "desert" && item.course === "dessert")
  );
};

export function fallbackEdit(
  current: MenuItem[],
  instruction: string,
): { items: MenuItem[]; reply: string } {
  const text = instruction.trim();
  const swap = text.match(
    /^(?:replace|swap|change)\s+(.+?)\s+(?:with|for|to)\s+(.+)$/i,
  );
  if (swap) {
    const target = current.find((i) => matches(i, swap[1]));
    if (target) {
      const title = norm(swap[2]).replace(/^./, (c) => c.toUpperCase());
      return {
        items: current.map((i) =>
          i === target
            ? { ...i, title, description: "Select products for this item." }
            : i,
        ),
        reply: `Swapped ${target.title} for ${title}.`,
      };
    }
  }
  const remove = text.match(
    /^(?:remove|skip|drop|no|leave out|delete)\s+(.+)$/i,
  );
  if (remove) {
    const kept = current.filter((i) => !matches(i, remove[1]));
    if (kept.length < current.length)
      return {
        items: kept,
        reply: `Removed ${current
          .filter((i) => !kept.includes(i))
          .map((i) => i.title)
          .join(", ")}.`,
      };
  }
  const add = text.match(
    /^(?:(?:please|also)\s+)*(?:add|include)?\s*(?:also\s+)?(.+)$/i,
  );
  if (add && !swap && !remove) {
    const title = norm(add[1]).replace(/^./, (c) => c.toUpperCase());
    const course = COURSE_WORDS.find(([re]) => re.test(title))?.[1] ?? "other";
    if (
      title &&
      !current.some((i) => i.title.toLowerCase() === title.toLowerCase())
    )
      return {
        items: [
          ...current,
          { title, description: "Select products for this item.", course },
        ],
        reply: `Added ${title}.`,
      };
  }
  return {
    items: current,
    reply: "I couldn't apply that offline. Try add, remove, or swap X for Y.",
  };
}

const isItem = (x: unknown): x is MenuItem =>
  !!x &&
  typeof (x as MenuItem).title === "string" &&
  typeof (x as MenuItem).description === "string" &&
  (COURSES as readonly string[]).includes((x as MenuItem).course);

export function parseMenuInput(body: unknown): MenuInput {
  const b = body as Partial<MenuInput> | null;
  if (!b || typeof b.request !== "string" || !b.request.trim())
    throw new HttpError(400, "request required");
  if (
    b.current !== undefined &&
    (!Array.isArray(b.current) || !b.current.every(isItem))
  )
    throw new HttpError(
      400,
      "current must be a list of {title, description, course}",
    );
  if (b.instruction !== undefined && typeof b.instruction !== "string")
    throw new HttpError(400, "instruction must be a string");
  if (b.current && !b.instruction?.trim())
    throw new HttpError(400, "instruction required with current");
  return {
    request: b.request.trim().slice(0, 2000),
    current: b.current,
    instruction: b.instruction?.trim().slice(0, 500),
  };
}

export async function suggestMenu(input: MenuInput): Promise<MenuResult> {
  const llm = getLlm();
  if (llm?.menu) {
    try {
      const out = await llm.menu(input);
      if (out.items.length || input.current) return { ...out, planner: "llm" };
    } catch (e) {
      console.error("menu LLM failed, using fallback:", (e as Error).message);
    }
  }
  if (input.current)
    return {
      ...fallbackEdit(input.current, input.instruction ?? ""),
      planner: "fallback",
    };
  const items = fallbackMenu(input.request);
  return {
    items,
    reply: `Here's a starting menu: ${items.map((i) => i.title).join(", ")}. Change anything you like.`,
    planner: "fallback",
  };
}
