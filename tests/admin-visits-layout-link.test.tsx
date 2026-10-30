import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mock = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mock.getCurrentUser }));
vi.mock("@/lib/db", () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/app/admin/visits/AdminVisitsOverview", () => ({ default: ({ selectedRepId, initialDay, initialVisitId, initialOrderId }: { selectedRepId?: string; initialDay?: string; initialVisitId?: string; initialOrderId?: string }) => <div>admin-visit-drilldown:{selectedRepId}:{initialDay}:{initialVisitId}:{initialOrderId}</div> }));
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
  it("forwards a valid day and rep to open that exact day from the dashboard", async () => {
    mock.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", email: "a@example.test", name: "Admin" });
    const html = renderToStaticMarkup(await VisitsPage({ searchParams: Promise.resolve({ repId: "rep-one", day: "2026-10-28" }) }));
    expect(html).toContain("admin-visit-drilldown:rep-one:2026-10-28");
  });
  it("forwards the exact visit ID for order review without another navigation step", async () => {
    mock.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", email: "a@example.test", name: "Admin" });
    const id = "11111111-1111-4111-8111-111111111111";
    const html = renderToStaticMarkup(await VisitsPage({ searchParams: Promise.resolve({ repId: "rep-one", day: "2026-10-28", visit: id }) }));
    expect(html).toContain(`admin-visit-drilldown:rep-one:2026-10-28:${id}`);
  });
  it("forwards an exact order under its visit and rejects a malformed order token", async () => {
    mock.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", email: "a@example.test", name: "Admin" });
    const visit = "11111111-1111-4111-8111-111111111111";
    const order = "22222222-2222-4222-8222-222222222222";
    const params = { repId: "rep-one", day: "2026-10-28", visit };
    const html = renderToStaticMarkup(await VisitsPage({ searchParams: Promise.resolve({ ...params, order }) }));
    expect(html).toContain(`admin-visit-drilldown:rep-one:2026-10-28:${visit}:${order}`);
    const bad = renderToStaticMarkup(await VisitsPage({ searchParams: Promise.resolve({ ...params, order: "bogus" }) }));
    expect(bad).toContain(`admin-visit-drilldown:rep-one:2026-10-28:${visit}:`);
    expect(bad).not.toContain("bogus");
  });
  it("does not pass malformed days into timeline requests", async () => {
    mock.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", email: "a@example.test", name: "Admin" });
    const html = renderToStaticMarkup(await VisitsPage({ searchParams: Promise.resolve({ day: "2026-02-31" }) }));
    expect(html).toContain("admin-visit-drilldown::");
  });
  it("keeps the administrator search, edit, delete and attachment list reachable without duplicating the drilldown", async () => {
    mock.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", email: "a@example.test", name: "Admin" });
    const html = renderToStaticMarkup(await VisitsPage({ searchParams: Promise.resolve({ view: "list", repId: "rep-one" }) }));
    expect(html).toContain("legacy-visits-list:rep-one");
    expect(html).toContain("عودة لزيارات المندوبين");
    expect(html).not.toContain("admin-visit-drilldown");
  });
  it("keeps the existing visits list for sales representatives", async () => {
    mock.getCurrentUser.mockResolvedValue({ id: "rep", role: "sales_rep", email: "r@example.test", name: "Rep" });
    const html = renderToStaticMarkup(await VisitsPage({ searchParams: Promise.resolve({ repId: "saved-rep-id" }) }));
    expect(html).toContain("legacy-visits-list:saved-rep-id");
    expect(html).not.toContain("admin-visit-drilldown");
  });
});
