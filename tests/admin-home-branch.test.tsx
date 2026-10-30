import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DashboardClient from "@/app/DashboardClient";

vi.mock("@/app/AdminHomeWorkspace", () => ({ default: () => <section>admin-home-workspace</section> }));
vi.mock("@/app/AdminActionCenter", () => ({ default: () => <div>old-action-center</div> }));
vi.mock("@/app/AdminTeamOverview", () => ({ default: () => <div>old-team-overview</div> }));
vi.mock("@/app/RepDailyWorkspace", () => ({ default: () => <div>rep-daily-workspace</div> }));
vi.mock("@/app/DashboardDoctorSuggestions", () => ({ default: () => <div>suggestions</div> }));
vi.mock("@/app/DashboardPlans", () => ({ default: () => <div>rep-plans</div> }));

describe("dashboard role branches", () => {
  it("uses one compact admin workspace instead of the hero and duplicate panels", () => {
    const html = renderToStaticMarkup(<DashboardClient cities={[]} isAdmin />);
    expect(html).toContain("admin-home-workspace");
    expect(html).not.toContain("ELITE SKIN COMMAND CENTER");
    expect(html).not.toContain("old-team-overview");
    expect(html).not.toContain("old-action-center");
  });
  it("keeps the rep's existing workspace", () => {
    const html = renderToStaticMarkup(<DashboardClient cities={[]} isAdmin={false} />);
    expect(html).toContain("rep-daily-workspace");
    expect(html).not.toContain("admin-home-workspace");
  });
});
