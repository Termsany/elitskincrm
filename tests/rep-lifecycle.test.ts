import { describe, expect, it } from "vitest";
import { canConfirmRepReset } from "@/lib/rep-lifecycle";

describe("rep reset confirmation", () => {
  it("requires exact rep name and explicit reset phrase", () => {
    expect(canConfirmRepReset("Ahmed Ali", "Ahmed Ali", "تصفير")).toBe(true);
    expect(canConfirmRepReset("Ahmed Ali", "ahmed ali", "تصفير")).toBe(false);
    expect(canConfirmRepReset("Ahmed Ali", "Ahmed Ali ", "تصفير")).toBe(false);
    expect(canConfirmRepReset("Ahmed Ali", "Ahmed Ali", "حذف")).toBe(false);
  });
});
