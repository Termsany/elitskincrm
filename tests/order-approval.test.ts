import { describe, expect, it } from "vitest";
import { canTransitionOrder, orderStatusLabel } from "@/lib/order-approval";

describe("order approval workflow", () => {
  it("allows an admin to approve or reject a pending order", () => {
    expect(canTransitionOrder("pending", "approved", "admin")).toBe(true);
    expect(canTransitionOrder("pending", "rejected", "admin")).toBe(true);
  });

  it("prevents reps from approving orders", () => {
    expect(canTransitionOrder("pending", "approved", "sales_rep")).toBe(false);
  });

  it("does not approve an already rejected order", () => {
    expect(canTransitionOrder("rejected", "approved", "admin")).toBe(false);
  });

  it("provides Arabic status labels", () => {
    expect(orderStatusLabel("pending")).toBe("بانتظار الموافقة");
    expect(orderStatusLabel("approved")).toBe("تمت الموافقة");
  });
});
