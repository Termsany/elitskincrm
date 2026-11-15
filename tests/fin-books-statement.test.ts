import { describe, expect, it } from "vitest";
import { statement, attention } from "@/lib/fin-books";

const d = (o: Partial<Parameters<typeof statement>[1][number]>) => ({ id: 1, no: "1", date: "2026-10-01", due_days: 30, status: 0, total: 0, paid: 0, unpaid: 0, refund: 0, ...o });

describe("party statement", () => {
  it("customer: invoices minus payments and refunds, ending on what is owed", () => {
    const s = statement("client", [d({ id: 1, no: "A1", total: 1150, unpaid: 650, status: 1 }), d({ id: 2, no: "A2", date: "2026-10-05", total: 230, refund: 230, status: 2 })],
      [{ id: 9, date: "2026-10-03", amount: 500, invoice_id: 1, method: "تحويل" }], "2026-11-15");
    expect(s.lines.map(l => l.balance)).toEqual([1150, 650, 880, 650]);
    expect(s.totals).toMatchObject({ invoiced: 1380, refunds: 230, paid: 500, balance: 650, open: 650, overdue: 650, unallocated: 0 });
    expect(s.open[0]).toMatchObject({ no: "A1", due: "2026-10-31", days_late: 15 });
  });
  it("supplier: balance is what you still owe", () => {
    const s = statement("supplier", [d({ total: 1000, unpaid: 400, status: 1 })], [], "2026-10-10");
    expect(s.totals.balance).toBe(400); expect(s.totals.open).toBe(400); expect(s.totals.overdue).toBe(0);
  });
  it("skips refunded-status documents", () => {
    expect(statement("client", [d({ status: 3, total: 500 })], [], "2026-10-10").lines).toHaveLength(0);
  });
});

describe("attention list", () => {
  const empty = { parties: [], open: [] };
  it("puts supplier money due this week and sales below cost first", () => {
    const a = attention({ ar: empty, ap: { parties: [], open: [{ party: "مورد", unpaid: 5000, due: "2026-11-18", days: -3 }] }, monthly: [],
      price_guard: { below_cost: 2, real_loss: 300 }, stock_alerts: [], cost_coverage: 100, today: "2026-11-15" });
    expect(a.map(x => x.tab)).toEqual(["products", "suppliers"]);
  });
  it("flags an expense month 30% over the average", () => {
    const a = attention({ ar: empty, ap: empty, monthly: [{ m: "2026-08", opex: 10000, sales: 0, cogs: 0 }, { m: "2026-09", opex: 10000, sales: 0, cogs: 0 }, { m: "2026-10", opex: 15000, sales: 0, cogs: 0 }],
      price_guard: { below_cost: 0, real_loss: 0 }, stock_alerts: [], cost_coverage: 100, today: "2026-11-15" });
    expect(a[0].tab).toBe("expenses");
  });
});
