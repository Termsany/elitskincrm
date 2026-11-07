import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
import { pctOf, previousRange, proratedTarget, toneOf } from "@/lib/system-pulse";

describe("system pulse helpers", () => {
  it("prorates monthly targets by overlapping days", () => {
    const m = [{ month: "2026-11", amount: 30000 }, { month: "2026-12", amount: 31000 }];
    expect(proratedTarget(m, "2026-11-01", "2026-11-30")).toBeCloseTo(30000);
    expect(proratedTarget(m, "2026-11-01", "2026-11-10")).toBeCloseTo(10000);
    expect(proratedTarget(m, "2026-11-21", "2026-12-10")).toBeCloseTo(10000 + 10000);
    expect(proratedTarget(m, "2027-01-01", "2027-01-31")).toBe(0);
  });
  it("compares whole months with the months before", () => {
    expect(previousRange("2026-11-01", "2026-11-30")).toEqual({ pFrom: "2026-10-01", pTo: "2026-10-31" });
    expect(previousRange("2026-01-01", "2026-03-31")).toEqual({ pFrom: "2025-10-01", pTo: "2025-12-31" });
    expect(previousRange("2026-11-01", "2026-11-07")).toEqual({ pFrom: "2026-10-25", pTo: "2026-10-31" });
  });
  it("grades percentages", () => {
    expect(pctOf(50, 0)).toBeNull();
    expect(pctOf(96, 100)).toBe(96);
    expect(toneOf(96, 95, 75)).toBe("good");
    expect(toneOf(80, 95, 75)).toBe("warn");
    expect(toneOf(10, 95, 75)).toBe("bad");
    expect(toneOf(null, 95, 75)).toBe("info");
  });
});
