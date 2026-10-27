import { describe, expect, it } from "vitest";
import { planDateOnly, canAdminReviewPlan } from "@/lib/plan-review";

describe("plan review regressions", () => {
  it("normalizes date values using the Riyadh business date", () => {
    expect(planDateOnly(new Date("2026-11-22T00:00:00.000Z"))).toBe("2026-11-22");
    expect(planDateOnly(new Date("2026-11-22T00:00:00+03:00"))).toBe("2026-11-22");
    expect(planDateOnly("2026-11-22")).toBe("2026-11-22");
  });

  it("only permits a decision while a plan is pending", () => {
    expect(canAdminReviewPlan("pending")).toBe(true);
    expect(canAdminReviewPlan("needs_revision")).toBe(false);
    expect(canAdminReviewPlan("approved")).toBe(false);
    expect(canAdminReviewPlan("rejected")).toBe(false);
  });
});
