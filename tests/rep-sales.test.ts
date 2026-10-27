import { describe, expect, it } from "vitest";
import { monthlySaleSchema } from "@/lib/validation";

describe("monthly sales validation", () => {
  it("accepts a finite nonnegative amount and a valid month", () => {
    expect(monthlySaleSchema.safeParse({ sale_month: "2026-10", amount: "1250.50" }).success).toBe(true);
  });
  it("rejects NaN, infinities, negative amounts, and malformed months", () => {
    for (const amount of ["NaN", "Infinity", -1]) expect(monthlySaleSchema.safeParse({ sale_month: "2026-10", amount }).success).toBe(false);
    expect(monthlySaleSchema.safeParse({ sale_month: "2026-13", amount: 0 }).success).toBe(false);
  });
});
