import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

const mocks = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.session }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
import { GET } from "@/app/api/exports/visits/route";

const repId = "11111111-1111-4111-8111-111111111111";
const url = (params: string) => new Request(`https://example.test/api/exports/visits?${params}`);

beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ id: "admin", role: "admin" }); });

describe("admin visits Excel export", () => {
  it("returns a real Excel workbook for an inclusive Riyadh day with complete visit fields", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: repId, name: "مندوب الاختبار" }] })
      .mockResolvedValueOnce({ rows: [{
        id: "22222222-2222-4222-8222-222222222222", visited_at: "2026-10-27T22:30:00Z", rep_name: "مندوب الاختبار",
        doctor_name: "د. أحمد", clinic_name: "عيادة أ", city: "الرياض", specialty: "جلدية", classification: "A",
        doctor_phone: "0500000000", status: "completed", notes: "=SUM(1,1)", follow_up_at: "2026-10-29",
        follow_up_note: "اتصال", lat: 24.7, lng: 46.7, accuracy_m: 8,
        presented: [{ product_name: "منتج أ", reaction: "interested" }],
        items: [{ product_name: "منتج أ", kind: "sample", quantity: 2, sample_purpose: "تجربة", approval_status: "approved" },
                { product_name: "منتج ب", kind: "order", quantity: 4, approval_status: "pending" }],
        attachments: [{ file_name: "visit.pdf" }]
      }] });
    const res = await GET(url(`repId=${repId}&from=2026-10-28&to=2026-10-28&format=xlsx`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toMatch(/attachment;.*\.xlsx/);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const sheet = wb.getWorksheet("الزيارات");
    expect(sheet).toBeDefined();
    expect(sheet!.rowCount).toBe(2);
    const values = sheet!.getRow(2).values as unknown[];
    expect(String(values[1])).toContain("2026-10-28 01:30");
    expect(values[2]).toBe("مندوب الاختبار");
    expect(values[3]).toBe("د. أحمد");
    expect(values[10]).toBe("'=SUM(1,1)");
    expect(String(values[13])).toContain("منتج أ");
    expect(String(values[14])).toContain("تجربة");
    expect(String(values[15])).toContain("بانتظار الموافقة");
    expect(String(values[18])).toContain("visit.pdf");
    const sql = String(mocks.query.mock.calls[1][0]);
    expect(sql).toContain("$2::date::timestamp AT TIME ZONE 'Asia/Riyadh'");
    expect(sql).toContain("$3::date + interval '1 day'");
    expect(sql).toContain("visit_presented_products");
    expect(sql).not.toMatch(/\bLIMIT\b/i);
    expect(mocks.query.mock.calls[1][1]).toEqual([repId, "2026-10-28", "2026-10-28"]);
  });
  it("rejects missing or invalid representative, dates, and obsolete CSV format before querying", async () => {
    for (const params of [
      `repId=bad&from=2026-10-28&to=2026-10-28`,
      `repId=${repId}&from=2026-02-30&to=2026-03-01`,
      `repId=${repId}&from=2026-11-01&to=2026-10-28`,
      `repId=${repId}&from=2026-10-28`,
      `repId=${repId}&from=2026-10-28&to=2026-10-28&format=csv`,
    ]) expect((await GET(url(params))).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("does not allow non-admin users to export another representative's visits", async () => {
    mocks.session.mockResolvedValue({ id: repId, role: "sales_rep" });
    expect((await GET(url(`repId=${repId}&from=2026-10-28&to=2026-10-28&format=xlsx`))).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("exports a header-only workbook when the valid period has no visits", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: repId, name: "مندوب" }] }).mockResolvedValueOnce({ rows: [] });
    const res = await GET(url(`repId=${repId}&from=2026-10-28&to=2026-10-29&format=xlsx`));
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as Parameters<typeof wb.xlsx.load>[0]);
    expect(wb.getWorksheet("الزيارات")!.rowCount).toBe(1);
  });
});
