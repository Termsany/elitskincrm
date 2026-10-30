import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mock = vi.hoisted(() => ({ getCurrentUser: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mock.getCurrentUser }));
vi.mock("@/lib/db", () => ({ query: mock.query }));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/DoctorProfile", () => ({ default: ({ timeline }: { timeline: Array<{type:string;data:{id:string}}> }) => <div>timeline:{timeline.map(x => x.data.id).join(",")}</div> }));
vi.mock("@/components/DoctorFollowups", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
import DoctorProfilePage from "@/app/doctors/[id]/page";
const doctorId = "11111111-1111-4111-8111-111111111111";
const followupId = "22222222-2222-4222-8222-222222222222";
describe("doctor follow-up direct link", () => {
  it("includes the requested overdue follow-up even when it is older than the profile's 20-item preview", async () => {
    mock.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", email: "a@example.test", name: "Admin" });
    mock.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM doctors WHERE id")) return { rows: [{id: doctorId, name: "Doctor", status: "active"}] };
      if (sql.includes("f.id=$2")) return { rows: [{ id: followupId, title: "متابعة", note: "", due_at: "2026-10-20T00:00:00Z", status: "open", product_name: null, rep_name: "مندوب" }] };
      if (sql.includes("total_visits")) return { rows: [{total_visits:0,completed_visits:0,last_visit_at:null}] };
      return { rows: [] };
    });
    const html = renderToStaticMarkup(await DoctorProfilePage({ params: Promise.resolve({ id: doctorId }), searchParams: Promise.resolve({ followup: followupId }) }));
    expect(html).toContain(`timeline:${followupId}`);
    expect(mock.query).toHaveBeenCalledWith(expect.stringContaining("f.id=$2"), [doctorId, followupId]);
  });
});
