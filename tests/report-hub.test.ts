import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
import { parseHub, prevOf } from "@/lib/report-hub";
import { reportText, salesDrop } from "@/lib/report-notify";

describe("report filters", () => {
  it("defaults to this month and compares with the same length before", () => {
    const f = parseHub(new URLSearchParams(""), "2026-11-14");
    expect(f).toEqual({ from: "2026-11-01", to: "2026-11-14", repId: "", city: "" });
    expect(prevOf(f)).toMatchObject({ from: "2026-10-18", to: "2026-10-31" });
  });
  it("ignores bad dates and ids", () => {
    expect(parseHub(new URLSearchParams("from=2026-12-01&to=2026-11-01&repId=x"), "2026-11-14")).toMatchObject({ from: "2026-11-01", repId: "" });
  });
});

describe("reports in the bell", () => {
  it("alerts when the last 7 days are 30% under the usual week", () => {
    expect(salesDrop(6000, [10000, 10000, 10000, 10000])).toEqual({ avg: 10000, drop: 40 });
    expect(salesDrop(8000, [10000, 10000, 10000, 10000])).toBeNull();
    expect(salesDrop(0, [0, 0])).toBeNull();
  });
  it("writes the week report from the summary", () => {
    const t = reportText("📈 تقرير الأسبوع", {
      kpis: [{ id: "sales", label: "المبيعات", value: 12000, unit: "sar", prev: 10000, target: null, tone: "good", view: "sales" },
        { id: "visits", label: "الزيارات", value: 40, unit: "n", prev: 50, target: null, tone: "warn", view: "reps" }],
      decisions: [{ level: "danger", text: "عميل X بطّل يطلب", detail: "", href: "/", weight: 1 }], more: 0,
    }, { done: 30, planned: 40, top: { name: "أحمد", score: 85 }, low: { name: "سارة", score: 40, weakest: "تغطية المنطقة" } });
    expect(t).toBe("📈 تقرير الأسبوع\n• المبيعات 12,000 ر.س (▲ 20%)\n• الزيارات 40 (▼ 20%) · تنفيذ الخطة 75%\n• الأعلى تقييمًا أحمد (85) · محتاج متابعة سارة (40 — تغطية المنطقة)\n⚡ أهم قرار: عميل X بطّل يطلب");
  });
});
