import { describe, expect, it, vi } from "vitest";
const q = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => q(...a), pool: {} }));
vi.mock("@/lib/daftra", () => ({ daftraConfigured: () => true }));
vi.mock("@/lib/finance", () => ({ loadInput: async () => ({}), computeFinance: () => ({ period: { from: "2026-11-01" }, books_start: "2026-11-01", kpi: {}, monthly: [], baseline: null, plan: {}, settings: {}, fixed: [], salesByProduct: [], salesByClient: [], ar: { total: 0, overdue: 0, buckets: {}, parties: [] } }) }));
vi.mock("@/lib/fin-link", () => ({ financeLink: async () => ({}) }));
const ai = vi.hoisted(() => ({ cfg: null as unknown, reply: "" }));
vi.mock("@/lib/ai-provider", () => ({ loadAi: async () => ai.cfg, streamAnswer: async (_c: unknown, _s: string, _d: string, _m: unknown, on: (t: string) => void) => on(ai.reply) }));
import { sendFinanceBrief } from "@/lib/fin-brief";

describe("daily AI money brief", () => {
  it("does nothing without an AI provider", async () => {
    ai.cfg = null; q.mockReset();
    expect(await sendFinanceBrief("2026-11-14")).toEqual({ sent: 0, skipped: "ai" });
    expect(q).not.toHaveBeenCalled();
  });
  it("sends one notification per admin that hasn't had today's brief", async () => {
    ai.cfg = { provider: "openai" }; ai.reply = "المبيعات 120,000 وهتقفل على 260,000 — 87% من الهدف.\n- كلم عيادة X النهارده";
    q.mockReset(); q.mockImplementation(async (sql: string) => sql.startsWith("SELECT u.id") ? { rows: [{ id: "a1" }, { id: "a2" }] } : { rows: [] });
    expect(await sendFinanceBrief("2026-11-14")).toEqual({ sent: 2 });
    const inserts = q.mock.calls.filter(c => String(c[0]).startsWith("INSERT"));
    expect(inserts).toHaveLength(2);
    expect(String(inserts[0][1][1])).toContain("ملخص المستشار المالي");
    expect(inserts[0][1][2]).toBe("2026-11-14");
  });
  it("skips an empty answer and never throws", async () => {
    ai.reply = "  "; q.mockReset(); q.mockResolvedValue({ rows: [{ id: "a1" }] });
    expect((await sendFinanceBrief("2026-11-14")).sent).toBe(0);
    q.mockRejectedValue(new Error("db down"));
    expect(await sendFinanceBrief("2026-11-14")).toEqual({ sent: 0, skipped: "error" });
  });
});
