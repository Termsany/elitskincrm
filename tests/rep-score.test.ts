import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
import { DEFAULT_WEIGHTS, parts, score, type Raw } from "@/lib/rep-score-core";
import { monthFrac, rollCities, type TDoctor } from "@/lib/territory";
import { repWrapText } from "@/lib/plan-wrap";

const raw = (o: Partial<Raw> = {}): Raw => ({ planned: 40, planDone: 40, required: 50, covered: 50, aRequired: 20, aCovered: 20, target: 30000, expected: 15000, mtd: 15000,
  completed: 40, productive: 40, total: 40, cancelled: 0, workDays: 10, idleDays: 0, ...o });

describe("rep score", () => {
  it("is 100 when every part is full", () => {
    expect(score(parts(raw()), DEFAULT_WEIGHTS)).toMatchObject({ score: 100, lift: null });
  });
  it("weighs the parts and names the one that lifts the score most", () => {
    const s = score(parts(raw({ planDone: 20, mtd: 12000 })), DEFAULT_WEIGHTS);
    // plan 50% → -15, sales 80% → -5
    expect(s.score).toBe(80);
    expect(s.lift).toBe("plan");
    expect(s.liftPts).toBe(15);
  });
  it("leaves out parts with nothing to measure and scales the rest", () => {
    const p = parts(raw({ target: 0, expected: 0, mtd: 0, planned: 0, planDone: 0 }));
    expect(p.sales).toBeNull(); expect(p.plan).toBeNull();
    expect(score(p, DEFAULT_WEIGHTS).score).toBe(100);
  });
  it("A coverage counts half of coverage, and sales above target cap at 100%", () => {
    const p = parts(raw({ aCovered: 0, mtd: 40000 }));
    expect(p.coverage).toBe(0.5); expect(p.sales).toBe(1);
  });
  it("discipline drops with cancellations and idle work days", () => {
    expect(parts(raw({ cancelled: 10, idleDays: 2 })).discipline).toBeCloseTo(1 - 0.5 * 0.25 - 0.5 * 0.2);
  });
  it("is null with no data at all", () => {
    const p = parts(raw({ planned: 0, required: 0, aRequired: 0, expected: 0, completed: 0, total: 0, workDays: 0 }));
    expect(score(p, DEFAULT_WEIGHTS).score).toBeNull();
  });
});

const doc = (o: Partial<TDoctor>): TDoctor => ({ id: "x", name: "x", clinic: "", clinic_id: null, city: "Dammam", cls: "B", phone: "", reason: "", icon: "", tone: "slate", score: 0, late: false,
  month_visits: 0, required: 2, in_plan: null, sales: 0, overdue: 0, ...o });

describe("territory", () => {
  it("prorates the month", () => {
    expect(monthFrac("2026-11-15")).toBeCloseTo(0.5);
    expect(monthFrac("2026-11-15", "2026-10")).toBe(1);
  });
  it("rolls doctors up per city, caps extra visits and counts clinic money once", () => {
    const c = rollCities([
      doc({ id: "1", cls: "A", required: 4, month_visits: 6, clinic: "Hosn", clinic_id: "c1", sales: 1000, overdue: 200, late: true }),
      doc({ id: "2", required: 2, month_visits: 1, clinic: "Hosn", clinic_id: "c1", sales: 1000, overdue: 200, in_plan: "2026-11-16" }),
      doc({ id: "3", city: "Khobar", required: 1 }),
    ], 0.5);
    const d = c.find(x => x.city === "Dammam")!;
    expect(d).toMatchObject({ doctors: 2, a: 1, required: 3, done: 5, late: 1, planned: 1, sales: 1000, overdue: 200 });
    expect(c.find(x => x.city === "Khobar")!.required).toBe(1);
  });
});

describe("week wrap", () => {
  it("tells the rep their week, missed visits carried over and the score", () => {
    expect(repWrapText({ done: 30, planned: 40, aDone: 8, aPlanned: 10, missed: 3 }, 72, "الالتزام بالخطة"))
      .toBe("📊 أسبوعك: نفذت 30 من 40 زيارة في الخطة · A 8/10 · 3 فاتت واترحّلت للأسبوع ده · تقييمك الشهر ده 72/100 — ركّز على الالتزام بالخطة");
  });
});
