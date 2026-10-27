import { describe, expect, it } from "vitest";
import { isPlanWorkspacePayload, planWorkspaceTabs, planTargetProgress, representativeCanReceivePlan } from "@/lib/plan-workspace";

describe("plan workspace layout", () => {
  it("shows role-specific Arabic workspaces", () => {
    expect(planWorkspaceTabs(true).map(tab => tab.id)).toEqual(["overview", "review", "builder", "plans", "execution"]);
    expect(planWorkspaceTabs(false).map(tab => tab.id)).toEqual(["overview", "builder", "plans", "execution"]);
  });

  it("calculates bounded visit target progress", () => {
    expect(planTargetProgress(7, 10)).toBe(70);
    expect(planTargetProgress(15, 10)).toBe(100);
    expect(planTargetProgress(0, 0)).toBe(0);
  });

  it("does not treat API error payloads as an empty workspace", () => {
    expect(isPlanWorkspacePayload({ plans: [], summary: { total: 0 } })).toBe(true);
    expect(isPlanWorkspacePayload({ error: "Unauthorized" })).toBe(false);
    expect(isPlanWorkspacePayload(null)).toBe(false);
  });

  it("allows new plans only for active representatives", () => {
    expect(representativeCanReceivePlan(true)).toBe(true);
    expect(representativeCanReceivePlan(false)).toBe(false);
  });
});
