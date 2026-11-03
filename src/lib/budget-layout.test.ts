import { describe, expect, test } from "bun:test";
import { budgetFirstLayout } from "./budget-layout";

describe("budget-first homepage", () => {
  test("moves an existing saved budget to the top left without changing its size", () => {
    const result = budgetFirstLayout([
      { i: "today", x: 0, y: 0, w: 4, h: 6 },
      { i: "budget", x: 4, y: 8, w: 5, h: 7 },
    ]);
    expect(result.find((item) => item.i === "budget")).toEqual({ i: "budget", x: 0, y: 0, w: 5, h: 7 });
    expect(result.find((item) => item.i === "today")?.y).toBe(7);
  });
  test("leaves a budget already at the top unchanged", () => {
    const layout = [{ i: "budget", x: 0, y: 0, w: 4, h: 6 }];
    expect(budgetFirstLayout(layout)).toBe(layout);
  });
});