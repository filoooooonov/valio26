import { expect, test } from "bun:test";
import { decisionMatrix, getMandate, setMandate } from "./policy";

test("default mandate assigns eight decisions in order", () => {
  const rows = decisionMatrix(getMandate("123"));
  expect(rows).toHaveLength(8);
  expect(rows.map((row) => row.who)).toEqual([
    "gateway", "gateway", "buyer", "buyer", "buyer", "approver", "approver", "approver",
  ]);
});

test("matrix reflects customer swap and spend overrides", () => {
  setMandate("t1", { autoSwapSameUse: false, maxOrderEur: 300 });
  const rows = decisionMatrix(getMandate("t1"));
  expect(rows[1].who).toBe("buyer");
  expect(rows.some((row) => row.decision.includes("300"))).toBe(true);
});

test("matrix text contains no missing or invalid values", () => {
  for (const customer of ["123", "t1"]) {
    for (const row of decisionMatrix(getMandate(customer))) {
      const text = `${row.decision} ${row.rule}`;
      expect(text).not.toContain("undefined");
      expect(text).not.toContain("NaN");
    }
  }
});
