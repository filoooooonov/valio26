import { afterEach, beforeAll, expect, test } from "bun:test";
import { buildBasket } from "./plan";
import { chat } from "./chat";
import { loadCatalog } from "./catalog";
import { setLlm, type Llm } from "./llm";
import { setFetcher } from "./valio";
import { resetStore } from "./store";

beforeAll(() => { loadCatalog(); process.env.VALIO_API_KEY ??= "test"; });
afterEach(() => { setLlm(null); resetStore(); });
setFetcher((async (url: string, init: RequestInit) => {
  const { products: ids } = JSON.parse(init.body as string);
  const products = ids.map((productId: string) => String(url).endsWith("/price")
    ? { productId, netPriceFound: true, error: false, catalogPrice: { value: 2, valueWithTax: 2.27, validTo: "2026-12-31" }, comparisonPrice: { value: 2 }, comparisonUnit: "L", tax: { taxRate: 13.5 } }
    : { productId, salesBlock: false, logisticModel: "Stock", closingTime: "2099-01-01T12:00:00+0200", scheduleLines: [{ salesBlock: false, availableAmount: 999, availableDate: "2026-11-16", salesUnit: "ST" }] });
  return new Response(JSON.stringify({ products, timeNow: new Date().toISOString() }));
}) as typeof fetch);

test("chat passes the conversation so far, including the assistant's own question, to Claude", async () => {
  setLlm(null);
  const b = await buildBasket({ request: "salmon soup for 20", people: 20, date: "2026-11-20" });
  const seen: { text: string; history?: string; summary: string }[] = [];
  const llm: Llm = {
    draft: async () => { throw new Error("unused"); },
    pick: async () => { throw new Error("unused"); },
    chat: async (text, summary, history) => {
      seen.push({ text, summary, history });
      return { actions: [], question: "Pepsi comes in cases of 12. Add 1 case or 2?" };
    },
  };
  setLlm(llm);
  await chat(b.id, "add 2 bottles of pepsi", "Anna K.");
  const second = await chat(b.id, "yeah 1 pack", "Anna K.");
  expect(seen[0].history).toBe("");
  expect(seen[1].text).toBe("yeah 1 pack");
  expect(seen[1].history).toBe("Chef: add 2 bottles of pepsi\nAssistant: Pepsi comes in cases of 12. Add 1 case or 2?");
  expect(seen[1].summary).toContain("Request: salmon soup for 20");
  expect(second.question).toBeTruthy();
});
