import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
import { computeFinance, type Input, type Doc } from "@/lib/finance";
import { planOf, suggestGoals, scorecard, seasonalWeights, normWeights, validateGoals, levers, type Goals } from "@/lib/fin-goals";

const doc = (o: Partial<Doc>): Doc => ({ id: 1, no: "1", date: "2026-09-10", due_days: 30, party_id: 1, party: "عميل", city: "", branch: "", payment_status: 2, net: 0, tax: 0, total: 0, paid: 0, unpaid: 0, refund: 0, lines: [], ...o });
const base = (o: Partial<Input> = {}): Input => ({
  sales: [], purchases: [], products: [{ id: 15, name: "AMI 200", code: "", list_price: 900, buy_price: 0, average_cost: 0, min_price: null, stock: 10, active: true }],
  payments: [], entries: [], accounts: [{ id: 1, code: "5214", name: "رواتب" }],
  overrides: {}, fixed: [], settings: { target_gross_margin: 45, target_net_margin: 15 }, today: "2026-10-31", ...o });



describe("annual goals", () => {
  const g: Goals = { sales: 1_200_000, gross_margin: 50, opex_month: 40_000, collection_rate: 90, dso_days: 60, weights: Array(12).fill(1 / 12) };
  it("splits the year into months with net profit and break-even", () => {
    const p = planOf(g);
    expect(p.months[0].sales).toBe(100_000); expect(p.months[0].net).toBe(10_000);
    expect(p.net).toBe(120_000); expect(p.net_margin).toBe(10); expect(p.break_even_month).toBe(80_000);
    expect(p.months[0].collect).toBe(Math.round(100_000 * 1.15 * 0.9));
  });
  it("validates inputs and normalises weights", () => {
    expect(validateGoals(g)).toBeNull(); expect(validateGoals({ ...g, gross_margin: 0 })).not.toBeNull();
    expect(normWeights([1, 1, 1]).length).toBe(12); expect(normWeights(Array(12).fill(2))[0]).toBeCloseTo(1 / 12);
    expect(seasonalWeights([{ m: "2025-01", sales: 100 }])).toEqual(Array(12).fill(1 / 12));
  });
  it("suggests growth capped at a credible jump", () => {
    const inp = base({ sales: [doc({ id: 1, date: "2026-09-10", net: 10_000, total: 11_500, tax: 1500, paid: 11_500, lines: [{ product_id: 15, item: "AMI 200", quantity: 10, net: 10_000, tax: 1500 }] })],
      purchases: [doc({ id: 9, date: "2026-08-01", net: 5000, total: 5000, lines: [{ product_id: 15, item: "AMI 200", quantity: 10, net: 5000, tax: 0 }] })] });
    const fin = computeFinance(inp, "2025-10-01", "2026-09-30");
    const { goals, basis } = suggestGoals(fin, 50_000, 45);
    expect(goals.sales).toBeGreaterThanOrEqual(basis.annual_sales * 1.2 - 10_000);
    expect(goals.sales).toBeLessThanOrEqual(Math.max(basis.annual_sales * 1.4, basis.annual_sales * 1.2) + 10_000);
    expect(goals.opex_month).toBe(50_000); expect(goals.gross_margin).toBeGreaterThanOrEqual(40);
  });
  it("tracks actual vs target and projects the current month", () => {
    const inp = base({ today: "2026-03-15", sales: [doc({ id: 1, date: "2026-01-20", net: 90_000, total: 103_500, tax: 13_500, paid: 103_500 }), doc({ id: 2, date: "2026-03-05", net: 50_000, total: 57_500, tax: 7500, paid: 57_500 })] });
    const fin = computeFinance(inp, "2026-01-01", "2026-12-31");
    const sc = scorecard(g, 2026, fin, "2026-03-15");
    expect(sc.ytd.months).toBe(2); expect(sc.ytd.sales.target).toBe(200_000); expect(sc.ytd.sales.actual).toBe(90_000);
    expect(sc.rows[2].state).toBe("current"); expect(sc.rows[5].state).toBe("future");
    expect(sc.current?.projected).toBe(Math.round(50_000 / 15 * 31));
    expect(sc.current?.needed_per_day).toBe(Math.round(50_000 / 17));
  });
  it("prices the profit levers", () => {
    expect(levers({ sales: 100_000, cogs: 50_000, opex: 30_000, other: 0 })).toEqual({ net: 20_000, price1: 1000, volume1: 500, cost1: 500, opex1: 300 });
    expect(levers(null)).toBeNull();
  });
});



describe("books start date", () => {
  const s = { target_gross_margin: 45, target_net_margin: 15, books_start: "2026-11-01" };
  const inp = base({ today: "2026-11-10", settings: s, sales: [
    doc({ id: 1, no: "1", date: "2026-08-01", net: 50_000, total: 57_500, tax: 7500, paid: 0, unpaid: 57_500, payment_status: 0, due_days: 30 }),
    doc({ id: 2, no: "2", date: "2026-11-03", net: 10_000, total: 11_500, tax: 1500, paid: 11_500 }),
  ] });
  const fin = computeFinance(inp, "2025-11-01", "2026-11-10");
  it("counts profit only from the start date but keeps older open invoices in receivables", () => {
    expect(fin.period.from).toBe("2026-11-01"); expect(fin.kpi.sales).toBe(10_000); expect(fin.kpi.invoices).toBe(1);
    expect(fin.ar.total).toBe(57_500); expect(fin.books_start).toBe("2026-11-01");
  });
  it("uses a provisional month-to-date baseline after a week", () => {
    expect(fin.baseline?.provisional).toBe(true);
    expect(fin.baseline?.sales).toBeCloseTo(10_000 / (10 / 30.44), 0);
    expect(computeFinance({ ...inp, today: "2026-11-04" }, "2026-11-01", "2026-11-04").baseline).toBeNull();
  });
  it("leaves months before the start out of goal tracking", () => {
    const g: Goals = { sales: 1_200_000, gross_margin: 50, opex_month: 40_000, collection_rate: 90, dso_days: 60, weights: Array(12).fill(1 / 12) };
    const sc = scorecard(g, 2026, computeFinance(inp, "2026-01-01", "2026-12-31"), "2026-12-15");
    expect(sc.rows[7].state).toBe("excluded"); expect(sc.rows[10].state).toBe("closed");
    expect(sc.ytd.months).toBe(1); expect(sc.ytd.sales.target).toBe(100_000); expect(sc.ytd.sales.actual).toBe(10_000);
  });
});
