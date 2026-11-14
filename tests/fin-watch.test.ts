import { describe, expect, it, vi } from "vitest";
const q = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => q(...a), pool: {} }));
vi.mock("@/lib/daftra", () => ({ daftraConfigured: () => true }));
vi.mock("@/lib/ai-provider", () => ({ loadAi: async () => null, streamAnswer: async () => {} }));
const sold = vi.hoisted(() => ({ qty: 0 }));
vi.mock("@/lib/finance", () => ({ loadInput: async () => ({}), computeFinance: () => ({ pricing: [{ key: "a", name: "A", avg_cost: 40, last_cost: 40, realized_price: 100, list_price: 100, stock: 0, qty_sold: sold.qty }] }) }));
vi.mock("@/lib/plan-link", async () => ({ ...(await vi.importActual<object>("@/lib/plan-link")), repShares: async () => [{ rep_id: "r1", rep_name: "Ali", target: 10000, actual: 1000, items: [{ item: "A", qty: 100, revenue: 10000 }] }] }));
import { sendPlanWatch } from "@/lib/fin-watch";

const PLAN = { target_profit: 0, variable_pct: 0, notes: "", costs: [], items: [{ key: "a", name: "A", include: true, cost: 40, price: 100, mix: 1, qty: 100, actual_qty: null, actual_price: null }] };
function db() {
  const sent: Array<[string, string, string]> = [];
  q.mockReset(); q.mockImplementation(async (sql: string, v: unknown[] = []) => {
    if (sql.startsWith("SELECT id FROM users")) return { rows: [{ id: "admin1" }] };
    if (sql.includes("FROM fin_plans")) return { rows: [{ data: PLAN }] };
    if (sql.startsWith("SELECT 1 FROM task_notifications")) return { rowCount: 0 };
    if (sql.startsWith("INSERT INTO task_notifications")) { sent.push([String(v[0]), String(v[1]), String(v[2])]); return { rowCount: 1 }; }
    return { rows: [] };
  });
  return sent;
}

describe("plan alerts", () => {
  it("on the 10th warns the admins and the rep when sales are behind the plan's pace", async () => {
    const sent = db(); sold.qty = 10; // 1,000 of a 10,000 plan by the 10th of 30 days
    expect(await sendPlanWatch("2026-11-10")).toEqual(["behind"]);
    expect(sent.map(s => s[0])).toEqual(["admin1", "r1"]);
    expect(sent[0][2]).toContain("ناقص"); expect(sent[0][2]).toContain("Ali");
  });
  it("stays quiet when on pace, and on other days", async () => {
    let sent = db(); sold.qty = 40;
    expect(await sendPlanWatch("2026-11-10")).toEqual(["on pace"]); expect(sent).toHaveLength(0);
    sent = db(); expect(await sendPlanWatch("2026-11-11")).toEqual([]); expect(sent).toHaveLength(0);
  });
  it("on the 1st sends last month's plan review", async () => {
    const sent = db(); sold.qty = 80;
    expect(await sendPlanWatch("2026-12-01")).toEqual(["review"]);
    expect(sent[0][1]).toBe("plan_review"); expect(sent[0][2]).toContain("8,000 من 10,000");
  });
});
