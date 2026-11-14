import { describe, expect, test } from "bun:test";
import { getProduct, loadCatalog, search } from "./catalog";
import { rankOptions, tierWhy, type Option } from "./plan";

loadCatalog();
const hits = search("milk", { limit: 4 });
if (hits.length < 4) throw new Error("Tier tests need four catalogue products");

function options(): Option[] {
  return hits.map((hit, index) => ({
    sku: hit.id,
    name: hit.name,
    reason: "Test replacement",
    delta: 0,
    qty: 2,
    pack: "1 l",
    why: "2 packs",
    total: 10 + index,
    contains: [],
    stock: {
      sku: hit.id,
      price: (10 + index) / 2,
      priceWithTax: (10 + index) / 2 * 1.135,
      taxRate: 13.5,
      customerPrice: true,
      available: 10,
      cutoffPassed: false,
      deliverable: true,
      status: "ok",
      salesUnit: "ST",
    },
  }));
}

describe("substitution tiers", () => {
  test("keeps at most three orderable options with tiers in rank order", () => {
    const input = options();
    const ranked = rankOptions(input, []);
    expect(ranked).toHaveLength(3);
    expect(ranked.map((o) => o.tier)).toEqual(["best", "better", "good"]);
    for (const o of ranked) {
      expect(o.onTime).toBe(getProduct(o.sku)?.rel ?? null);
      expect(o.co2).toBe(getProduct(o.sku)?.co2 ?? null);
    }
    expect(input.every((o) => o.tier === undefined)).toBe(true);
    expect(rankOptions(input.slice(0, 1), []).map((o) => o.tier)).toEqual(["best"]);
    expect(rankOptions([], [])).toEqual([]);
  });

  test("every tier has a sentence explaining its rank", () => {
    const ranked = rankOptions(options(), []);
    for (const o of ranked) {
      expect(o.tierWhy!.length).toBeGreaterThan(1);
      expect(o.tierWhy!.endsWith(".")).toBe(true);
    }
    expect(ranked[0].tierWhy!.startsWith("Closest safe match")).toBe(true);
    expect(ranked[0].tierWhy).toContain("no new allergens");
  });

  test("drops unorderable options without assigning them a tier", () => {
    for (const stock of [
      { deliverable: false },
      { cutoffPassed: true },
      { available: 1 },
    ]) {
      const input = options();
      const blocked = input[0];
      Object.assign(blocked.stock, stock);
      const ranked = rankOptions(input, []);
      expect(ranked).toHaveLength(3);
      expect(ranked.some((o) => o.sku === blocked.sku)).toBe(false);
      expect(blocked.tier).toBeUndefined();
    }
  });

  test("explains a cheaper non-best option relative to Best", () => {
    const [best, cheaper] = options();
    best.total = 12;
    cheaper.total = 9.5;
    cheaper.contains = ["AM"];
    const ranked = rankOptions([cheaper, best], []);
    expect(ranked[0].sku).toBe(best.sku);
    expect(ranked[1].tierWhy).toContain("€2.50 cheaper than Best");
    expect(tierWhy(cheaper, best, 1, [])).toContain("adds milk");
  });
});
