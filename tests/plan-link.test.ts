import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn(), pool: {} }));
import { syncPlan } from "@/lib/plan-link";
import type { CatalogRow, PlanData } from "@/lib/plan";

const cat = (key: string, d_qty: number, d_price: number | null = 100): CatalogRow => ({ key, name: key.toUpperCase(), avg_cost: 40, last_cost: 40, price: 100, list_price: 100, hist_qty: 5, stock: 0, d_qty, d_price });
const plan: PlanData = { target_profit: 0, variable_pct: 0, notes: "",
  costs: [{ id: "fA", name: "rent", kind: "expense", planned: 1000, actual: 900 }, { id: "fGone", name: "old", kind: "expense", planned: 50, actual: null }, { id: "manual", name: "trip", kind: "expense", planned: 300, actual: null }],
  items: [{ key: "a", name: "A", include: true, cost: 40, price: 100, mix: 1, qty: 10, actual_qty: 3, actual_price: null }] };
const fixed = [{ id: "fA", name: "rent office", kind: "expense" as const, planned: 1200, actual: null }, { id: "fNew", name: "salary", kind: "salary" as const, planned: 5000, actual: null }];

describe("month plan follows the fixed costs and Daftra", () => {
  it("updates fixed-cost lines, drops removed ones, adds new ones, keeps manual lines and actuals", () => {
    const p = syncPlan(plan, [], fixed, "2026-12", "2026-11");
    expect(p.costs).toEqual([{ id: "fA", name: "rent office", kind: "expense", planned: 1200, actual: 900 }, { id: "manual", name: "trip", kind: "expense", planned: 300, actual: null }, fixed[1]]);
    expect(p.items[0].actual_qty).toBe(3); // future month: no Daftra actuals
  });
  it("fills actual quantities and prices from Daftra for the current month, including items outside the plan", () => {
    const p = syncPlan(plan, [cat("a", 7, 95), cat("b", 2, 80), cat("c", 0)], fixed, "2026-11", "2026-11");
    expect(p.items[0]).toMatchObject({ key: "a", actual_qty: 7, actual_price: 95 });
    expect(p.items.find(i => i.key === "b")).toMatchObject({ include: false, actual_qty: 2, actual_price: 80 });
    expect(p.items.find(i => i.key === "c")).toBeUndefined();
  });
  it("leaves the costs of a past month alone", () => {
    expect(syncPlan(plan, [], fixed, "2026-10", "2026-11").costs).toEqual(plan.costs);
  });
});
