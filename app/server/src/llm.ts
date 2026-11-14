// Claude calls for the planner. The LLM only does language work: request -> dishes + needs, and picking the
// best SKU from a short candidate list the SERVER found. It never sees prices/stock and never decides rules.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const MODEL = "claude-opus-5-5";
export const DIET_KEYS = [
  "lactose-free",
  "milk-free",
  "vegan",
  "vegetarian",
  "gluten-free",
] as const;

const Diet = z.enum(DIET_KEYS);
export const DraftSchema = z.object({
  people: z.number().int().describe("number of guests / portions overall"),
  dishes: z.array(
    z.object({
      id: z.string().describe("short slug, e.g. salmon-soup"),
      name: z.string().describe("dish name in English, e.g. Salmon soup"),
      portions: z.number().int(),
      basis: z
        .string()
        .describe(
          'per-portion basis in kitchen terms, e.g. "2.5 dl soup, 140 g salmon each"',
        ),
      diet: z
        .array(Diet)
        .describe(
          "diet constraints that apply to every ingredient of this dish",
        ),
    }),
  ),
  needs: z.array(
    z.object({
      id: z.string().describe("short slug, unique"),
      dishId: z
        .string()
        .nullable()
        .describe(
          "dish this ingredient is for, or null for a plain product order",
        ),
      item: z
        .string()
        .describe(
          'what to buy, short English product noun, e.g. "salmon fillet"',
        ),
      queries: z
        .array(z.string())
        .describe(
          "1-3 catalogue search terms, most specific first; English or Finnish product words only (e.g. 'salmon fillet', 'lohi')",
        ),
      perPortion: z
        .number()
        .nullable()
        .describe("amount per portion, or null if not per portion"),
      perPortionUnit: z.enum(["g", "ml", "pcs"]).nullable(),
      totalQty: z.number().describe("total amount needed for all portions"),
      totalUnit: z.enum(["kg", "l", "pcs"]),
      diet: z
        .array(Diet)
        .describe(
          "extra diet constraints for this ingredient only (usually empty)",
        ),
    }),
  ),
  assumed: z
    .array(z.string())
    .describe(
      "pantry basics a professional kitchen already has and that are NOT ordered (salt, pepper, oil, sugar, flour...)",
    ),
});
export type Draft = z.infer<typeof DraftSchema>;

export const PickSchema = z.object({
  picks: z.array(
    z.object({
      needId: z.string(),
      ranked: z
        .array(z.string())
        .describe(
          "candidate ids that genuinely fit this need, best first, max 6; empty if none fits",
        ),
    }),
  ),
});
export type Picks = z.infer<typeof PickSchema>;

export type Candidate = {
  id: string;
  name: string;
  brand: string;
  cat: string;
  size?: string;
  claims: string[];
  contains: string[];
};
export type PickInput = {
  id: string;
  item: string;
  total: string;
  diet: string[];
  dish?: string;
  candidates: Candidate[];
};

// Chat -> gateway actions (CONTRACT v1.2). Claude only maps words to actions; the gateway runs them.
export const ChatSchema = z.object({
  actions: z.array(
    z.object({
      kind: z.enum([
        "set_guests",
        "set_qty",
        "choose_option",
        "remove_line",
        "add_product",
        "replan",
      ]),
      people: z
        .number()
        .int()
        .nullable()
        .describe("set_guests: new number of guests"),
      lineId: z
        .string()
        .nullable()
        .describe(
          "set_qty / choose_option / remove_line: the line id, e.g. l3",
        ),
      qty: z
        .number()
        .nullable()
        .describe("set_qty: new quantity in sales units"),
      option: z
        .string()
        .nullable()
        .describe(
          'choose_option: an option sku from the open issue of that line, or "keep" or "remove"',
        ),
      change: z
        .string()
        .nullable()
        .describe(
          "replan: the menu change in plain English, e.g. 'add a vegan main'",
        ),
      product: z
        .string()
        .nullable()
        .describe('add_product: short product noun, e.g. "Pepsi"'),
      queries: z
        .array(z.string())
        .nullable()
        .describe(
          "add_product: 1-3 catalogue search terms, English or Finnish, most specific first",
        ),
      amount: z
        .number()
        .nullable()
        .describe("add_product: how many (pcs) or how much (kg / l)"),
      unit: z
        .enum(["pcs", "kg", "l"])
        .nullable()
        .describe(
          'add_product: "pcs" for counted things (bottles, packs, cans, cases)',
        ),
      label: z
        .string()
        .nullable()
        .describe(
          'add_product: the buyer\'s wording, e.g. "2 bottles of Pepsi"',
        ),
      dishId: z
        .string()
        .nullable()
        .describe(
          "add_product: id of the existing dish/category this product clearly belongs to, else null",
        ),
      category: z
        .string()
        .nullable()
        .describe(
          'add_product: when no existing dish fits, a short new category name, e.g. "Drinks", "Snacks", "Bread"',
        ),
    }),
  ),
  question: z
    .string()
    .nullable()
    .describe(
      "a short question back if the text is ambiguous; then actions must be empty",
    ),
});
export type ChatPlan = z.infer<typeof ChatSchema>;

const CHAT_SYSTEM = `You are the order assistant inside the Valio Aimo webshop. A chef types a change to the order basket.
Map the text to gateway actions ONLY, using the basket summary:
- set_guests {people}: change the number of guests (all portion-based quantities rescale).
- set_qty {lineId, qty}: set a line's quantity in sales units (packs).
- choose_option {lineId, option}: decide a line's open issue: an option sku listed for that line, "keep" (take what is in stock) or "remove".
- remove_line {lineId}: drop a product from the basket.
- add_product {product, queries, amount, unit, label, dishId, category}: the buyer names a product to add ("add 2 bottles of Pepsi as a drink", "3 kg butter too"). Use dishId only if the product is genuinely an ingredient or part of that dish; otherwise dishId null and a short new category (drinks go to "Drinks").
- replan {change}: anything that changes the menu itself (add/replace a dish, a new diet); describe the change. Never use replan to add a single named product.
Never invent line ids or skus. Use null for fields an action does not use. If the text is unclear or asks for
something you cannot map, return no actions and a short question.`;

// Menu step (CONTRACT S35): request -> course list, and natural-language edits of that list. Language work only.
export const COURSES = [
  "starter",
  "main",
  "dessert",
  "drinks",
  "side",
  "snack",
  "other",
] as const;
export const MenuSchema = z.object({
  items: z.array(
    z.object({
      title: z
        .string()
        .describe(
          "dish or drink name in English, e.g. Crayfish with dill and toast",
        ),
      description: z
        .string()
        .describe(
          "one short line: key components and serving, diet notes if any",
        ),
      course: z.enum(COURSES),
    }),
  ),
  reply: z
    .string()
    .describe(
      "one short friendly sentence for the chat saying what you proposed or changed",
    ),
});
export type MenuOut = z.infer<typeof MenuSchema>;
export type MenuItem = MenuOut["items"][number];
export type MenuInput = {
  request: string;
  current?: MenuItem[];
  instruction?: string;
};

const MENU_SYSTEM = `You are the menu assistant inside the Valio Aimo wholesale webshop for professional kitchens in Finland.
A buyer describes an event; you propose the menu they will then buy ingredients for. Prices and stock are checked later, never by you.
- Follow the request's own structure exactly. If they list courses (e.g. "starter, main, dessert and champagne"), return exactly one item per requested course, in that order, unless they ask for more. Read misspellings sensibly ("desert" = dessert).
- Honour the theme and tone. A crayfish party (rapujuhlat) is a Nordic late-summer tradition: crayfish with dill, toast and aioli or a Vasterbotten pie fit it; "fancy" means elevated, restaurant-quality dishes, not snacks.
- Respect every dietary requirement in every item, and say so in the description when it matters.
- Dishes must be cookable by a professional kitchen from wholesale ingredients. Drinks are products (e.g. Champagne, sparkling water).
- No brand or catalogue product names, no prices, no quantities.
- If no structure is given, propose a sensible 3-4 item menu for the occasion.
- When given a CURRENT MENU and an INSTRUCTION: return the WHOLE menu after applying the instruction. Copy untouched items exactly (same title and description). Change, add or remove only what was asked.
- Titles short (max ~6 words). Descriptions one line.`;

export interface Llm {
  draft(
    request: string,
    people: number | undefined,
    date: string,
  ): Promise<Draft>;
  pick(request: string, needs: PickInput[]): Promise<Picks>;
  chat?(text: string, basketSummary: string): Promise<ChatPlan>;
  menu?(input: MenuInput): Promise<MenuOut>;
}

const DRAFT_SYSTEM = `You plan wholesale food orders for professional kitchens in Finland (Valio Aimo webshop).
Turn the buyer's request into dishes and the ingredient quantities to order.
- Use realistic professional portion sizes and state each dish's per-portion basis.
- Every ingredient that must be bought becomes a need with a POSITIVE total quantity in kg, l or pcs.
- EVERY dish/category must have purchasing needs referencing its dish id: include fillings for filled pastries, drinks for the drinks category, chips/candies for snacks, and fruit for fruit categories. Listing a dish without needs is an incomplete plan.
- With dishes present, every need must reference a valid dish id. Use dishId null only for plain product orders with no dishes.
- Before returning, check every approved category is represented in both dishes and purchasing needs; never return only the first category.
- Put pantry basics a kitchen already stocks into "assumed" instead of needs (salt, pepper, oil, sugar, flour, spices, water).
- If the request gives no menu, propose a simple, typical Finnish catering menu of 2-4 dishes that fits it.
- If the request names a plain product and amount (e.g. "1000 L lactose-free milk"), return no dishes and one need with dishId null.
- Diet words in the request (lactose-free, vegan, gluten-free...) become dish or need diet constraints.
- totalQty is the amount of the PRODUCT AS BOUGHT: bouillon or stock powder in kg (about 10 g per litre of soup), never litres of prepared stock; flour, sugar etc. in kg.
- Use kg or l for everything you can (eggs: about 60 g each, in kg); use pcs only for items that are only sold by count.
- Keep it short: at most 6 dishes and 16 needs.`;

const PICK_SYSTEM = `You match ingredient needs to wholesale catalogue products for a professional kitchen.
For each need, rank only the candidate ids that genuinely are that ingredient in a form a kitchen would cook with
(no utensils, no ready meals, no flavoured variants unless asked). Best first: closest match, then sensible pack size
for the total amount. Return an empty list if nothing fits.`;

export class ClaudeLlm implements Llm {
  client = new Anthropic();
  async draft(
    request: string,
    people: number | undefined,
    date: string,
  ): Promise<Draft> {
    const r = await this.client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: betaZodOutputFormat(DraftSchema),
      },
      system: DRAFT_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Request: ${request}\nGuests: ${people ?? "as stated in the request"}\nDelivery date: ${date}`,
        },
      ],
    });
    if (r.stop_reason === "refusal" || !r.parsed_output)
      throw new Error(`planner LLM gave no plan (${r.stop_reason})`);
    return r.parsed_output;
  }
  async pick(request: string, needs: PickInput[]): Promise<Picks> {
    const body = needs
      .map(
        (n) =>
          `NEED ${n.id}: ${n.item} (${n.total}${n.dish ? `, for ${n.dish}` : ""}${n.diet.length ? `, must be ${n.diet.join(", ")}` : ""})\n` +
          n.candidates
            .map(
              (c) =>
                `  ${c.id} | ${c.name} | ${c.brand || "-"} | ${c.cat || "-"} | ${c.size ?? "?"} | ${c.claims.join(",") || "-"} | allergens:${c.contains.join(",") || "-"}`,
            )
            .join("\n"),
      )
      .join("\n\n");
    const r = await this.client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(PickSchema) },
      system: PICK_SYSTEM,
      messages: [
        { role: "user", content: `Order request: ${request}\n\n${body}` },
      ],
    });
    if (r.stop_reason === "refusal" || !r.parsed_output)
      throw new Error(`pick LLM gave no answer (${r.stop_reason})`);
    return r.parsed_output;
  }

  async chat(text: string, basketSummary: string): Promise<ChatPlan> {
    const r = await this.client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ChatSchema) },
      system: CHAT_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Basket:
${basketSummary}

Chef: ${text}`,
        },
      ],
    });
    if (r.stop_reason === "refusal" || !r.parsed_output)
      throw new Error(`chat LLM gave no answer (${r.stop_reason})`);
    return r.parsed_output;
  }

  async menu(input: MenuInput): Promise<MenuOut> {
    const content = input.current?.length
      ? `Event request: ${input.request}\n\nCURRENT MENU:\n${input.current.map((i) => `- [${i.course}] ${i.title}: ${i.description}`).join("\n")}\n\nINSTRUCTION: ${input.instruction ?? ""}`
      : `Event request: ${input.request}`;
    const r = await this.client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(MenuSchema) },
      system: MENU_SYSTEM,
      messages: [{ role: "user", content }],
    });
    if (r.stop_reason === "refusal" || !r.parsed_output)
      throw new Error(`menu LLM gave no answer (${r.stop_reason})`);
    return r.parsed_output;
  }
}

let llm: Llm | null | undefined;
/** null = no key: the planner uses its labelled deterministic fallback. */
export function getLlm(): Llm | null {
  if (llm === undefined)
    llm = process.env.ANTHROPIC_API_KEY ? new ClaudeLlm() : null;
  return llm;
}
export const setLlm = (l: Llm | null) => (llm = l);
