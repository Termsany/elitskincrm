import { describe, expect, it } from "vitest";
import { currentWeekStart, pace, planChecks, suggestDay, weekDays } from "@/lib/plan-week-core";

describe("plan week", () => {
  it("week starts Sunday; Fri/Sat show the coming week", () => {
    expect(currentWeekStart("2026-11-10")).toBe("2026-11-08"); // Tue
    expect(currentWeekStart("2026-11-13")).toBe("2026-11-15"); // Fri
    expect(weekDays("2026-11-08")).toEqual(["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]);
  });
  it("suggests a remaining day already in the same city, else the lightest", () => {
    const days = [{ date: "2026-11-08", count: 2, cities: ["Dammam"] }, { date: "2026-11-10", count: 5, cities: ["Dammam"] }, { date: "2026-11-11", count: 1, cities: ["Al Khobar"] }];
    expect(suggestDay("Dammam", days, "2026-11-09")).toBe("2026-11-10");
    expect(suggestDay("Jubail", days, "2026-11-09")).toBe("2026-11-11");
    expect(suggestDay("Dammam", days, "2026-11-13")).toBeNull();
  });
  it("pace counts what is due so far and projects the week", () => {
    const p = pace([{ date: "2026-11-08", done: true }, { date: "2026-11-08", done: false }, { date: "2026-11-10", done: false }, { date: "2026-11-11", done: false }], "2026-11-10");
    expect(p).toMatchObject({ done: 1, missed: 1, planned: 4, rate: 50, projected: 2, label: "risk" });
    expect(pace([], "2026-11-10").label).toBe("none");
  });
  it("plan checks flag missing A, repeated C, empty days and duplicates", () => {
    const days = ["2026-11-08", "2026-11-09"];
    const c = planChecks([{ doctor_id: "a", date: "2026-11-08", cls: "A" }, { doctor_id: "c", date: "2026-11-08", cls: "C" }, { doctor_id: "c", date: "2026-11-08", cls: "C" }], days, 3);
    expect(c.map(x => `${x.ok ? "✓" : "!"}${x.text}`)).toEqual(["!دكاترة A 1/3", "!1 أطباء C متكررين", "!الاثنين فاضي", "!طبيب متكرر في نفس اليوم"]);
  });
});
