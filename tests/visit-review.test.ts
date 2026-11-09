import { describe, expect, it } from "vitest";
import { reviewIssues, DEFAULT_RULES } from "@/lib/visit-review";

const v = (o: Record<string, unknown>) => ({ status: "completed", lat: 26.3, notes: "شرحت المنتج والدكتور مهتم جداً", distance_m: 40, flags: [], ...o }) as never;
describe("visit review rules", () => {
  it("flags missing GPS, short notes, far and burst visits", () => {
    expect(reviewIssues(v({}), DEFAULT_RULES)).toEqual([]);
    expect(reviewIssues(v({ lat: null, notes: "تمام", distance_m: null }), DEFAULT_RULES)).toEqual(["gps", "notes"]);
    expect(reviewIssues(v({ distance_m: 900, flags: [{ code: "burst" }] }), DEFAULT_RULES)).toEqual(["far", "burst"]);
  });
  it("uses the configured thresholds and skips cancelled visits", () => {
    expect(reviewIssues(v({ distance_m: 900 }), { ...DEFAULT_RULES, far_m: 1000 })).toEqual([]);
    expect(reviewIssues(v({ notes: "كده تمام جداً" }), { ...DEFAULT_RULES, min_notes: 5 })).toEqual([]);
    expect(reviewIssues(v({ status: "cancelled", lat: null }), DEFAULT_RULES)).toEqual([]);
  });
});

import { periodRange } from "@/lib/admin-priorities";
describe("kpi periods", () => {
  it("compares each period with the same span before it", () => {
    expect(periodRange("today", "2026-11-09")).toMatchObject({ from: "2026-11-09", pFrom: "2026-11-08", pTo: "2026-11-08" });
    expect(periodRange("week", "2026-11-09")).toMatchObject({ from: "2026-11-08", pFrom: "2026-11-01", pTo: "2026-11-02" });
    expect(periodRange("month", "2026-11-09")).toMatchObject({ from: "2026-11-01", pFrom: "2026-10-01", pTo: "2026-10-09" });
    expect(periodRange("quarter", "2026-11-09")).toMatchObject({ from: "2026-10-01", pFrom: "2026-07-01", pTo: "2026-08-09" });
  });
});
