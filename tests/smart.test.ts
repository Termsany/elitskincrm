import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn(), pool: {} }));
import { ruleInsights } from "@/lib/visit-insights";
import { distribute, nextWeekStart, workDays } from "@/lib/auto-plan";
import { collectionPriority } from "@/lib/smart";

describe("visit note insights (rules)", () => {
  it("reads Arabic objections and a follow-up", () => {
    const i = ruleInsights("الطبيبة لم تجرب المنتج حتى الآن وعندها تحفظ على السعر، هترجعلي الأسبوع الجاي", "2026-11-08");
    expect(i.objections).toEqual(expect.arrayContaining(["price", "not_tried"]));
    expect(i.follow_up?.date).toBe("2026-11-15");
    expect(i.next).toBe("جهّز عرض سعر أو باقة");
  });
  it("reads English positives", () => {
    const i = ruleInsights("Dr will recommend arche and will try to come", "2026-11-08");
    expect(i.positives).toEqual(expect.arrayContaining(["recommend", "will_try"]));
    expect(i.sentiment).toBe("positive");
  });
  it("stays quiet on neutral notes", () => {
    const i = ruleInsights("تصوير اليوم", "2026-11-08");
    expect(i.objections).toEqual([]); expect(i.follow_up).toBeNull();
  });
});

describe("auto plan", () => {
  it("plans the next Sunday–Thursday", () => {
    expect(nextWeekStart("2026-11-12")).toBe("2026-11-15"); // Thursday → next Sunday
    expect(workDays("2026-11-15")).toEqual(["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"]);
  });
  it("keeps a clinic on one day and caps visits per day", () => {
    const c = (id: string, city: string, clinic: string) => ({ id, name: id, city, clinic, cls: "A", score: 80, reason: "" });
    const out = distribute([c("1", "Khobar", "X"), c("2", "Khobar", "X"), c("3", "Dammam", "Y"), c("4", "Dammam", "Y")], ["d1", "d2"], 2);
    const day = (id: string) => out.find(o => o.id === id)!.date;
    expect(day("1")).toBe(day("2")); expect(day("3")).toBe(day("4")); expect(day("1")).not.toBe(day("3"));
  });
});

describe("collection priority", () => {
  it("weights old debt higher", () => { expect(collectionPriority(1000, 60)).toBe(3000); expect(collectionPriority(1000, -5)).toBe(1000); });
});
