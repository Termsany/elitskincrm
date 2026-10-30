import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { REPORT_ORDER, findReport, getReportRows, getReportSummary, parseReportFilters, type Col, type ReportDef } from "@/lib/report-extra";

const STATUS: Record<string, string> = { completed: "مكتملة", planned: "مجدولة", cancelled: "ملغاة", follow_up: "متابعة" };
const APPROVAL: Record<string, string> = { pending: "بانتظار الموافقة", approved: "معتمد", rejected: "مرفوض" };
const PURPOSE: Record<string, string> = { personal_use: "استخدام شخصي", video_shooting: "تصوير فيديو", workshop: "ورشة" };
const NAVY = "FF10484F", SOFT = "FFE6F4F2", BORDER = "FFDDE6E6";

// Excel date serial in Riyadh local time (so Excel shows the same clock time people saw).
function riyadhDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v)); if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 3 * 3600 * 1000);
}
function cellValue(c: Col, v: unknown): unknown {
  if (v === null || v === undefined || v === "") return null;
  switch (c.type) {
    case "datetime": return riyadhDate(v);
    case "date": { const s = String(v).slice(0, 10); return /^\d{4}-\d\d-\d\d$/.test(s) ? new Date(`${s}T00:00:00Z`) : s; }
    case "int": case "money": return Number(v);
    case "pct": return Number(v) / 100;
    case "status": return STATUS[String(v)] || String(v);
    case "approval": return APPROVAL[String(v)] || String(v);
    case "purpose": return PURPOSE[String(v)] || String(v);
    default: return String(v);
  }
}
const numFmt = (c: Col) => c.type === "datetime" ? "yyyy-mm-dd hh:mm" : c.type === "date" ? "yyyy-mm-dd" : c.type === "money" ? "#,##0" : c.type === "pct" ? "0%" : c.type === "int" ? "0" : undefined;
const width = (c: Col) => c.type === "datetime" ? 17 : c.type === "date" ? 12 : c.type === "int" || c.type === "pct" ? 11 : c.type === "money" ? 14 : /notes|note|issues|presented_products|products|approval_note/.test(c.key) ? 40 : 20;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const f = parseReportFilters(sp);
  const only = sp.get("type");
  const ids = only ? [only] : REPORT_ORDER;
  const defs = ids.map(findReport).filter(Boolean) as ReportDef[];
  if (!defs.length) return NextResponse.json({ error: "Unknown report" }, { status: 400 });

  // Human-readable filter line
  const names: string[] = [];
  if (f.repId) names.push(`المندوب: ${(await query<{ name: string }>("SELECT name FROM users WHERE id=$1", [f.repId])).rows[0]?.name || "—"}`);
  if (f.productId) names.push(`المنتج: ${(await query<{ name: string }>("SELECT name FROM products WHERE id=$1", [f.productId])).rows[0]?.name || "—"}`);
  if (f.city) names.push(`المدينة: ${f.city}`);
  if (f.status) names.push(`الحالة: ${STATUS[f.status] || f.status}`);

  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook(); wb.creator = "Elite Skin CRM"; wb.created = new Date();

  // Summary sheet (full workbook only)
  if (!only) {
    const s = await getReportSummary(f);
    const ws = wb.addWorksheet("الملخص", { views: [{ rightToLeft: true }] });
    ws.addRow(["تقرير Elite Skin CRM"]).font = { bold: true, size: 16, color: { argb: NAVY } };
    ws.addRow([`الفترة: ${f.from} إلى ${f.to}`, `المقارنة بـ: ${s.previousRange.from} إلى ${s.previousRange.to}`]);
    ws.addRow([names.length ? names.join(" · ") : "كل المناديب والمنتجات والمدن"]);
    ws.addRow([]);
    const h = ws.addRow(["المؤشر", "الفترة الحالية", "الفترة السابقة", "التغيير"]);
    h.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; });
    const k: Array<[string, keyof typeof s.current]> = [["الزيارات", "visits"], ["المكتملة", "completed"], ["الأطباء", "doctors"], ["المناديب النشطون", "reps"], ["العينات", "samples"], ["الأوردرات", "orders"]];
    for (const [label, key] of k) {
      const a = s.current[key], b = s.previous[key];
      const r = ws.addRow([label, a, b, b ? (a - b) / b : null]); r.getCell(4).numFmt = "+0%;-0%;0%";
    }
    ws.addRow([]);
    const h2 = ws.addRow(["اليوم", "الزيارات", "المكتملة"]);
    h2.eachCell(c => { c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } }; });
    for (const d of s.daily) { const r = ws.addRow([new Date(`${d.day}T00:00:00Z`), d.visits, d.completed]); r.getCell(1).numFmt = "yyyy-mm-dd"; }
    ws.addRow([]);
    ws.addRow(["الأوراق في الملف:"]).font = { bold: true };
    for (const d of defs) ws.addRow([d.label, d.hint]);
    ws.getColumn(1).width = 26; ws.getColumn(2).width = 22; ws.getColumn(3).width = 22; ws.getColumn(4).width = 12;
  }

  for (const def of defs) {
    const rows = await getReportRows(def.id, f, { unlimited: true });
    const ws = wb.addWorksheet(def.label.slice(0, 31), { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
    const h = ws.addRow(def.columns.map(c => c.label)); h.height = 24;
    h.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; c.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; });
    for (const r of rows) ws.addRow(def.columns.map(c => cellValue(c, r[c.key])));
    def.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1); col.width = width(c);
      const fmt = numFmt(c); if (fmt) col.numFmt = fmt;
    });
    ws.eachRow((row, n) => { if (n > 1) row.eachCell(c => { c.alignment = { vertical: "top", wrapText: true }; c.border = { bottom: { style: "thin", color: { argb: BORDER } } }; }); });
    if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: def.columns.length } };
    else ws.addRow(["لا توجد بيانات في هذه الفترة"]);
  }

  const buf = await wb.xlsx.writeBuffer();
  const name = only ? `elite-crm-${only}-${f.from}_${f.to}.xlsx` : `elite-crm-report-${f.from}_${f.to}.xlsx`;
  return new NextResponse(buf as unknown as BodyInit, {
    headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
