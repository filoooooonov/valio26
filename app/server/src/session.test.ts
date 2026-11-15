// Hosted-demo session isolation (SESSION_ISOLATION=1): visitors never see each other's orders, spend or policy edits.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { app } from "./app";
import { getMandate, setMandate } from "./policy";
import { runInSession } from "./session";
import { dailySoFar, orders, resetStore } from "./store";

const order = (id: string, total: number) =>
  ({
    id,
    basketId: "b_" + id,
    customer: "123",
    status: "placed",
    total,
    createdAt: new Date().toISOString(),
  }) as any;

describe("session isolation", () => {
  beforeAll(() => {
    process.env.SESSION_ISOLATION = "1";
  });
  afterAll(() => {
    delete process.env.SESSION_ISOLATION;
    resetStore();
  });

  test("orders, daily spend and policy edits belong to one visitor", () => {
    runInSession("visitoraaaa", () => orders.set("o_a", order("a", 400)));
    runInSession("visitorbbbb", () => orders.set("o_b", order("b", 100)));
    runInSession("visitoraaaa", () => {
      expect([...orders.keys()]).toEqual(["o_a"]);
      expect(orders.get("o_b")).toBeUndefined();
      expect(dailySoFar("123")).toBe(400);
      setMandate("123", { requireApproval: true });
    });
    runInSession("visitorbbbb", () => {
      expect([...orders.values()].map((o) => o.id)).toEqual(["b"]);
      expect(dailySoFar("123")).toBe(100);
      expect(getMandate("123").requireApproval).toBe(false);
      resetStore(); // a visitor's reset clears only their own session
    });
    runInSession("visitoraaaa", () => expect(orders.has("o_a")).toBe(true));
  });

  test("a browser gets its own cookie; an agent joins with the session header", async () => {
    const r = await app.request("/api/orders");
    const cookie = r.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/aimo_session=[a-z0-9]{12}; .*HttpOnly/);
    const mine = await app.request("/api/session", {
      headers: { "x-aimo-session": "visitoraaaa" },
    });
    expect(await mine.json()).toEqual({
      isolated: true,
      session: "visitoraaaa",
    });
    const list = await app.request("/api/orders", {
      headers: { "x-aimo-session": "visitoraaaa" },
    });
    expect((await list.json()).map((o: any) => o.id)).toEqual(["a"]);
  });
});
