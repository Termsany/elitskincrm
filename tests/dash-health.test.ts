import { describe, expect, it } from "vitest";
import { healthScore, startActions } from "@/lib/dash-health";

describe("healthScore", () => {
  it("weights the four signals and names the weakest", () => {
    const h = healthScore({ salesPct: 58, expectedPct: 27, coverage: [{ total: 10, visited: 5 }], arOverdue: 65, arTotal: 100, quality: 88 });
    expect(h.chips.map(c => c.key)).toEqual(["sales", "visits", "collect", "quality"]);
    expect(h.weakest?.key).toBe("collect");
    expect(h.note).toContain("التحصيل");
    expect(h.score).toBe(Math.round((100 * 0.3 + 50 * 0.2 + 35 * 0.3 + 88 * 0.2) / 1));
  });
  it("skips missing signals instead of counting them as zero", () => {
    const h = healthScore({ salesPct: null, expectedPct: null, coverage: [], arOverdue: 0, arTotal: 0, quality: 70 });
    expect(h.score).toBe(70);
    expect(h.chips).toHaveLength(1);
  });
  it("has no score without data", () => {
    expect(healthScore({ salesPct: null, expectedPct: null, coverage: [], arOverdue: 0, arTotal: 0, quality: null }).score).toBeNull();
  });
});

describe("startActions", () => {
  const base = { manager: false, arOverdue: 375596, arInvoices: 24, ar60: 336784, reps: 3, withPlan: 1, pendingTotal: 0, insights: [], morning: null };
  it("puts overdue money first, then missing plans, max 3", () => {
    const a = startActions({ ...base, pendingTotal: 2, insights: [{ tone: "blue", title: "x", text: "y", href: "/z" }] });
    expect(a.map(x => x.id)).toEqual(["ar", "plans", "pending"]);
    expect(a[1].run).toBe("autoplan");
  });
  it("never shows company money to a sales manager", () => {
    expect(startActions({ ...base, manager: true }).map(x => x.id)).toEqual(["plans"]);
  });
  it("is empty when nothing needs attention", () => {
    expect(startActions({ ...base, arOverdue: 0, withPlan: 3 })).toEqual([]);
  });
});
