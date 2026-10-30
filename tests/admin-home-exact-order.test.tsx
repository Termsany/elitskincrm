import { describe, expect, it } from "vitest";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VisitDetailPanel } from "@/app/admin/visits/AdminVisitsOverview";

const visitId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const anotherOrderId = "33333333-3333-4333-8333-333333333333";
const visit: ComponentProps<typeof VisitDetailPanel>["visit"] = {
  id: visitId, visited_at: "2026-10-28T10:00:00Z", status: "completed", doctor_name: "طبيب", clinic_name: "عيادة", city: "الرياض", rep_name: "مندوب",
  notes: "ملاحظات", follow_up_at: null, follow_up_note: "", lat: null, lng: null, accuracy_m: null, specialty: "جلدية", classification: "A", doctor_phone: "",
  presented: [], attachments: [], items: [
    { id: anotherOrderId, product_name: "منتج أول", kind: "order", quantity: 1, sample_purpose: null, approval_status: "pending", approval_note: "" },
    { id: orderId, product_name: "منتج محدد", kind: "order", quantity: 2, sample_purpose: null, approval_status: "pending", approval_note: "" },
  ],
};

describe("exact order detail", () => {
  it("anchors and highlights only the linked order, even alongside another order", () => {
    const html = renderToStaticMarkup(createElement(VisitDetailPanel, { visit, selectedOrderId: orderId }));
    expect(html).toContain(`id="visit-order-${orderId}" tabindex="-1"`);
    expect(html).toContain("الطلب المحدد من لوحة المدير");
    expect(html).toMatch(new RegExp(`id="visit-order-${orderId}"[^>]+bg-amber-100`));
    expect(html).not.toMatch(new RegExp(`id="visit-order-${anotherOrderId}"[^>]+bg-amber-100`));
  });
});
