import { describe, it, expect } from "vitest";
import { computePlan, cleanPlan, draftPlan, type PlanData } from "@/lib/plan";

const base = (): PlanData => ({ target_profit: 10000, variable_pct: 0, notes: "",
  costs: [{ id: "a", name: "رواتب", kind: "salary", planned: 20000, actual: null }, { id: "b", name: "إيجار", kind: "expense", planned: 10000, actual: 12000 }],
  items: [
    { key: "p1", name: "A", include: true, cost: 100, price: 200, mix: 50, qty: null, actual_qty: null, actual_price: null },
    { key: "p2", name: "B", include: true, cost: 50, price: 150, mix: 50, qty: null, actual_qty: null, actual_price: null },
  ] });

describe("sales planner", () => {
  it("weighted break-even and target pieces", () => {
    const { t, rows } = computePlan(base());
    // each piece earns 100 on average → 300 pieces to break even, 400 to hit +10k
    expect(t.avg_unit_profit).toBe(100);
    expect(t.be_pieces).toBe(300);
    expect(t.target_pieces).toBe(400);
    expect(rows.map(r => r.target_qty)).toEqual([200, 200]);
    expect(t.target_revenue).toBe(70000);
    expect(t.plan_profit).toBe(10000);
    expect(t.safety).toBeCloseTo((70000 - 52500) / 70000 * 100, 1);
  });
  it("variable costs reduce unit profit", () => {
    const p = base(); p.variable_pct = 10;
    const { rows } = computePlan(p);
    expect(rows[0].unit_profit).toBe(80); // 200-100-20
    expect(rows[1].unit_profit).toBe(85); // 150-50-15
  });
  it("loss-making items are kept out of the target and flagged", () => {
    const p = base(); p.items.push({ key: "p3", name: "C", include: true, cost: 100, price: 90, mix: 50, qty: null, actual_qty: null, actual_price: null });
    const { rows, t, advice } = computePlan(p);
    expect(rows.find(r => r.key === "p3")!.target_qty).toBe(0);
    expect(rows.find(r => r.key === "p3")!.issue).toBe("loss");
    expect(t.target_pieces).toBe(400);
    expect(advice[0].level).toBe("danger");
  });
  it("manual quantities override the suggestion", () => {
    const p = base(); p.items[0].qty = 100; p.items[1].qty = 100;
    const { t } = computePlan(p);
    expect(t.plan_profit).toBe(100 * 100 + 100 * 100 - 30000);
  });
  it("actual profit uses actual price, actual costs and items outside the plan", () => {
    const p = base();
    p.items[0].actual_qty = 150; p.items[0].actual_price = 210;
    p.items[1].actual_qty = 200;
    p.items.push({ key: "p9", name: "Z", include: false, cost: 10, price: 30, mix: 0, qty: null, actual_qty: 10, actual_price: 30 });
    const { t, rows } = computePlan(p);
    expect(t.fixed_actual).toBe(32000);
    expect(t.actual_revenue).toBe(150 * 210 + 200 * 150 + 300);
    expect(t.actual_profit).toBe(150 * 110 + 200 * 100 + 200 - 32000);
    expect(rows.find(r => r.key === "p9")!.plan_qty).toBe(0);
    expect(rows[0].achieve).toBe(75);
  });
  it("cleanPlan sanitises input", () => {
    const c = cleanPlan({ target_profit: "5000", variable_pct: 999, costs: [{ name: "x", planned: -5 }], items: [{ key: "k", name: "n", price: "12.345" }, { key: "k", name: "dup" }, { name: "nokey" }] });
    expect(c.target_profit).toBe(5000); expect(c.variable_pct).toBe(60); expect(c.costs[0].planned).toBe(0);
    expect(c.items).toHaveLength(1); expect(c.items[0].price).toBe(12.35); expect(c.items[0].qty).toBeNull();
  });
  it("draft plan uses history mix", () => {
    const d = draftPlan([{ key: "p1", name: "A", avg_cost: 10, last_cost: 11, price: 20, list_price: 25, hist_qty: 30, stock: 0, d_qty: 0, d_price: null },
      { key: "p2", name: "B", avg_cost: null, last_cost: 5, price: null, list_price: 9, hist_qty: 10, stock: 0, d_qty: 0, d_price: null },
      { key: "p3", name: "C", avg_cost: 1, last_cost: 1, price: 2, list_price: 2, hist_qty: 0, stock: 5, d_qty: 0, d_price: null }], [], 15);
    expect(d.items.map(i => [i.key, i.mix, i.cost, i.price])).toEqual([["p1", 75, 10, 20], ["p2", 25, 5, 9]]);
  });
});
