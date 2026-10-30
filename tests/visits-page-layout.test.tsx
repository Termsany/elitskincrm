import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mock = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mock.getCurrentUser }));
vi.mock("@/lib/db", () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/app/admin/visits/AdminVisitsOverview", () => ({ default: () => <div>admin-visit-drilldown</div> }));
vi.mock("@/app/visits/VisitsClient", () => ({ default: ({ initialRepId }: { initialRepId?: string }) => <div>legacy-visits-list:{initialRepId}</div> }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import VisitsPage from "@/app/visits/page";

describe("visits page role layout", () => {
  it("shows only the new drilldown to admins, not the old list underneath", async () => {
    mock.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", email: "a@example.test", name: "Admin" });
    const html = renderToStaticMarkup(await VisitsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("admin-visit-drilldown");
    expect(html).not.toContain("legacy-visits-list");
  });
  it("keeps the existing visits list for sales representatives", async () => {
    mock.getCurrentUser.mockResolvedValue({ id: "rep", role: "sales_rep", email: "r@example.test", name: "Rep" });
    const html = renderToStaticMarkup(await VisitsPage({ searchParams: Promise.resolve({ repId: "saved-rep-id" }) }));
    expect(html).toContain("legacy-visits-list:saved-rep-id");
    expect(html).not.toContain("admin-visit-drilldown");
  });
});
