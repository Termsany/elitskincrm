import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/session";
import { UUID_RE } from "@/lib/ids";
import { listExpenses, STATUS_LABEL } from "@/lib/expenses";

const DAY = /^20\d\d-\d\d-\d\d$/;
/** Excel export of expenses for accounting: one row per expense, VAT split out. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") || "", to = sp.get("to") || "", repId = sp.get("repId") || undefined, status = sp.get("status") || "all";
  if (!DAY.test(from) || !DAY.test(to) || from > to || (repId && !UUID_RE.test(repId))) return NextResponse.json({ error: "فترة غير صحيحة" }, { status: 400 });
  const rows = await listExpenses({ from, to, repId, status, limit: 2000 });
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("المصروفات", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "التاريخ", key: "d", width: 12 }, { header: "المندوب", key: "rep", width: 20 }, { header: "البند", key: "cat", width: 22 },
    { header: "الجهة", key: "m", width: 20 }, { header: "الوصف", key: "desc", width: 36 }, { header: "الطبيب", key: "doc", width: 20 },
    { header: "الإجمالي", key: "amt", width: 12 }, { header: "الضريبة 15%", key: "vat", width: 12 }, { header: "قبل الضريبة", key: "net", width: 12 },
    { header: "الحالة", key: "st", width: 14 }, { header: "ملاحظة المراجعة", key: "note", width: 24 }, { header: "مرجع الصرف", key: "ref", width: 16 },
    { header: "إيصالات", key: "rc", width: 9 }, { header: "تنبيهات", key: "fl", width: 28 },
  ];
  for (const r of rows) ws.addRow({ d: r.expense_date, rep: r.rep_name, cat: r.category_name, m: r.merchant, desc: r.description, doc: r.doctor_name || "",
    amt: r.amount, vat: r.vat_amount, net: Math.round((r.amount - r.vat_amount) * 100) / 100, st: STATUS_LABEL[r.status], note: r.review_note, ref: r.payment_ref,
    rc: r.receipts.length, fl: r.flags.join(" · ") });
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF10484F" } };
  for (const k of ["amt", "vat", "net"]) ws.getColumn(k).numFmt = "#,##0.00";
  const total = ws.addRow({ d: "الإجمالي", amt: rows.reduce((s, r) => s + r.amount, 0), vat: rows.reduce((s, r) => s + r.vat_amount, 0), net: rows.reduce((s, r) => s + r.amount - r.vat_amount, 0) });
  total.font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="expenses-${from}_${to}.xlsx"` } });
}
