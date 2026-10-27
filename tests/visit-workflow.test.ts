import { describe, expect, it } from "vitest";
import { buildVisitQuery, canEditVisit, getVisitStatusMeta } from "@/lib/visit-workflow";

describe("visit workflow", () => {
  it("provides clear Arabic state labels for daily visit statuses", () => {
    expect(getVisitStatusMeta("completed")).toEqual({ label: "مكتملة", tone: "success", icon: "✓" });
    expect(getVisitStatusMeta("planned")).toEqual({ label: "مجدولة", tone: "info", icon: "◷" });
    expect(getVisitStatusMeta("cancelled")).toEqual({ label: "ملغاة", tone: "danger", icon: "×" });
  });

  it("allows reps to edit only their visits from the last 24 hours", () => {
    const now = Date.parse("2026-10-25T12:00:00.000Z");
    expect(canEditVisit({ isAdmin: false, userId: "rep-1", visit: { sales_rep_id: "rep-1", visited_at: "2026-10-25T01:00:00.000Z" }, now })).toBe(true);
    expect(canEditVisit({ isAdmin: false, userId: "rep-1", visit: { sales_rep_id: "rep-1", visited_at: "2026-10-24T11:59:59.000Z" }, now })).toBe(false);
    expect(canEditVisit({ isAdmin: false, userId: "rep-2", visit: { sales_rep_id: "rep-1", visited_at: "2026-10-25T01:00:00.000Z" }, now })).toBe(false);
    expect(canEditVisit({ isAdmin: true, userId: "admin-1", visit: { sales_rep_id: "rep-1", visited_at: "2020-01-01T00:00:00.000Z" }, now })).toBe(true);
  });

  it("builds an empty query when daily filters are reset", () => {
    expect(buildVisitQuery({ q: "", repId: "", status: "", from: "", to: "" })).toBe("limit=100");
    expect(buildVisitQuery({ q: "doctor", repId: "rep-1", status: "completed", from: "2026-10-01", to: "2026-10-25" })).toBe("q=doctor&repId=rep-1&status=completed&from=2026-10-01&to=2026-10-25&limit=100");
  });
});
