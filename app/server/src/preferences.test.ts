// S48 purchase memory, preferences vs permissions, usual order, exception-first summary.
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { app } from "./app";
import { events, resetAudit } from "./audit";
import { getProduct, loadCatalog } from "./catalog";
import { CREAM_A, CREAM_B, CREAM_C, historyOrders } from "./history";
import { purchasingIntent } from "./intent";
import { setLlm } from "./llm";
import { editLine, rankOptions, type Basket, type Option } from "./plan";
import {
  getMandate,
  resetMandates,
  resetPermissions,
  setMandate,
} from "./policy";
import {
  acceptedCount,
  preferenceOf,
  rankByPreference,
  recordPreference,
} from "./preferences";
import { orders, resetStore } from "./store";
import { blockingChecks } from "./validation";
import { setFetcher, type StockLine } from "./valio";

type Mock = {
  price?: number;
  deliverable?: boolean;
  cutoff?: boolean;
  amount?: number;
};
let mocks: Record<string, Mock> = {};
let calls = 0;
let deliverByDefault = true;

beforeAll(() => {
  loadCatalog();
  process.env.VALIO_API_KEY ??= "test";
  setFetcher((async (url: string, init: RequestInit) => {
    calls++;
    const ids = JSON.parse(String(init.body)).products as string[];
    const pricing = String(url).endsWith("/price");
    const products = ids.map((productId) => {
      const m = mocks[productId] ?? {};
      const p = getProduct(productId);
      const per = m.price ?? 2; // EUR per litre/kg, so pack sizes compare fairly
      const pack = p?.content?.qty ?? 1;
      if (pricing)
        return {
          productId,
          netPriceFound: true,
          catalogPrice: {
            value: Math.round(per * pack * 100) / 100,
            valueWithTax: Math.round(per * pack * 113.5) / 100,
          },
          comparisonPrice: { value: per },
          comparisonUnit: p?.content?.unit ?? "KG",
          tax: { taxRate: 13.5 },
        };
      const ok = m.deliverable ?? deliverByDefault;
      return {
        productId,
        closingTime: m.cutoff
          ? "2026-11-12T15:00:00+0200"
          : "2099-01-01T12:00:00Z",
        scheduleLines: ok
          ? [
              {
                availableDate: "2026-11-16",
                availableAmount: m.amount ?? 5000,
                salesUnit: "ST",
              },
            ]
          : [],
      };
    });
    return new Response(
      JSON.stringify({ timeNow: "2026-11-14T12:00:00Z", products }),
    );
  }) as unknown as typeof fetch);
});
beforeEach(() => {
  resetStore();
  resetAudit();
  resetPermissions();
  resetMandates();
  // These tests cover the buyer's own choices, permissions and memory: keep S51 auto-pick out of the way.
  setMandate("123", { autoPickReplacement: false });
  setLlm(null);
  mocks = { [CREAM_A]: { cutoff: true } }; // the usual cream misses its cut-off, like the real mock API
  calls = 0;
  deliverByDefault = true;
  delete process.env.DEV_TOOLS;
});

const post = (path: string, body: object) =>
  app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const usual = async (request = "Prepare my usual weekend order.") => {
  const r = await post("/api/basket", { request, date: "2026-11-16" });
  expect(r.status).toBe(200);
  return (await r.json()) as Basket;
};
const creamLine = (b: Basket) =>
  b.lines.find((l) => l.replaced?.sku === CREAM_A || l.sku === CREAM_A)!;
const usualSkus = () => {
  const n = new Map<string, number>();
  for (const o of historyOrders("123"))
    for (const l of o.lines) n.set(l.sku, (n.get(l.sku) ?? 0) + 1);
  return [...n]
    .filter(([, c]) => c >= 4)
    .map(([s]) => s)
    .sort();
};

describe("preference memory", () => {
  test("synthetic history is deterministic, labelled and in range", () => {
    const orders = historyOrders("123");
    expect(orders).toHaveLength(8);
    expect(orders[0].date).toBe("2026-09-25");
    expect(orders[7].date).toBe("2026-11-13");
    for (const o of orders) {
      expect(o.synthetic).toBe(true);
      expect(o.lines.length).toBeGreaterThanOrEqual(10);
      expect(o.lines.length).toBeLessThanOrEqual(15);
      for (const l of o.lines) expect(getProduct(l.sku)).toBeTruthy();
    }
    expect(historyOrders("someone-else")).toHaveLength(0);
  });

  test("frequent products rank before unfamiliar ones; reasons are plain facts", () => {
    const milk = preferenceOf("123", "469549");
    expect(milk).toMatchObject({
      status: "usual",
      reason: "Purchased in 8 of your last 8 orders",
      orders: 8,
      of: 8,
    });
    expect(JSON.stringify(milk)).not.toMatch(/%|confidence/i);
    expect(preferenceOf("123", "464306")).toMatchObject({
      status: "unfamiliar",
      reason: "New to your restaurant",
    });
    expect(rankByPreference("123", ["464306", "469549"])).toEqual([
      "469549",
      "464306",
    ]);
  });

  test("accepted alternatives rank before rejected ones", () => {
    const b = preferenceOf("123", CREAM_B, CREAM_A);
    expect(b.status).toBe("accepted_alternative");
    expect(b.accepted).toBe(3);
    expect(b.reason).toBe(
      `You've accepted this instead of ${getProduct(CREAM_A)!.en} 3 times`,
    );
    expect(preferenceOf("123", CREAM_C, CREAM_A)).toMatchObject({
      status: "rejected",
      reason: "You previously declined this option",
    });
    expect(
      rankByPreference("123", [CREAM_C, "463797", CREAM_B], CREAM_A),
    ).toEqual([CREAM_B, "463797", CREAM_C]);
  });

  test("a rejected product stays proposable (needs review), it is never dropped", async () => {
    // only the two creams this restaurant knows can be delivered as replacements
    deliverByDefault = false;
    for (const s of [...usualSkus(), CREAM_B, CREAM_C])
      mocks[s] = { ...mocks[s], deliverable: true };
    mocks[CREAM_A] = { cutoff: true, deliverable: true };
    const b = await usual();
    const line = creamLine(b);
    expect(line.issue?.decided).toBeUndefined();
    expect(line.issue!.options.map((o) => o.sku)).toEqual([CREAM_B, CREAM_C]);
    expect(line.issue!.options[1].preference?.status).toBe("rejected");
  });

  test("prohibited products are never auto-selected or proposed, even with a permission", async () => {
    recordPreference({ customer: "123", kind: "prohibited", sku: CREAM_B });
    await post("/api/permissions", {
      fromSku: CREAM_A,
      toSku: CREAM_B,
      maxIncreasePct: 50,
    });
    expect(rankByPreference("123", [CREAM_B, CREAM_C])).toEqual([CREAM_C]);
    const b = await usual();
    const line = creamLine(b);
    expect(line.sku).toBe(CREAM_A);
    expect(line.issue?.decided).toBeUndefined();
    expect(line.issue!.options.some((o) => o.sku === CREAM_B)).toBe(false);
  });

  test("preference never overrides allergen safety, stock or delivery", () => {
    const st = (deliverable: boolean): StockLine => ({
      sku: "x",
      price: 1,
      priceWithTax: 1.1,
      taxRate: 10,
      customerPrice: true,
      available: 10,
      availableDate: "2026-11-16",
      closingTime: "2099-01-01T00:00:00Z",
      cutoffPassed: false,
      deliverable,
      status: "ok",
      salesUnit: "ST",
    });
    const opt = (
      sku: string,
      contains: string[],
      deliverable = true,
    ): Option => ({
      sku,
      name: sku,
      reason: "",
      delta: 0,
      qty: 1,
      pack: "1 l",
      why: "",
      total: 1,
      stock: { ...st(deliverable), sku },
      contains,
    });
    // usual milk adds an allergen the original did not have: the unfamiliar allergen-safe option wins
    let ranked = rankOptions([opt("469549", ["milk"]), opt("464306", [])], [], {
      customer: "123",
      forSku: "000000",
    });
    expect(ranked.map((o) => o.sku)).toEqual(["464306", "469549"]);
    // the usual product that cannot be delivered is not offered at all
    ranked = rankOptions([opt("469549", [], false), opt("464306", [])], [], {
      customer: "123",
      forSku: "000000",
    });
    expect(ranked.map((o) => o.sku)).toEqual(["464306"]);
  });

  test("usual cream that misses its cut-off is an issue, not ordered: history never sets stock or delivery", async () => {
    const b = await usual();
    const line = creamLine(b);
    expect(line.preference?.status).toBe("usual");
    expect(line.issue?.kind).toBe("cutoff");
    expect(b.openIssues).toBe(1);
    expect(b.total).not.toBeGreaterThan(b.totalIfAccepted);
  });
});

describe("usual order", () => {
  test("intent detection", () => {
    expect(purchasingIntent("Prepare my usual weekend order.")).toBe("REORDER");
    expect(purchasingIntent("Same as last week please")).toBe("REORDER");
    expect(purchasingIntent("Our regular order, dairy only")).toBe("REORDER");
    expect(purchasingIntent("Catering for 50 people on Saturday")).toBe(
      "MENU_PLANNING",
    );
    expect(purchasingIntent("I need 20 litres of milk")).toBe(
      "DIRECT_PURCHASE",
    );
  });

  test("builds a normal editable basket from history at current prices, B ranked first and labelled", async () => {
    const b = await usual();
    expect(b.intent).toBe("REORDER");
    expect(b.lines.map((l) => l.sku).sort()).toEqual(usualSkus());
    expect(calls).toBeGreaterThan(0); // current price + availability were checked
    const milk = b.lines.find((l) => l.sku === "469549")!;
    expect(milk.qty).toBe(21); // median of 20,22,24,18,22,20,24,20
    expect(milk.stock.price).toBe(2); // today's quote, not the synthetic historical price
    const cream = creamLine(b);
    expect(cream.issue!.options[0].sku).toBe(CREAM_B);
    expect(cream.issue!.options[0].preference).toMatchObject({
      status: "accepted_alternative",
      accepted: 3,
    });
    expect(cream.issue!.options[0].preference!.reason).toContain("3 times");
    // editable like any basket
    const edited = editLine(b.id, milk.id, { qty: 25 });
    expect(edited.lines.find((l) => l.id === milk.id)!.qty).toBe(25);
  });

  test("prices and availability are checked again before the order is committed", async () => {
    const b = await usual();
    editLine(b.id, creamLine(b).id, { chooseOption: CREAM_B });
    mocks["469549"] = { price: 2.5 };
    const r = await post(`/api/basket/${b.id}/order`, {});
    const order = await r.json();
    expect([201, 202]).toContain(r.status);
    expect(
      order.changes.some((c: any) => c.sku === "469549" && c.kind === "price"),
    ).toBe(true);
  });

  test("same as last week, category filter, scaling and extras", async () => {
    const last = await usual("Same as last week");
    expect(last.lines.map((l) => l.sku).sort()).toEqual(
      historyOrders("123")[7]
        .lines.map((l) => l.sku)
        .sort(),
    );
    const dairy = await usual("My usual dairy order");
    expect(
      dairy.lines.every((l) => getProduct(l.sku)!.cat.startsWith("10")),
    ).toBe(true);
    expect(dairy.lines.length).toBeLessThan(usualSkus().length);
    const scaled = await usual(
      "My usual order, we expect 30% more customers, but add 10 litres of milk",
    );
    expect(scaled.notes.some((n) => /scaled ×1\.3/.test(n))).toBe(true);
    const milk = scaled.lines.find((l) => l.sku === "469549")!;
    expect(milk.qty).toBe(Math.ceil(21 * 1.3) + 10); // usual milk is the preferred match for the extra litres
    expect(scaled.summary!.adjusted).toBeGreaterThan(0);
  });
});

describe("learning vs permissions", () => {
  test("accepting a replacement updates history and offers a permission, but never changes the mandate", async () => {
    const before = getMandate("123");
    expect(before.autoSwapSameUse).toBe(false);
    const b = await usual();
    const after = editLine(b.id, creamLine(b).id, {
      chooseOption: CREAM_B,
      by: "Anna K.",
    });
    expect(acceptedCount("123", CREAM_A, CREAM_B)).toBe(4);
    const line = creamLine(after);
    expect(line.sku).toBe(CREAM_B);
    expect(line.preference).toMatchObject({
      status: "accepted_alternative",
      accepted: 4,
    });
    expect(line.offerPermission).toEqual({
      fromSku: CREAM_A,
      fromName: getProduct(CREAM_A)!.en,
      toSku: CREAM_B,
      toName: getProduct(CREAM_B)!.en,
      accepted: 4,
    });
    expect(getMandate("123")).toEqual(before);
    expect(after.rules.substitutionPermissions).toEqual([]);
    expect(orders.size).toBe(0); // accepting never places the order
  });

  test("choosing a lower-ranked option records the first proposal as declined", async () => {
    const b = await usual();
    const line = creamLine(b);
    const second = line.issue!.options[1].sku;
    editLine(b.id, line.id, { chooseOption: second });
    expect(preferenceOf("123", CREAM_B, CREAM_A)).toMatchObject({
      accepted: 3,
      rejected: 1,
    });
    expect(preferenceOf("123", second, CREAM_A).status).toBe(
      "accepted_alternative",
    );
  });

  test("permission grant lets the gateway swap under policy; revoke returns the choice to the buyer", async () => {
    const g = await post("/api/permissions", {
      fromSku: CREAM_A,
      toSku: CREAM_B,
      maxIncreasePct: 20,
      by: "Anna K.",
    });
    expect(g.status).toBe(201);
    const perm = await g.json();
    expect(perm).toMatchObject({
      customer: "123",
      fromSku: CREAM_A,
      toSku: CREAM_B,
      maxIncreasePct: 20,
      grantedBy: "Anna K.",
    });
    const profile = await (await app.request("/api/profile")).json();
    expect(profile).toMatchObject({
      customer: "123",
      name: "Bistro Kallio",
      synthetic: true,
      weeklyOrders: 8,
    });
    expect(profile.permissions[0].id).toBe(perm.id);
    expect(
      events("profile:123").some((e) => e.kind === "permission_granted"),
    ).toBe(true);

    const b = await usual();
    const line = creamLine(b);
    expect(line.sku).toBe(CREAM_B);
    expect(line.issue!.decidedBy).toBe(`policy:${perm.id}`);
    expect(line.offerPermission).toBeUndefined();
    expect(acceptedCount("123", CREAM_A, CREAM_B)).toBe(3); // policy swaps are not buyer preferences
    expect(b.openIssues).toBe(0);

    const r = await app.request(`/api/permissions/${perm.id}`, {
      method: "DELETE",
    });
    expect(r.status).toBe(200);
    expect((await r.json()).revokedAt).toBeTruthy();
    expect(
      events("profile:123").some((e) => e.kind === "permission_revoked"),
    ).toBe(true);
    const again = await usual();
    expect(creamLine(again).issue?.decided).toBeUndefined();
  });

  test("a permission never covers a swap above its price ceiling", async () => {
    mocks[CREAM_B] = { price: 9 }; // 4.5x the usual cream's per-litre price
    await post("/api/permissions", {
      fromSku: CREAM_A,
      toSku: CREAM_B,
      maxIncreasePct: 20,
    });
    const b = await usual();
    expect(creamLine(b).issue?.decided).toBeUndefined();
  });
});

describe("exception-first summary", () => {
  const check = (b: Basket) => {
    const inCart = b.lines.filter(
      (l) => l.qty > 0 || (l.issue && !l.issue.decided),
    );
    const s = b.summary!;
    const blocked = new Set(blockingChecks(b).map((c) => c.sku));
    // "Need you" = products the buyer must act on; stock sign-off and limits are the approver's notes.
    const attention = inCart.filter(
      (l) => (l.issue && !l.issue.decided) || blocked.has(l.sku),
    ).length;
    expect(s.items.filter((i) => i.attention).length).toBe(attention);
    expect(s.attention).toBe(attention);
    expect(s.usual + s.adjusted + s.attention).toBeLessThanOrEqual(
      inCart.length + 1,
    );
    return s;
  };
  test("counts match the cart before and after a decision", async () => {
    const b = await usual();
    let s = check(b);
    expect(s).toMatchObject({
      attention: 1,
      adjusted: 0,
      usual: b.lines.length - 1,
    });
    expect(s.items[0]).toMatchObject({ lineId: creamLine(b).id, kind: "late" });
    const after = editLine(b.id, creamLine(b).id, { chooseOption: CREAM_B });
    s = check(after);
    expect(s).toMatchObject({
      attention: 0,
      adjusted: 1,
      usual: b.lines.length - 1,
    });
    expect(s.items.some((i) => i.kind === "substitution")).toBe(true);
  });
  test("unknown stock lines are sign-off attention only when the policy asks for it (S53)", async () => {
    mocks["469549"] = { amount: 999999 };
    // Demo account default: today's webshop behaviour, no sign-off and not held for stock.
    const off = await usual();
    expect(check(off).items.some((i) => i.kind === "stock_signoff")).toBe(
      false,
    );
    expect(off.mandate.reasons.join(" ")).not.toMatch(/can't confirm stock/);
    setMandate("123", { confirmUnknownStock: true });
    const on = await usual();
    expect(check(on).items.some((i) => i.kind === "stock_signoff")).toBe(true);
  });
});

describe("dev reset", () => {
  test("404 unless DEV_TOOLS=1; restores the synthetic baseline", async () => {
    expect((await post("/api/dev/reset", {})).status).toBe(404);
    const b = await usual();
    editLine(b.id, creamLine(b).id, { chooseOption: CREAM_B });
    await post("/api/permissions", {
      fromSku: CREAM_A,
      toSku: CREAM_B,
      maxIncreasePct: 20,
    });
    process.env.DEV_TOOLS = "1";
    expect((await post("/api/dev/reset", {})).status).toBe(200);
    expect(acceptedCount("123", CREAM_A, CREAM_B)).toBe(3);
    expect(getMandate("123").substitutionPermissions).toEqual([]);
    expect((await app.request(`/api/basket/${b.id}`)).status).toBe(404);
  });
});
