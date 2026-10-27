import { describe, expect, it } from "vitest";
import {
  dashboardMobileLinks,
  dashboardQuickLinks,
  performanceTone,
  salesAttainment,
} from "../src/lib/dashboard-workspace";

describe("dashboard workspace", () => {
  it("returns direct role-specific workflow links", () => {
    expect(dashboardQuickLinks("sales_rep").map((item) => item.href)).toEqual([
      "/visits/new",
      "/doctors",
      "/plans",
      "/products",
      "/tasks",
      "/sales",
    ]);
    expect(dashboardQuickLinks("admin").map((item) => item.href)).toEqual([
      "/work",
      "/admin/reps",
      "/plans",
      "/visits",
      "/admin/doctor-stats",
      "/admin/reports",
    ]);
  });

  it("clamps sales attainment and calculates remaining target", () => {
    expect(salesAttainment(1_000_000, 680_000)).toEqual({
      target: 1_000_000,
      achieved: 680_000,
      remaining: 320_000,
      percentage: 68,
    });
    expect(salesAttainment(0, 500)).toEqual({
      target: 0,
      achieved: 500,
      remaining: 0,
      percentage: 0,
    });
    expect(salesAttainment(100, 160).percentage).toBe(100);
  });

  it("returns touch-first mobile navigation for each role", () => {
    expect(dashboardMobileLinks("sales_rep").map((item) => item.href)).toEqual([
      "/", "/doctors", "/visits/new", "/work", "#more",
    ]);
    expect(dashboardMobileLinks("admin").map((item) => item.href)).toEqual([
      "/admin", "/work", "/admin/reps", "/admin/reports", "#more",
    ]);
  });

  it("classifies representative performance without hiding low performance", () => {
    expect(performanceTone(88)).toBe("good");
    expect(performanceTone(63)).toBe("watch");
    expect(performanceTone(43)).toBe("risk");
    expect(performanceTone(Number.NaN)).toBe("unknown");
  });
});
