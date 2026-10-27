import { describe, expect, it } from "vitest";
import { canCancelServiceRequest } from "@/lib/request-cancellation";

describe("service request cancellation permissions", () => {
  const rep = { id: "rep-1", role: "sales_rep" };
  it.each(["pending", "in_progress", "needs_info"])("allows the requester to cancel a %s request", (status) => {
    expect(canCancelServiceRequest(rep, { requester_id: "rep-1", status })).toBe(true);
  });
  it.each(["completed", "rejected", "cancelled"])("does not allow cancelling a %s request", (status) => {
    expect(canCancelServiceRequest(rep, { requester_id: "rep-1", status })).toBe(false);
  });
  it("does not allow another rep or an admin to cancel the request", () => {
    expect(canCancelServiceRequest(rep, { requester_id: "rep-2", status: "pending" })).toBe(false);
    expect(canCancelServiceRequest({ id: "admin-1", role: "admin" }, { requester_id: "rep-1", status: "pending" })).toBe(false);
  });
});
