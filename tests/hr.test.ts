import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn(), pool: {} }));
import { advanceInstallment, annualEntitlement, daysBetween, hrTitle, isDate, overlapDays, unpaidDeduction } from "@/lib/hr";

describe("employee requests rules", () => {
  it("counts leave days inclusively and per month", () => {
    expect(daysBetween("2026-11-10", "2026-11-10")).toBe(1);
    expect(daysBetween("2026-11-28", "2026-12-03")).toBe(6);
    expect(overlapDays("2026-11-28", "2026-12-03", "2026-12-01", "2026-12-31")).toBe(3);
    expect(overlapDays("2026-10-01", "2026-10-05", "2026-11-01", "2026-11-30")).toBe(0);
  });
  it("deducts unpaid leave as salary / 30 per day, in the month the days fall", () => {
    expect(unpaidDeduction(12000, "2026-11-28", "2026-12-03", "2026-11")).toEqual({ days: 3, amount: 1200 });
    expect(unpaidDeduction(12000, "2026-11-28", "2026-12-03", "2026-12")).toEqual({ days: 3, amount: 1200 });
    expect(unpaidDeduction(0, "2026-11-01", "2026-11-05", "2026-11").amount).toBe(0);
  });
  it("gives 21 days, 30 after five full years, prorated in the hire year", () => {
    expect(annualEntitlement(null, 2026)).toBe(21);
    expect(annualEntitlement("2020-03-01", 2026)).toBe(30);
    expect(annualEntitlement("2021-06-01", 2026)).toBe(21);
    expect(annualEntitlement("2026-07-02", 2026)).toBe(Math.round(21 * 183 / 365));
    expect(annualEntitlement("2026-07-02", 2026, 25)).toBe(25);
  });
  it("splits an advance into equal instalments, last one takes the rounding", () => {
    expect(advanceInstallment(1000, 3, "2026-11", "2026-10")).toBe(0);
    expect(advanceInstallment(1000, 3, "2026-11", "2026-11")).toBe(333.33);
    expect(advanceInstallment(1000, 3, "2027-01", "2027-01")).toBe(333.33);
    expect(advanceInstallment(1000, 3, "2026-11", "2027-01")).toBe(333.34);
    expect(advanceInstallment(1000, 3, "2026-11", "2027-02")).toBe(0);
  });
  it("validates dates and builds readable titles", () => {
    expect(isDate("2026-02-30")).toBe(false);
    expect(isDate("2026-02-28")).toBe(true);
    expect(hrTitle("leave", { hr_type: "sick", start_date: "2026-11-10", end_date: "2026-11-12", days: 3 })).toContain("إجازة مرضية · 3 يوم");
    expect(hrTitle("advance", { amount: 3000, installments: 3 })).toBe("سلفة 3,000 ر.س · 3 أقساط");
  });
});
