// CONTRACT v1.2: guests rescale, chat -> actions, product image lookup. Valio API, LLM and valioaimo.fi mocked.
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "./app";
import { events, resetAudit } from "./audit";
import { getProduct, loadCatalog } from "./catalog";
import { parseFallback } from "./chat";
import { setImageCacheFile, setImageFetcher } from "./images";
import { setLlm, type Llm } from "./llm";
import { setMandate } from "./policy";
import { eur } from "./policy";
import { resetStore } from "./store";
import { setFetcher } from "./valio";

type Mock = { price?: number; deliverable?: boolean; amount?: number };
let mocks: Record<string, Mock> = {};
let calls = 0;
const fakeFetch = (async (url: string, init: any) => {
  calls++;
  const body = JSON.parse(init.body);
  const ep = String(url).endsWith("/price") ? "price" : "availability";
  const products = body.products.map((id: string) => {
    const m = { price: 10, deliverable: true, amount: 999999, ...mocks[id] };
    if (ep === "price")
      return {
        productId: id,
        netPriceFound: true,
        error: false,
        catalogPrice: {
          value: m.price,
          valueWithTax: m.price * 1.135,
          validTo: "2026-12-31",
        },
        comparisonPrice: { value: m.price },
        comparisonUnit: "KG",
        tax: { taxRate: 13.5 },
      };
    return {
      productId: id,
      salesBlock: false,
      logisticModel: "Stock",
      closingTime: "2099-01-01T12:00:00+0200",
      scheduleLines: m.deliverable
        ? [
            {
              salesBlock: false,
              availableAmount: m.amount,
              availableDate: "2026-11-16",
              salesUnit: "ST",
            },
          ]
        : [],
    };
  });
  return new Response(
    JSON.stringify(
      ep === "price"
        ? { products }
        : { timeNow: new Date().toISOString(), products },
    ),
  );
}) as unknown as typeof fetch;

const post = (path: string, body: object) =>
  app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const newBasket = async () =>
  (
    await post("/api/basket", {
      request: "Catering for 50 people",
      date: "2026-11-20",
    })
  ).json();

beforeAll(() => {
  loadCatalog();
  process.env.VALIO_API_KEY ??= "test";
});
beforeEach(() => {
  mocks = {};
  calls = 0;
  setFetcher(fakeFetch);
  setLlm(null);
  resetStore();
  resetAudit();
});

describe("guests rescale", () => {
  test("50 -> 60: quantities, why text, kept swap, mandate, one stock call, audit", async () => {
    mocks["461814"] = { deliverable: false }; // salmon fillet: needs a swap
    const b = await newBasket();
    const salmon = b.lines.find((l: any) => l.sku === "461814");
    const opt = salmon.issue.options[0];
    const decided = await (
      await post(`/api/basket/${b.id}/lines/${salmon.id}`, {
        chooseOption: opt.sku,
        by: "Anna K.",
      })
    ).json();
    const potatoes = decided.lines.find((l: any) => l.why.includes("150 g"));
    calls = 0;

    const r = await post(`/api/basket/${b.id}/guests`, { people: 60 });
    expect(r.status).toBe(200);
    const g = await r.json();
    expect(g.people).toBe(60);
    expect(g.dishes.every((d: any) => d.portions === 60)).toBe(true);
    const p2 = g.lines.find((l: any) => l.id === potatoes.id);
    expect(p2.why).toContain("60 × 150 g = 9 kg");
    expect(p2.qty).toBeGreaterThan(potatoes.qty);
    // decided swap kept: still the chosen product, decision kept, rescaled for 60
    const s2 = g.lines.find((l: any) => l.id === salmon.id);
    expect(s2.sku).toBe(opt.sku);
    expect(s2.issue.decided).toBe(opt.sku);
    expect(s2.replaced.sku).toBe("461814");
    expect(s2.why).toContain("60 × 140 g = 8.4 kg");
    // totals + mandate recomputed
    expect(g.total).toBeGreaterThan(decided.total);
    expect(g.openIssues).toBe(0);
    expect(g.mandate.state).toBe("needs_your_ok"); // fixture lacks verified quantity/diet data
    expect(g.mandate.reasons.length).toBeGreaterThan(0);
    expect(calls).toBe(2); // ONE stock check = price + availability
    expect(
      events(b.id).some(
        (e) => e.kind === "guests" && e.summary.startsWith("50 → 60 guests"),
      ),
    ).toBe(true);
  });

  test("more guests than stock -> the line gets a short issue", async () => {
    const b = await newBasket();
    const l = b.lines.find((x: any) => x.why.includes("150 g"));
    mocks[l.sku] = { amount: l.qty }; // exactly enough for 50
    setMandate(b.customer, { autoSwapSameUse: false }); // test the shortage itself, not the same-use rule
    const g = await (
      await post(`/api/basket/${b.id}/guests`, { people: 80 })
    ).json();
    const l2 = g.lines.find((x: any) => x.id === l.id);
    expect(l2.issue.kind).toBe("short");
    expect(g.mandate.state).toBe("needs_your_ok");
  });

  test("bad people -> 400, unknown basket -> 404", async () => {
    const b = await newBasket();
    expect(
      (await post(`/api/basket/${b.id}/guests`, { people: 0 })).status,
    ).toBe(400);
    expect(
      (await post(`/api/basket/${b.id}/guests`, { people: 2001 })).status,
    ).toBe(400);
    expect((await post(`/api/basket/nope/guests`, { people: 10 })).status).toBe(
      404,
    );
  });
});

describe("chat", () => {
  test("fallback parser: guests, option by name, remove, unclear", async () => {
    mocks["461814"] = { deliverable: false };
    const b = await newBasket();
    const salmon = b.lines.find((l: any) => l.sku === "461814");
    const opt = salmon.issue.options[0];
    expect(parseFallback("make it 60 guests", b).actions[0]).toMatchObject({
      kind: "set_guests",
      people: 60,
    });
    expect(
      parseFallback(`use the ${opt.name} instead`, b).actions[0],
    ).toMatchObject({
      kind: "choose_option",
      lineId: salmon.id,
      option: opt.sku,
    });
    expect(parseFallback("hello there", b).question).toBeTruthy();
  });

  test("chat endpoint without Claude: guests then swap, as the buyer", async () => {
    mocks["461814"] = { deliverable: false };
    const b = await newBasket();
    const salmon = b.lines.find((l: any) => l.sku === "461814");
    const opt = salmon.issue.options[0];
    const r1 = await (
      await post(`/api/basket/${b.id}/chat`, { text: "60 guests please" })
    ).json();
    expect(r1.actions[0].kind).toBe("set_guests");
    expect(r1.basket.people).toBe(60);
    expect(r1.reply).toContain("Guests 50 → 60");
    const r2 = await (
      await post(`/api/basket/${b.id}/chat`, { text: `use ${opt.name}` })
    ).json();
    expect(r2.actions[0].kind).toBe("choose_option");
    const s = r2.basket.lines.find((l: any) => l.id === salmon.id);
    expect(s.sku).toBe(opt.sku);
    expect(s.issue.decidedBy).toBe("buyer");
    expect(r2.reply).toContain(eur(r2.basket.total));
    const r3 = await (
      await post(`/api/basket/${b.id}/chat`, { text: "what?" })
    ).json();
    expect(r3.actions).toEqual([]);
    expect(r3.question).toBeTruthy();
  });

  test("Claude's actions run through the real handlers", async () => {
    const b = await newBasket();
    const l = b.lines[0];
    const fake: Llm = {
      draft: async () => {
        throw new Error("unused");
      },
      pick: async () => ({ picks: [] }),
      chat: async () => ({
        actions: [
          {
            kind: "set_qty",
            lineId: l.id,
            qty: l.qty + 2,
            people: null,
            option: null,
            change: null,
          },
        ],
        question: null,
      }),
    };
    setLlm(fake);
    const r = await (
      await post(`/api/basket/${b.id}/chat`, {
        text: "two more of the first one",
      })
    ).json();
    expect(r.basket.lines[0].qty).toBe(l.qty + 2);
    expect(events(b.id).some((e) => e.kind === "edit")).toBe(true);
  });
});

describe("product image", () => {
  test("served from cache without a lookup; unknown sku -> null; a miss is looked up once and cached", async () => {
    const dir = mkdtempSync(join(tmpdir(), "img-"));
    const file = join(dir, "images.cache.json");
    const a = getProduct("461814")!;
    const c = getProduct("462150")!;
    writeFileSync(
      file,
      JSON.stringify({
        [a.gtin]: { img: "https://img/x.png", title: "x", page: null, at: "t" },
      }),
    );
    setImageCacheFile(file);
    let lookups = 0;
    setImageFetcher((async () => {
      lookups++;
      return new Response(
        JSON.stringify({
          count: 1,
          items: [{ title: "y", url: "/p/y", image: "https://img/y.png" }],
        }),
      );
    }) as unknown as typeof fetch);
    const get = async (sku: string) =>
      (await app.request(`/api/products/${sku}/image`)).json();
    expect(await get("461814")).toEqual({ url: "https://img/x.png" });
    expect(lookups).toBe(0);
    expect(await get("000000")).toEqual({ url: null });
    expect(await get("462150")).toEqual({ url: "https://img/y.png" });
    expect(await get("462150")).toEqual({ url: "https://img/y.png" });
    expect(lookups).toBe(1);
    expect(JSON.parse(readFileSync(file, "utf8"))[c.gtin].img).toBe(
      "https://img/y.png",
    );
  });
});
