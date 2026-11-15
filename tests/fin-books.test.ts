import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
import { computeFinance, type Input, type Doc } from "@/lib/finance";
import { numberGaps, runAudit, auditScore, type Check } from "@/lib/fin-audit";
import { cashForecast, collectChance } from "@/lib/fin-cash";

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

