import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AdminVisitsOverview from "@/app/admin/visits/AdminVisitsOverview";

vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const repId = "11111111-1111-4111-8111-111111111111";
describe("visit exports in the admin dashboard", () => {
  it("offers an Excel custom range in the representative panel and no CSV report", () => {
    const html = renderToStaticMarkup(<AdminVisitsOverview selectedRepId={repId} />);
    expect(html).toContain("من تاريخ");
    expect(html).toContain("إلى تاريخ");
    expect(html).toContain("تحميل الفترة Excel");
    expect(html).not.toContain("تقرير CSV");
    expect(html).toContain('type="date"');
  });
});
