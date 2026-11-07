import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/Toast";
import { renderToStaticMarkup } from "react-dom/server";
import DashboardClient from "@/app/DashboardClient";

vi.mock("@/app/AdminActionCenter", () => ({ default: () => <div>old-action-center</div> }));
vi.mock("@/app/RepDailyWorkspace", () => ({ default: () => <div>rep-daily-workspace</div> }));
vi.mock("@/app/DashboardDoctorSuggestions", () => ({ default: () => <div>suggestions</div> }));
vi.mock("@/app/DashboardPlans", () => ({ default: () => <div>rep-plans</div> }));

describe("dashboard role branches", () => {
  it("keeps the rep's existing workspace", () => {
    const html = renderToStaticMarkup(<ToastProvider><DashboardClient cities={[]} isAdmin={false} /></ToastProvider>);
    expect(html).toContain("rep-daily-workspace");
    expect(html).not.toContain("admin-home-workspace");
  });
});
