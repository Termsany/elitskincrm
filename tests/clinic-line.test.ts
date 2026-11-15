import { describe, expect, it } from "vitest";
import { clinicLines } from "@/lib/clinic-line";

describe("clinic account in one line", () => {
  it("puts overdue money first, then the ordering rhythm", () => {
    expect(clinicLines({ overdue: 4865, oldest: 5, status: "stopped", days_since: 60 }).map(l => [l.tone, l.text])).toEqual([["bad", "العيادة عليها 4,865 ر.س متأخرة من 5 يوم — اسأل عن السداد"], ["warn", "العيادة وقفت طلب من 60 يوم"]]);
  });
  it("says when a reorder is due, or when the last order was", () => {
    expect(clinicLines({ due: true, days_since: 31 })[0].text).toBe("العيادة جه ميعاد طلبها");
    expect(clinicLines({ unpaid: 1000, days_since: 4, top: ["A", "B", "C"] }).map(l => l.text)).toEqual(["العيادة عليها 1,000 ر.س لسه ما استحقش", "آخر طلب للعيادة من 4 يوم · A، B"]);
    expect(clinicLines({})).toEqual([]);
  });
});
