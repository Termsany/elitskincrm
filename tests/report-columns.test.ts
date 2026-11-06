import { describe, expect, it } from "vitest";
import { REPORTS } from "@/lib/report-extra";

describe("report column types", () => {
  it("sampleDoctors lists rep names as text (was rendered as NaN)", () => {
    const col = REPORTS.find(r => r.id === "sampleDoctors")!.columns.find(c => c.key === "reps")!;
    expect(col.type).toBe("text");
  });
  it("numeric reps count stays numeric in other reports", () => {
    const others = REPORTS.filter(r => r.id !== "sampleDoctors").flatMap(r => r.columns.filter(c => c.key === "reps"));
    for (const c of others) expect(c.type).toBe("int");
  });
  it("followups due is a date column", () => {
    expect(REPORTS.find(r => r.id === "followups")!.columns.find(c => c.key === "due")!.type).toBe("date");
  });
});
