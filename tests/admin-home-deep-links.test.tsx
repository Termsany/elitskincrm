import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DoctorTimeline from "@/components/DoctorTimeline";
import { findPendingDoctorRequest } from "@/app/admin/requests/DoctorRequestsClient";

const mock = vi.hoisted(() => ({ getCurrentUser: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mock.getCurrentUser }));
vi.mock("@/lib/db", () => ({ query: mock.query }));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/app/tasks/TasksClient", () => ({ default: ({ initialTaskId }: { initialTaskId?: string }) => <div>task-target:{initialTaskId}</div> }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import TasksPage from "@/app/tasks/page";

describe("admin action queue deep links", () => {
  it("opens the requested task directly in full task workspace", async () => {
    mock.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", email: "a@example.test", name: "Admin" });
    mock.query.mockResolvedValue({ rows: [] });
    const html = renderToStaticMarkup(await TasksPage({ searchParams: Promise.resolve({ view: "full", task: "task-one" }) }));
    expect(html).toContain("task-target:task-one");
  });
  it("gives a follow-up a stable in-page target", () => {
    const html = renderToStaticMarkup(<DoctorTimeline isAdmin events={[{ type: "followup", date: "2026-10-27T00:00:00Z", data: { id: "followup-one", title: "متابعة", note: "", due_at: "2026-10-27T00:00:00Z", status: "open", product_name: null, rep_name: "مندوب" } }]} />);
    expect(html).toContain('id="followup-followup-one"');
  });
  it("selects only the exact pending doctor request", () => {
    const rows = [{ id: "a", status: "pending" }, { id: "b", status: "approved" }];
    expect(findPendingDoctorRequest(rows, "a")?.id).toBe("a");
    expect(findPendingDoctorRequest(rows, "b")).toBeNull();
    expect(findPendingDoctorRequest(rows, "missing")).toBeNull();
  });
});
