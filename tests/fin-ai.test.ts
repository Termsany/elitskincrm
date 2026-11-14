import { describe, expect, it } from "vitest";
import { prevRange } from "@/lib/fin-ai";

describe("previous period for the P&L comparison", () => {
  it("is the same number of days right before the period", () => {
    expect(prevRange("2026-12-01", "2026-12-31")).toEqual(["2026-10-31", "2026-11-30"]);
    expect(prevRange("2026-12-10", "2026-12-10")).toEqual(["2026-12-09", "2026-12-09"]);
  });
  it("is skipped when it would start before the books start", () => {
    expect(prevRange("2026-11-01", "2026-11-14", "2026-11-01")).toBeNull();
    expect(prevRange("2026-12-01", "2026-12-14", "2026-11-01")).toEqual(["2026-11-17", "2026-11-30"]);
  });
});
