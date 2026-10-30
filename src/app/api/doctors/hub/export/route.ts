import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { hubDoctors } from "@/lib/doctors-hub";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const days = [30, 90, 180, 365].includes(Number(sp.get("days"))) ? Number(sp.get("days")) : 90;
  const rep = sp.get("repId");
  const ids = new Set((sp.get("ids") || "").split(",").filter(x => UUID_RE.test(x)));
  let rows = await hubDoctors(u, days, rep && UUID_RE.test(rep) ? rep : null);
  if (ids.size) rows = rows.filter(r => ids.has(r.id));
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook(); wb.creator = "Elite Skin CRM";
  const ws = wb.addWorksheet("الأطباء", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  const cols: Array<[string, (r: typeof rows[number]) => unknown, number, string?]> = [
    ["الطبيب", r => r.name, 24], ["الفئة", r => r.classification, 7], ["التخصص", r => r.specialty, 14], ["العيادة", r => r.clinic_name, 24], ["المدينة", r => r.city, 12],
    ["التليفون", r => r.phone, 14], [`زيارات آخر ${days} يوم`, r => r.visits, 12, "0"], ["مكتملة", r => r.completed, 9, "0"], ["إجمالي الزيارات", r => r.total_visits, 11, "0"],
    ["آخر زيارة", r => r.last_visit ? new Date(new Date(r.last_visit).getTime() + 3 * 3600e3) : null, 16, "yyyy-mm-dd hh:mm"], ["أيام من آخر زيارة", r => r.days_since, 12, "0"],
    ["كل كام يوم", r => r.gap_days, 10, "0"], ["الحالة", r => r.days_since === null ? "لم يُزر" : r.gap_days && r.days_since > r.gap_days ? "متأخر" : "في الميعاد", 11],
    ["مرات الشرح", r => r.presented, 10, "0"], ["نسبة الاهتمام", r => r.presented ? r.interested / r.presented : null, 11, "0%"], ["العينات", r => r.samples, 9, "0"], ["الأوردرات", r => r.orders, 9, "0"],
    ["المتابعة القادمة", r => r.next_follow_up, 13], ["في الخطة يوم", r => r.in_plan_next, 13], ["آخر مندوب", r => r.last_rep, 16], ["آخر ملاحظة", r => r.last_note, 45],
  ];
  const h = ws.addRow(cols.map(c => c[0])); h.height = 24;
  h.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF10484F" } }; c.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; });
  for (const r of rows) ws.addRow(cols.map(c => c[1](r) ?? null)).alignment = { vertical: "top", wrapText: true };
  cols.forEach((c, i) => { const col = ws.getColumn(i + 1); col.width = c[2]; if (c[3]) col.numFmt = c[3]; });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as unknown as BodyInit, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="doctors-${new Date().toISOString().slice(0, 10)}.xlsx"`, "cache-control": "no-store" } });
}
