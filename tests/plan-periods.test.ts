import { describe, expect, it } from "vitest";
import { PLAN_CREATOR_PERIOD, PLAN_PERIODS, planPeriodLabel } from "@/lib/plan-periods";

describe("plan period semantics", () => {
  it("supports daily, weekly, and monthly plans", () => {
    expect(PLAN_PERIODS).toEqual(["daily", "weekly", "monthly"]);
    expect(planPeriodLabel("daily")).toBe("يومية");
    expect(planPeriodLabel("weekly")).toBe("أسبوعية");
    expect(planPeriodLabel("monthly")).toBe("شهرية");
    expect(PLAN_CREATOR_PERIOD).toBe("weekly");
  });
});
