import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mock.query, pool: { connect: mock.connect } }));
import { parseExpense, review, ExpenseError, type Category } from "@/lib/expenses";

const cat = (o: Partial<Category> = {}): Category => ({ id: "11111111-1111-4111-8111-111111111111", code: "fuel", name: "وقود", icon: "fuel", monthly_cap: 1500, receipt_required_above: 100, allows_doctor: false, active: true, sort: 1, ...o });
const base = { category_id: cat().id, amount: 115, expense_date: "2026-10-30", description: "بنزين للمشوار" };
const doc = "22222222-2222-4222-8222-222222222222";

describe("expense policy", () => {
  it("accepts a valid expense and splits 15% VAT out of the inclusive amount", () => {
    const x = parseExpense({ ...base, tax_invoice: true }, [cat()], "2026-10-31");
    expect(x.amount).toBe(115); expect(x.vat_amount).toBe(15);
  });
  it("has no VAT for non-tax receipts", () => { expect(parseExpense(base, [cat()], "2026-10-31").vat_amount).toBe(0); });
  it.each([
    [{ amount: 0 }, "المبلغ"], [{ amount: -5 }, "المبلغ"], [{ amount: 200000 }, "المبلغ"],
    [{ expense_date: "2026-11-01" }, "المستقبل"], [{ expense_date: "2026-08-01" }, "الأقدم"], [{ expense_date: "2026-02-30" }, "تاريخ"],
    [{ description: "x" }, "وصف"], [{ category_id: "33333333-3333-4333-8333-333333333333" }, "بند المصروف"],
  ])("rejects %o", (patch, msg) => { expect(() => parseExpense({ ...base, ...patch }, [cat()], "2026-10-31")).toThrow(msg as string); });
  it("rejects inactive categories", () => { expect(() => parseExpense(base, [cat({ active: false })], "2026-10-31")).toThrow(ExpenseError); });
  it("links a doctor only where the category allows it", () => {
    expect(() => parseExpense({ ...base, doctor_id: doc }, [cat()], "2026-10-31")).toThrow("ما يرتبط بطبيب");
    expect(parseExpense({ ...base, doctor_id: doc }, [cat({ allows_doctor: true })], "2026-10-31").doctor_id).toBe(doc);
  });
});

describe("expense review", () => {
  const id = "44444444-4444-4444-8444-444444444444", rep = "55555555-5555-4555-8555-555555555555";
  let sql: string[];
  const db = (status: string) => { sql = []; mock.connect.mockResolvedValue({ query: vi.fn(async (s: string) => { sql.push(s); if (s.startsWith("SELECT id, rep_id, status")) return { rowCount: 1, rows: [{ id, rep_id: rep, status, amount: 100 }] }; return { rows: [], rowCount: 1 }; }), release: vi.fn() }); };
  beforeEach(() => vi.resetAllMocks());
  it("approves pending expenses atomically and notifies the rep", async () => {
    db("pending"); await review("admin", [id], "approve", "", "");
    expect(sql[0]).toBe("BEGIN"); expect(sql.some(s => s.includes("FOR UPDATE"))).toBe(true);
    expect(sql.some(s => s.startsWith("INSERT INTO task_notifications"))).toBe(true); expect(sql.at(-1)).toBe("COMMIT");
  });
  it("refuses to re-decide an already reviewed expense", async () => { db("approved"); await expect(review("admin", [id], "reject", "سبب واضح", "")).rejects.toThrow("تمت مراجعتها"); expect(sql.at(-1)).toBe("ROLLBACK"); });
  it("only reimburses approved expenses", async () => { db("pending"); await expect(review("admin", [id], "reimburse", "", "TRX-1")).rejects.toThrow("المعتمدة فقط"); });
  it("requires a rejection reason and valid ids before touching the database", async () => {
    await expect(review("admin", [id], "reject", "", "")).rejects.toThrow("سبب الرفض");
    await expect(review("admin", ["bad"], "approve", "", "")).rejects.toThrow("غير صحيح");
    expect(mock.connect).not.toHaveBeenCalled();
  });
});
