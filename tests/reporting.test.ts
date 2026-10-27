import { describe, expect, it } from "vitest";
import { normalizeReportType, reportDefinition, reportTitle } from "@/lib/reporting";

describe("reporting", () => {
  it("accepts every supported detailed report type", () => {
    expect(normalizeReportType("reps")).toBe("reps");
    expect(normalizeReportType("visits")).toBe("visits");
    expect(normalizeReportType("products")).toBe("products");
    expect(normalizeReportType("samples")).toBe("samples");
    expect(normalizeReportType("sampleDoctors")).toBe("sampleDoctors");
  });

  it("falls back to rep performance for unknown values", () => {
    expect(normalizeReportType("anything")).toBe("reps");
    expect(normalizeReportType(null)).toBe("reps");
  });

  it("provides Arabic titles for exports", () => {
    expect(reportTitle("samples")).toBe("تفاصيل توزيع العينات");
    expect(reportTitle("sampleDoctors")).toBe("الأطباء الذين حصلوا على عينات");
  });

  it("defines export columns and source rows for each report", () => {
    const definition = reportDefinition("samples");
    expect(definition.source).toBe("samples");
    expect(definition.columns.map(column => column.key)).toContain("doctor_name");
    expect(definition.columns.map(column => column.key)).toContain("quantity");
    expect(reportDefinition("products").columns.map(column => column.key)).toContain("interested");
  });
});
