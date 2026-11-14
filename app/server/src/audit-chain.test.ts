import { beforeEach, expect, test } from "bun:test";
import { app } from "./app";
import { _tamper, audit, events, resetAudit, verifyChain } from "./audit";

beforeEach(() => resetAudit());

test("audit events form a hash chain", () => {
  audit("b_test", "buyer", "request", "Requested ingredients");
  audit("b_test", "assistant", "plan", "Planned basket");
  audit("b_test", "gateway", "stock", "Checked stock");
  const list = events("b_test");
  expect(list[0].prev).toBe("genesis");
  expect(list[0].hash).toMatch(/^[a-f0-9]{64}$/);
  expect(list[1].prev).toBe(list[0].hash);
  expect(list[2].prev).toBe(list[1].hash);
  expect(verifyChain("b_test")).toEqual({ intact: true, count: 3, head: list[2].hash });
});

test("verification identifies the first tampered event", () => {
  for (let i = 0; i < 3; i++) audit("b_test", "gateway", "plan", `Step ${i}`);
  _tamper("b_test", 1, "changed");
  expect(verifyChain("b_test")).toMatchObject({ intact: false, brokenAt: 1 });
});

test("caller data mutations cannot change the logged data", () => {
  const data = { lines: [{ qty: 2 }], details: { reason: "requested" } };
  audit("b_test", "buyer", "edit", "Changed quantity", data);
  data.lines[0].qty = 99;
  data.details.reason = "changed";
  expect(events("b_test")[0].data).toEqual({ lines: [{ qty: 2 }], details: { reason: "requested" } });
  expect(verifyChain("b_test").intact).toBe(true);
});

test("empty scopes have an intact empty chain", () => {
  expect(verifyChain("b_test")).toEqual({ intact: true, count: 0, head: null });
});

test("audit HTTP routes respond without a network call", async () => {
  const missing = await app.request("/api/basket/does-not-exist/audit/export");
  expect(missing.status).toBe(404);
  audit("b_test", "buyer", "request", "Requested ingredients");
  audit("b_test", "assistant", "plan", "Planned basket");
  const response = await app.request("/api/basket/b_test/audit/verify");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ intact: true, count: 2 });
});
