import { describe, it, expect } from "vitest";
import { allowedMonth, nextMonthStart, pausedSql, riyadhMonthStart } from "@/lib/doctor-pauses";

describe("doctor month pauses", () => {
  it("month helpers use Riyadh time", () => {
    expect(riyadhMonthStart(new Date("2026-10-31T22:30:00Z"))).toBe("2026-11-01"); // already Nov 1st in Riyadh
    expect(nextMonthStart("2026-12-01")).toBe("2027-01-01");
  });
  it("reps can pause the current and next month only", () => {
    const now = new Date("2026-11-03T09:00:00Z");
    expect(allowedMonth("2026-11-01", now)).toBe(true);
    expect(allowedMonth("2026-12-01", now)).toBe(true);
    expect(allowedMonth("2026-10-01", now)).toBe(false);
    expect(allowedMonth("2027-01-01", now)).toBe(false);
  });
  it("builds a month-scoped predicate", () => {
    expect(pausedSql("$1", "d.id", "$2::date")).toContain("dmp.month=date_trunc('month', ($2::date)::date)::date");
  });
});
