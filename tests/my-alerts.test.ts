import { describe, expect, it } from "vitest";
import { alertCount } from "@/lib/my-alerts";

describe("alertCount", () => {
  it("counts only overdue doctors that are not already planned", () => {
    expect(alertCount([{ next_planned: null }, { next_planned: "2026-11-10" }, { next_planned: null }])).toBe(2);
    expect(alertCount([])).toBe(0);
  });
});
