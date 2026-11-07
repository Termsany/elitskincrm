import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
import { analyzeAccount, type AInv, type ALine } from "@/lib/clinic-account";
import { managerDenied } from "@/lib/manager-scope";

const inv = (id: number, date: string, net: number, o: Partial<AInv> = {}): AInv => ({ id, client_id: 1, no: String(id), date, due_days: 30, status: 2, net, total: net * 1.15, unpaid: 0, refund: 0, ...o });

describe("clinic account", () => {
  it("flags a monthly buyer that went silent", () => {
    const a = analyzeAccount([inv(1, "2026-06-01", 1000), inv(2, "2026-07-01", 1000), inv(3, "2026-08-01", 1000)], [], "2026-10-15");
    expect(a.orders.usual_gap).toBe(31); expect(a.orders.days_since).toBe(75); expect(a.status).toBe("stopped");
  });
  it("does not flag a quarterly buyer inside its rhythm", () => {
    const a = analyzeAccount([inv(1, "2026-01-10", 3000), inv(2, "2026-04-10", 3000), inv(3, "2026-07-10", 3000)], [], "2026-09-01");
    expect(a.status).not.toBe("stopped");
  });
  it("detects a 30% drop and ignores refunded invoices", () => {
    const a = analyzeAccount([inv(1, "2026-05-01", 10000), inv(2, "2026-06-01", 10000), inv(3, "2026-08-20", 5000), inv(4, "2026-09-10", 9000, { status: 3 }), inv(5, "2026-09-20", 1000)], [], "2026-10-01");
    expect(a.sales.prev90).toBe(20000); expect(a.sales.last90).toBe(6000); expect(a.status).toBe("declining");
  });
  it("reports products bought and the open balance with days late", () => {
    const lines: ALine[] = [{ invoice_id: 1, item: "AMI 200", quantity: 5, net: 4500 }, { invoice_id: 2, item: "ami 200 ", quantity: 3, net: 2700 }];
    const a = analyzeAccount([inv(1, "2026-08-01", 4500, { unpaid: 5175, status: 0 }), inv(2, "2026-09-25", 2700, { unpaid: 1000, status: 1 })], lines, "2026-10-10");
    expect(a.products[0]).toMatchObject({ item: "AMI 200", qty: 8, orders: 2, last: "2026-09-25" });
    expect(a.balance.unpaid).toBe(6175); expect(a.balance.overdue).toBe(5175); expect(a.balance.oldest).toBe(40);
  });
});

describe("sales manager scope", () => {
  it("blocks company accounts but allows sales work", () => {
    for (const p of ["/daftra-sales", "/api/admin/finance/goals", "/api/admin/daftra/sync", "/expenses", "/api/admin/products/1", "/admin/audit", "/api/admin/dashboard/daftra"]) expect(managerDenied(p)).toBe(true);
    for (const p of ["/", "/admin", "/admin/reps", "/visits", "/plans", "/forecast", "/api/admin/reports/table", "/api/admin/dashboard", "/sales", "/doctors/x", "/api/admin/rep/1"]) expect(managerDenied(p)).toBe(false);
    expect(managerDenied("/api/admin/users")).toBe(false); expect(managerDenied("/api/admin/users", "POST")).toBe(true); expect(managerDenied("/api/admin/users/1", "PATCH")).toBe(true);
    expect(managerDenied("/daftra-salesX")).toBe(false);
  });
});

import { similarity } from "@/lib/collections";
describe("clinic name matching", () => {
  it("matches spelling variants between Daftra and CRM names", () => {
    expect(similarity("شركة برايت الطبي bright medical company", "Bright")).toBeGreaterThanOrEqual(0.5);
    expect(similarity("شركة رونق الطبي rawnaq medical company", "Bright")).toBeLessThan(0.5);
  });
});
