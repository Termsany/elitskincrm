import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn(), pool: {} }));
import { levelOf, QUICK_APPROVE } from "@/lib/notification-levels";
import { morningText, type Morning } from "@/lib/morning-summary";

describe("notification levels", () => {
  it("counts only actionable kinds as important", () => {
    expect(levelOf("plan_pending")).toBe("important");
    expect(levelOf("expense_pending")).toBe("important");
    expect(levelOf("plan_approved")).toBe("info");
    expect(levelOf("visit_weekly_report")).toBe("info");
    expect(levelOf("morning_summary")).toBe("important");
    expect(QUICK_APPROVE).toEqual(["plan_pending", "expense_pending"]);
  });
});

describe("morning summary text", () => {
  it("lists only what is non-zero", () => {
    const m: Morning = { date: "2026-11-08", yesterday: "2026-11-07", visits: { total: 7, reps: [{ name: "A", n: 7 }], idle: ["B"] }, pending: 3,
      overdue: { amount: 375596.4, invoices: 12 }, onLeave: [], followupsToday: 0, salesYesterday: 0 };
    expect(morningText(m)).toBe("☀️ إمبارح 7 زيارة · 1 من غير زيارات · 3 مستني قرارك · متأخرات 375,596 ر.س");
  });
});
