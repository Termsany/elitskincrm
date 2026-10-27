import { describe, expect, it } from "vitest";
import { coverageMonthStart, resolveCoverageUserId } from "@/lib/plan-coverage";

describe("plan coverage scope", () => {
  it("uses the selected representative for an admin", () => {
    expect(resolveCoverageUserId({ id: "admin-1", role: "admin" }, "rep-2")).toBe("rep-2");
  });

  it("does not let a representative override their own coverage scope", () => {
    expect(resolveCoverageUserId({ id: "rep-1", role: "sales_rep" }, "rep-2")).toBe("rep-1");
  });

  it("uses the Riyadh calendar month at the boundary", () => {
    expect(coverageMonthStart(new Date("2026-10-31T20:59:59.000Z"))).toBe("2026-10-01");
    expect(coverageMonthStart(new Date("2026-10-31T21:00:00.000Z"))).toBe("2026-11-01");
  });
});
