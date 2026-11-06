import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
import { computeFinance, type Input, type Doc } from "@/lib/finance";
import { numberGaps, runAudit, auditScore, type Check } from "@/lib/fin-audit";
import { planOf, suggestGoals, scorecard, seasonalWeights, normWeights, validateGoals, levers, type Goals } from "@/lib/fin-goals";
import { cashForecast, collectChance } from "@/lib/fin-cash";
import { priceFor, maxDiscount } from "@/app/daftra-sales/pricecalc";

const doc = (o: Partial<Doc>): Doc => ({ id: 1, no: "1", date: "2026-09-10", due_days: 30, party_id: 1, party: "عميل", city: "", branch: "", payment_status: 2, net: 0, tax: 0, total: 0, paid: 0, unpaid: 0, refund: 0, lines: [], ...o });
const base = (o: Partial<Input> = {}): Input => ({
  sales: [], purchases: [], products: [{ id: 15, name: "AMI 200", code: "", list_price: 900, buy_price: 0, average_cost: 0, min_price: null, stock: 10, active: true }],
  payments: [], entries: [], accounts: [{ id: 1, code: "5214", name: "رواتب" }],
  overrides: {}, fixed: [], settings: { target_gross_margin: 45, target_net_margin: 15 }, today: "2026-10-31", ...o });

describe("invoice number gaps", () => {
  it("understands Daftra's hexadecimal numbering", () => {
    expect(numberGaps(["00008E", "00008F", "000090"])).toEqual([]);
    expect(numberGaps(["00008E", "000091"])).toEqual(["00008F", "000090"]);
    expect(numberGaps(["98", "101"])).toEqual(["99", "100"]);
    expect(numberGaps(["5"])).toEqual([]);
  });
});

describe("audit", () => {
  const line = { product_id: 15, item: "AMI 200", quantity: 1, net: 1000, tax: 0 };
  const inp = base({
    purchases: [doc({ id: 50, no: "P1", date: "2026-08-01", net: 400, total: 400, lines: [{ ...line, net: 400 }] })],
    sales: [doc({ id: 1, no: "00008E", date: "2026-09-01", net: 1000, tax: 0, total: 1000, paid: 1000, lines: [line] }),
      doc({ id: 2, no: "000091", date: "2026-09-02", net: 1000, tax: 150, total: 1150, paid: 1150, lines: [{ ...line, tax: 150 }] })],
  });
  const fin = computeFinance(inp, "2026-09-01", "2026-09-30");
  const checks = runAudit(inp, fin, [], "2026-09-01", "2026-09-30");
  const by = (id: string) => checks.find(c => c.id === id)!;
  it("flags missing VAT and skipped invoice numbers", () => {
    expect(by("vat_zero").findings.map(f => f.key)).toEqual(["vat_zero:1"]);
    expect(by("vat_zero").findings[0].amount).toBe(150);
    expect(by("gaps").findings.length).toBeGreaterThan(0);
  });
  it("gives every check an explanation and a fix", () => {
    for (const c of checks) { expect(c.why.length).toBeGreaterThan(10); expect(c.fix.length).toBeGreaterThan(5); }
  });
  it("scores 100 only when every finding is reviewed", () => {
    const s0 = auditScore(checks); expect(s0).toBeLessThan(100);
    const reviewed: Check[] = checks.map(c => ({ ...c, findings: c.findings.map(f => ({ ...f, review: { status: "ok", note: "", at: "" } })) }));
    expect(auditScore(reviewed)).toBe(100);
  });
});

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

describe("cash forecast", () => {
  const fin = { ar: { open: [{ id: 1, no: "A", date: "2026-10-01", party: "عميل", unpaid: 10_000, due: "2026-11-10", days: 0 }, { id: 2, no: "B", date: "2026-07-01", party: "عميل", unpaid: 8000, due: "2026-08-01", days: 95 }] },
    ap: { open: [{ id: 3, no: "P", date: "2026-10-01", party: "مورد", unpaid: 4000, due: "2026-11-03", days: 0 }] }, baseline: { opex: 30_000, sales_gross: 0 } } as unknown as Parameters<typeof cashForecast>[0];
  const f = cashForecast(fin, { today: "2026-11-01", fixed: [{ id: "x", name: "رواتب", category: "salaries", monthly_amount: 20_000, start_month: "2026-01", end_month: null, notes: "" }] }, 5000, { includeNew: false });
  it("uses collection odds and puts fixed costs on the 27th", () => {
    expect(collectChance(0)).toBe(0.95); expect(collectChance(95)).toBe(0.2);
    expect(f.rows[0].from).toBe("2026-11-01"); // Sunday-start weeks
    expect(f.rows[1].in_ar).toBe(Math.round(9500 + 400));
    expect(f.rows.reduce((s, r) => s + r.out_fixed, 0)).toBe(60_000); // Nov, Dec, Jan
    expect(f.assumptions.variable_monthly).toBe(10_000);
    expect(Math.abs(f.total_out - (4000 + 60_000 + 10_000 / 4.33 * 13))).toBeLessThan(10); // weekly rounding
    expect(f.first_negative_week).not.toBeNull();
  });
});

describe("price calculator", () => {
  it("adds overheads and finds the largest safe discount", () => {
    expect(priceFor(60, 0.4)).toBe(100); expect(priceFor(60, 0.96)).toBeNull();
    expect(maxDiscount(200, 150)).toBe(25); expect(maxDiscount(100, 120)).toBe(0); expect(maxDiscount(null, 10)).toBeNull();
  });
});
