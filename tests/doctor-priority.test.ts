import { describe, expect, it } from "vitest";
import { nextWorkDay, parseSmart, priority, type PDoctor } from "@/lib/doctor-priority";

const base: PDoctor = { classification: "B", gap_days: 30, days_since: 10, next_follow_up: null, in_plan_next: null, paused: false, hot_product: null, city: "Al Khobar" };
const T = "2026-11-08";

describe("doctor priority", () => {
  it("a due follow-up beats everything and says what to do", () => {
    const p = priority({ ...base, next_follow_up: T, follow_up_note: "يستلم العينات" }, null, T);
    expect(p.reason).toBe("متابعة النهارده: يستلم العينات"); expect(p.tags).toContain("followup");
    expect(p.score).toBeGreaterThan(priority({ ...base, classification: "A", days_since: 50 }, null, T).score);
  });
  it("A overdue is red with the days late and the clinic context", () => {
    const p = priority({ ...base, classification: "A", gap_days: 14, days_since: 26 }, { overdue: 0, due: true, last_order: "2026-10-01" }, T);
    expect(p.reason).toBe("A · متأخر 12 يوم · العيادة جه ميعاد طلبها"); expect(p.tone).toBe("red"); expect(p.tags).toEqual(expect.arrayContaining(["a_late", "late", "reorder"]));
  });
  it("interested without an order is an opportunity", () => {
    const p = priority({ ...base, hot_product: "PETITRA" }, null, T);
    expect(p.reason).toContain("مهتم بـ PETITRA"); expect(p.tone).toBe("teal");
  });
  it("already planned goes down; paused goes to the bottom", () => {
    const late = { ...base, classification: "A", gap_days: 14, days_since: 26 };
    expect(priority({ ...late, in_plan_next: "2026-11-09" }, null, T).score).toBeLessThan(priority(late, null, T).score);
    expect(priority({ ...late, in_plan_next: "2026-11-09" }, null, T).reason).toContain("في الخطة 9/11");
    expect(priority({ ...late, paused: true }, null, T).score).toBeLessThan(0);
  });
  it("on time says when the next visit is", () => {
    expect(priority(base, null, T).reason).toBe("في الميعاد · الزيارة الجاية بعد 20 يوم");
  });
});

describe("helpers", () => {
  it("next working day skips Friday and Saturday", () => {
    expect(nextWorkDay("2026-11-05")).toBe("2026-11-08"); // Thu → Sun
    expect(nextWorkDay("2026-11-08")).toBe("2026-11-09");
  });
  it("smart search understands class, status words and city", () => {
    expect(parseSmart("A متأخر الخبر", ["Al Khobar", "Dammam"])).toEqual({ cls: "A", tags: ["late"], city: "Al Khobar", text: "" });
    expect(parseSmart("متابعات dammam", ["Al Khobar", "Dammam"])).toEqual({ cls: "", tags: ["followup"], city: "Dammam", text: "" });
    expect(parseSmart("noha", ["Dammam"]).text).toBe("noha");
  });
});
