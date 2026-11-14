// Planner + mandate + orders, with the Valio API and the LLM mocked (fast, offline).
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { app } from "./app";
import { events, resetAudit } from "./audit";
import { loadCatalog } from "./catalog";
import { setLlm, type Llm } from "./llm";
import { evaluate, getMandate, setMandate } from "./policy";
import { fallbackDraft, salesQty } from "./plan";
import { resetStore } from "./store";
import { setFetcher } from "./valio";

// sku -> mock behaviour. Default: deliverable Stock item, €10 per 1 kg pack.
type Mock = {
  price?: number;
  cmp?: number;
  unit?: string;
  deliverable?: boolean;
  cutoff?: boolean;
  amount?: number;
};
let mocks: Record<string, Mock> = {};
let calls = 0;
const fakeFetch = (async (url: string, init: any) => {
  calls++;
  const body = JSON.parse(init.body);
  const ep = String(url).endsWith("/price") ? "price" : "availability";
  const products = body.products.map((id: string) => {
    const m = {
      price: 10,
      cmp: 10,
      unit: "KG",
      deliverable: true,
      cutoff: false,
      amount: 999999,
      ...mocks[id],
    };
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
        comparisonPrice: { value: m.cmp },
        comparisonUnit: m.unit,
        tax: { taxRate: 13.5 },
      };
    return {
      productId: id,
      salesBlock: false,
      logisticModel: "Stock",
      closingTime: m.cutoff
        ? "2020-01-01T12:00:00+0200"
        : "2099-01-01T12:00:00+0200",
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

beforeAll(() => {
  loadCatalog();
  process.env.VALIO_API_KEY ??= "test";
});
beforeEach(() => {
  mocks = {};
  calls = 0;
  setFetcher(fakeFetch);
  setLlm(null); // no key -> fallback planner
  resetStore();
  resetAudit();
});

describe("mandate (pure)", () => {
  const m = getMandate("123");
  test("within limits -> agent_may_order", () =>
    expect(
      evaluate(m, { total: 400, openSwaps: [], dailySoFar: 0 }).state,
    ).toBe("agent_may_order"));
  test("open swap -> needs_your_ok, even under the limit", () => {
    const r = evaluate(m, {
      total: 50,
      openSwaps: [{ name: "Salmon", text: "no delivery" }],
      dailySoFar: 0,
    });
    expect(r.state).toBe("needs_your_ok");
    expect(r.reasons[0]).toContain("Salmon");
  });
  test("swap chosen by an agent still needs the buyer's OK", () =>
    expect(
      evaluate(m, {
        total: 50,
        openSwaps: [],
        undecidedBy: ["agent-kaleva"],
        dailySoFar: 0,
      }).state,
    ).toBe("needs_your_ok"));
  test("over €500 -> needs_approval with a plain reason", () => {
    const r = evaluate(m, { total: 534.45, openSwaps: [], dailySoFar: 0 });
    expect(r.state).toBe("needs_approval");
    expect(r.reasons[0]).toBe(
      "€534.45 is €34.45 over your €500.00 per-order limit, so Mikko L. approves it.",
    );
  });
  test("daily limit", () =>
    expect(
      evaluate(m, { total: 450, openSwaps: [], dailySoFar: 1350 }).state,
    ).toBe("needs_approval"));
});

describe("units", () => {
  test("packs round up", () =>
    expect(
      salesQty(
        { qty: 7, unit: "KG" },
        { qty: 2.5, unit: "KG", byWeight: false },
      ),
    ).toMatchObject({ qty: 3, text: "3 × 2.5 kg" }));
  test("catch weight by kg", () =>
    expect(
      salesQty({ qty: 7, unit: "KG" }, { qty: 1, unit: "KG", byWeight: true })
        .qty,
    ).toBe(7));
});

describe("fallback planner", () => {
  test("demo menu: 3 dishes, valid basket, labelled fallback, 1 stock call", async () => {
    const r = await post("/api/basket", {
      request: "Catering for 50 people: salmon soup, rye bread, blueberry pie",
      date: "2026-11-20",
      customer: "123",
    });
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.planner).toBe("fallback");
    expect(b.dishes.map((d: any) => d.id)).toEqual([
      "salmon-soup",
      "rye-bread",
      "blueberry-pie",
    ]);
    expect(b.lines.length).toBe(12);
    expect(b.apiCalls).toBe(2); // price + availability, once, for all chosen SKUs
    const salmon = b.lines.find((l: any) => l.sku === "461814");
    expect(salmon.why).toBe("50 × 140 g = 7 kg → 7 kg (sold by kg)");
    expect(b.assumed).toContain("salt");
    expect(b.mandate.state).toBe(
      b.total > 500 ? "needs_approval" : "agent_may_order",
    );
    for (const l of b.lines)
      expect(l.total).toBeCloseTo(l.qty * l.stock.price, 2);
  });
  test("1000 L lactose-free milk", () => {
    const d = fallbackDraft("Order 1000 L lactose-free milk for Friday");
    expect(d.needs[0]).toMatchObject({
      totalQty: 1000,
      totalUnit: "l",
      pinned: expect.arrayContaining(["464073"]),
    });
  });
  test("undeliverable line gets ranked options, stock-checked in one extra call", async () => {
    mocks["461814"] = { deliverable: false };
    mocks["462150"] = { price: 14 };
    mocks["461883"] = { price: 12, cutoff: true };
    const b = await (
      await post("/api/basket", { request: "50 people", date: "2026-11-20" })
    ).json();
    const l = b.lines.find((x: any) => x.sku === "461814");
    expect(l.issue.kind).toBe("unavailable");
    expect(l.issue.options.map((o: any) => o.sku)).not.toContain("461883"); // cut-off passed: not a real option
    expect(l.issue.options.length).toBeGreaterThan(0);
    expect(l.issue.options.length).toBeLessThanOrEqual(3);
    expect(b.apiCalls).toBe(4);
    expect(b.mandate.state).toBe("needs_your_ok");
  });
});

describe("orders", () => {
  const cheapMilk = async (litres: number) => {
    mocks["464073"] = { price: 1, cmp: 1, unit: "L" };
    return (
      await post("/api/basket", {
        request: `${litres} L lactose-free milk`,
        date: "2026-11-20",
        customer: "c1",
      })
    ).json();
  };

  test("same-use swap is made by the gateway under the mandate rule and logged", async () => {
    mocks["464073"] = { deliverable: false };
    mocks["464201"] = { price: 1, cmp: 1, unit: "L" };
    mocks["463380"] = { deliverable: false };
    mocks["464119"] = { deliverable: false };
    const b = await (
      await post("/api/basket", {
        request: "100 L lactose-free milk",
        date: "2026-11-20",
        customer: "c0",
      })
    ).json();
    expect(b.lines[0].issue.decided).toBe("464201");
    expect(b.lines[0].issue.decidedBy).toBe("gateway (same-use rule)");
    expect(b.mandate.state).not.toBe("needs_your_ok");
  });

  test("swap requires the buyer's OK before ordering", async () => {
    setMandate("c1", { autoSwapSameUse: false });
    mocks["464073"] = { deliverable: false };
    mocks["464201"] = { price: 1, cmp: 1, unit: "L" };
    mocks["463380"] = { deliverable: false };
    mocks["464119"] = { deliverable: false };
    const b = await (
      await post("/api/basket", {
        request: "100 L lactose-free milk",
        date: "2026-11-20",
        customer: "c1",
      })
    ).json();
    expect(b.lines[0].issue.kind).toBe("unavailable");
    const r = await post(`/api/basket/${b.id}/order`, { by: "Anna K." });
    expect(r.status).toBe(409);
    expect((await r.json()).mandate.state).toBe("needs_your_ok");
    // an agent choosing the swap is not the buyer's OK
    const opt = b.lines[0].issue.options[0].sku;
    const a = await (
      await post(`/api/basket/${b.id}/lines/l1`, {
        chooseOption: opt,
        by: "agent-kaleva",
      })
    ).json();
    expect(a.mandate.state).toBe("needs_your_ok");
    // the buyer choosing it is
    const ok = await (
      await post(`/api/basket/${b.id}/lines/l1`, {
        chooseOption: opt,
        by: "Anna K.",
      })
    ).json();
    expect(ok.lines[0].sku).toBe(opt);
    expect(ok.lines[0].replaced.sku).toBe("464073");
    expect(ok.mandate.state).toBe("agent_may_order");
    const o = await post(`/api/basket/${b.id}/order`, { by: "Anna K." });
    expect(o.status).toBe(201);
    expect((await o.json()).status).toBe("placed");
  });

  test("over €500 needs approval; only the approver decides; approval re-checks prices", async () => {
    const b = await cheapMilk(1000);
    expect(b.total).toBe(1000);
    expect(b.mandate.state).toBe("needs_approval");
    const o = await (
      await post(`/api/basket/${b.id}/order`, { by: "agent-kaleva" })
    ).json();
    expect(o.status).toBe("pending_approval");
    expect(o.pricesHeldUntil).toBeTruthy();
    expect(
      (
        await post(`/api/orders/${o.id}/decision`, {
          decision: "approve",
          by: "Anna K.",
        })
      ).status,
    ).toBe(403);
    mocks["464073"] = { price: 1.1, cmp: 1.1, unit: "L" }; // price moved since the quote
    const d = await (
      await post(`/api/orders/${o.id}/decision`, {
        decision: "approve",
        by: "Mikko L.",
        note: "ok for the event",
      })
    ).json();
    expect(d.status).toBe("placed");
    expect(d.changes[0]).toMatchObject({
      kind: "price",
      was: "€1.00",
      now: "€1.10",
    });
    expect(d.total).toBe(1100);
    const audit = await (await app.request(`/api/orders/${o.id}/audit`)).json();
    expect(audit.map((e: any) => e.kind)).toEqual(
      expect.arrayContaining([
        "request",
        "plan",
        "search",
        "stock",
        "mandate",
        "order",
        "recheck",
        "decision",
      ]),
    );
    expect(audit.find((e: any) => e.kind === "stock").data.calls).toBe(2);
  });

  test("splitting an order to dodge the €500 limit is caught by the daily limit", async () => {
    const placed: string[] = [];
    for (let i = 0; i < 3; i++) {
      const b = await cheapMilk(450);
      const o = await (
        await post(`/api/basket/${b.id}/order`, { by: "agent-kaleva" })
      ).json();
      placed.push(o.status);
    }
    expect(placed).toEqual(["placed", "placed", "placed"]); // 450, 900, 1350
    const b4 = await cheapMilk(450);
    expect(b4.mandate.state).toBe("needs_approval");
    expect(b4.mandate.reasons[0]).toContain("daily limit");
    const o4 = await (
      await post(`/api/basket/${b4.id}/order`, { by: "agent-kaleva" })
    ).json();
    expect(o4.status).toBe("pending_approval");
    const list = await (
      await app.request("/api/orders?status=pending_approval")
    ).json();
    expect(list.map((o: any) => o.id)).toEqual([o4.id]);
  });

  test("qty edit updates totals and the audit log", async () => {
    const b = await cheapMilk(1000);
    const e = await (
      await post(`/api/basket/${b.id}/lines/l1`, { qty: 400, by: "Anna K." })
    ).json();
    expect(e.total).toBe(400);
    expect(e.mandate.state).toBe("agent_may_order");
    expect(
      events(b.id).some((x) => x.kind === "edit" && x.actor === "Anna K."),
    ).toBe(true);
  });

  test("a basket waiting for approval is locked, so the approver approves what they saw", async () => {
    const b = await cheapMilk(600);
    const o = await (
      await post(`/api/basket/${b.id}/order`, { by: "Anna K." })
    ).json();
    expect(o.status).toBe("pending_approval");
    // raising qty or guests after sending is refused
    const edit = await post(`/api/basket/${b.id}/lines/l1`, {
      qty: 5000,
      by: "Anna K.",
    });
    expect(edit.status).toBe(409);
    expect((await edit.json()).error).toContain("waiting for approval");
    expect(
      (await post(`/api/basket/${b.id}/guests`, { people: 500 })).status,
    ).toBe(409);
    const d = await (
      await post(`/api/orders/${o.id}/decision`, {
        decision: "approve",
        by: "Mikko L.",
      })
    ).json();
    expect(d.status).toBe("placed");
    expect(d.total).toBe(600);
  });

  test("a sent-back basket can be edited and re-sent", async () => {
    const b = await cheapMilk(600);
    const o = await (
      await post(`/api/basket/${b.id}/order`, { by: "Anna K." })
    ).json();
    await post(`/api/orders/${o.id}/decision`, {
      decision: "reject",
      by: "Mikko L.",
    });
    const e = await post(`/api/basket/${b.id}/lines/l1`, {
      qty: 400,
      by: "Anna K.",
    });
    expect(e.status).toBe(200);
    expect((await e.json()).total).toBe(400);
  });
});

describe("LLM planner (mocked)", () => {
  test("Claude plan + picks become lines; picks outside the candidate list are ignored", async () => {
    const fake: Llm = {
      draft: async () => ({
        people: 20,
        dishes: [
          {
            id: "soup",
            name: "Salmon soup",
            portions: 20,
            basis: "140 g salmon each",
            diet: ["lactose-free"],
          },
        ],
        needs: [
          {
            id: "salmon",
            dishId: "soup",
            item: "salmon fillet",
            queries: ["salmon fillet"],
            perPortion: 140,
            perPortionUnit: "g",
            totalQty: 2.8,
            totalUnit: "kg",
            diet: [],
          },
          {
            id: "cream",
            dishId: "soup",
            item: "cooking cream",
            queries: ["cooking cream"],
            perPortion: 60,
            perPortionUnit: "ml",
            totalQty: 1.2,
            totalUnit: "l",
            diet: [],
          },
        ],
        assumed: ["salt"],
      }),
      pick: async (_r, needs) => ({
        picks: needs.map((n) => ({
          needId: n.id,
          ranked: ["999999", ...n.candidates.slice(0, 2).map((c) => c.id)],
        })),
      }),
    };
    setLlm(fake);
    const b = await (
      await post("/api/basket", {
        request: "salmon soup for 20",
        date: "2026-11-20",
      })
    ).json();
    expect(b.planner).toBe("llm");
    expect(b.lines.length).toBe(2);
    expect(b.lines.every((l: any) => l.sku !== "999999")).toBe(true);
    const cream = b.lines.find((l: any) => l.needIds.includes("cream"));
    expect(
      cream.contains.includes("milk")
        ? cream.claims.includes("FREE_FROM_LACTOSE")
        : true,
    ).toBe(true); // diet filter applied
  });
});
