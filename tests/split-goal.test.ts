import { describe, expect, it } from "vitest";
import { splitGoal } from "@/lib/fin-goals";

describe("company goal → rep targets", () => {
  it("shares by current targets, keeps locked reps, and sums exactly to the goal", () => {
    const out = splitGoal(1_000_000, [{ id: "a", annual: 300_000, locked: false }, { id: "b", annual: 100_000, locked: false }, { id: "c", annual: 200_000, locked: true }]);
    expect(out.map(x => x.id)).toEqual(["a", "b"]);
    expect(out[0].amount).toBe(600_000); expect(out.reduce((s, x) => s + x.amount, 0) + 200_000).toBe(1_000_000);
  });
  it("splits equally when a rep has no target yet", () => {
    expect(splitGoal(900_000, [{ id: "a", annual: 420_000, locked: false }, { id: "b", annual: 0, locked: false }, { id: "c", annual: 0, locked: false }]).map(x => x.amount)).toEqual([300_000, 300_000, 300_000]);
  });
  it("splits equally when nobody has a target yet", () => {
    const out = splitGoal(900_000, [{ id: "a", annual: 0, locked: false }, { id: "b", annual: 0, locked: false }, { id: "c", annual: 0, locked: false }]);
    expect(out.map(x => x.amount)).toEqual([300_000, 300_000, 300_000]);
  });
});
