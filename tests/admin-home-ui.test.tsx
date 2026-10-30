import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { AdminHomeView, fetchAdminHome } from "@/app/AdminHomeWorkspace";
import type { AdminHomeData } from "@/app/AdminHomeWorkspace";

const repId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const visitId = "33333333-3333-4333-8333-333333333333";
const data: AdminHomeData = {
  today: "2026-10-28", generated_at: "2026-10-28T09:00:00Z", queueLimit: 8,
  visits: [{ rep_id: repId, rep_name: "مندوب", total: 3, last_visit_at: "2026-10-28T08:00:00Z" }],
  counts: { pendingOrders: 1, pendingDoctorRequests: 0, activeServiceRequests: 2, pendingPlans: 1, overdueTasks: 1, overdueFollowups: 1 },
  queue: [
    { id: orderId, kind: "pendingOrders", title: "طلب منتج", owner: "مندوب", created_at: "2026-10-28T08:00:00Z", href: `#order-${orderId}`, detail_href: `/visits?repId=${repId}&day=2026-10-28&visit=${visitId}&order=${orderId}`, rep_id: repId },
    { id: "request-1", kind: "activeServiceRequests", title: "طلب متابعة", owner: "مندوب", created_at: "2026-10-28T07:00:00Z", href: "/admin/requests?request=request-1" },
    { id: "plan-1", kind: "pendingPlans", title: "خطة أسبوعية", owner: "مندوب", created_at: "2026-10-28T06:00:00Z", href: "/plans?status=pending&planId=plan-1" }
  ]
};
const render = (overrides: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(AdminHomeView, {
  data, loading: false, error: "", onRetry: () => {}, filter: "all", onFilter: () => {}, showAll: false, onShowAll: () => {}, busy: "", onOrderDecision: () => {}, ...overrides
}));
afterEach(() => vi.unstubAllGlobals());

describe("admin home workspace", () => {
  it("prioritizes day visits and exact-record decisions without old hero or duplicate analytics", () => {
    const html = render();
    expect(html).toContain("زيارات اليوم");
    expect(html).toContain("طلبات مفتوحة");
    expect(html).toContain("إجراءات متأخرة");
    expect(html).toContain(`/visits?repId=${repId}&amp;day=2026-10-28`);
    expect(html).toContain('/admin/requests?request=request-1');
    expect(html).toContain(`href="#order-${orderId}"`);
    expect(html).toContain(`/visits?repId=${repId}&amp;day=2026-10-28&amp;visit=${visitId}&amp;order=${orderId}`);
    expect(html).toContain("تفاصيل الزيارة");
    expect(html).toContain("موافقة");
    expect(html).toContain("رفض");
    expect(html).not.toContain("ELITE SKIN COMMAND CENTER");
    expect(html).not.toContain("توزيع الزيارات حسب المدينة");
    expect(html).not.toContain("فلترة مركز القيادة");
  });
  it("keeps an order quick action reachable even when the order is outside the first eight queue rows", () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ id: `task-${i}`, kind: "overdueTasks" as const, title: "مهمة", owner: "مندوب", created_at: "2026-10-28T09:00:00Z", href: "/tasks?view=full&task=1" }));
    const html = render({ data: { ...data, queue: [...items, data.queue[0]], queueLimit: 8 } });
    expect(html).toContain(`href="/visits?repId=${repId}&amp;day=2026-10-28&amp;visit=${visitId}&amp;order=${orderId}"`);
    expect(html).toMatch(new RegExp(`href="/visits\\?[^\"]+order=${orderId}"[^>]*>مراجعة أول طلب`));
    expect(html).toContain("عرض كل الإجراءات");
  });
  it("distinguishes planned visits from a completed last visit", () => {
    const html = render({ data: { ...data, visits: [{ ...data.visits[0], last_visit_at: null }] } });
    expect(html).toContain("لم تُسجل زيارة مكتملة بعد");
    expect(html).not.toContain("لا توجد زيارات اليوم");
  });
  it("makes load failure explicit instead of showing invented zero counts", () => {
    const html = render({ data: null, error: "تعذر التحديث" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("إعادة المحاولة");
    expect(html).not.toContain("زيارات اليوم</");
  });
  it("labels stale last-known data when refresh fails", () => {
    expect(render({ error: "تعذر التحديث" })).toContain("آخر تحديث ناجح");
  });
  it("validates API payload and sends a no-store request", async () => {
    const response = vi.fn().mockResolvedValue({ ok: true, json: async () => data });
    vi.stubGlobal("fetch", response);
    const signal = new AbortController().signal;
    expect(await fetchAdminHome(signal)).toEqual(data);
    expect(response).toHaveBeenCalledWith("/api/admin/home", { cache: "no-store", signal });
    response.mockResolvedValueOnce({ ok: true, json: async () => ({ counts: {} }) });
    await expect(fetchAdminHome(signal)).rejects.toThrow();
  });
});
