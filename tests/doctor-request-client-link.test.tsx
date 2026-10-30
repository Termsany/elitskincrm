import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDoctorRequests } from "@/app/admin/requests/DoctorRequestsClient";
afterEach(() => vi.unstubAllGlobals());
describe("linked doctor request loading", () => {
  it("passes the exact request ID to the server so it survives the 500-row preview", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ requests: [{ id: "target", status: "pending" }] }) });
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchDoctorRequests("target")).toEqual([{ id: "target", status: "pending" }]);
    expect(fetcher).toHaveBeenCalledWith("/api/doctor-requests?doctorRequest=target", { cache: "no-store" });
  });
  it("throws on a failed load instead of treating the pending queue as empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    await expect(fetchDoctorRequests("target")).rejects.toThrow("تعذر تحميل طلبات الأطباء");
  });
});
