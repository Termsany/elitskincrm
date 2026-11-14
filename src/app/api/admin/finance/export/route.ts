import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/session";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { query } from "@/lib/db";
import { cleanPlan, computePlan } from "@/lib/plan";

const DAY = /^20\d\d-\d\d-\d\d$/;
const STATUS: Record<number, string> = { 0: "غير مدفوعة", 1: "مدفوعة جزئياً", 2: "مدفوعة", 3: "مرتجعة" };
const BK: Record<string, string> = { current: "لم تستحق", "1-30": "1-30 يوم", "31-60": "31-60 يوم", "61-90": "61-90 يوم", "90+": "+90 يوم" };
type Col = [header: string, key: string, width?: number, money?: boolean];

/** Excel workbook of any (or every) section of the finance hub. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") || "", to = sp.get("to") || "", section = sp.get("section") || "all";
  if (section === "plan") return planBook(sp.get("month") || "");
  if (!DAY.test(from) || !DAY.test(to) || from > to) return NextResponse.json({ error: "فترة غير صحيحة" }, { status: 400 });
  const f = computeFinance(await loadInput(riyadhToday()), from, to);
  const wb = new ExcelJS.Workbook(); wb.creator = "Elite Skin CRM";
  const sheet = (name: string, cols: Col[], rows: Array<Record<string, unknown>>, totals?: string[]) => {
    const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map(([header, key, width]) => ({ header, key, width: width || 16 }));
    for (const r of rows) ws.addRow(r);
    const h = ws.getRow(1); h.font = { bold: true, color: { argb: "FFFFFFFF" } }; h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF10484F" } }; h.height = 22;
    for (const [, key, , money] of cols) if (money) ws.getColumn(key).numFmt = "#,##0.00";
    if (totals && rows.length) { const t: Record<string, unknown> = { [cols[0][1]]: "الإجمالي" }; for (const k of totals) t[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0); const tr = ws.addRow(t); tr.font = { bold: true }; tr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAFBF8" } }; }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  };
  const want = (s: string) => section === "all" || section === s;
  if (want("sales")) {
    sheet("المبيعات حسب المنتج", [["المنتج", "name", 40], ["الكمية", "qty", 10], ["صافي المبيعات", "net", 14, true], ["التكلفة", "cogs", 14, true], ["مجمل الربح", "gross", 14, true], ["الهامش %", "margin", 10], ["عدد الفواتير", "invoices", 10]], f.salesByProduct, ["qty", "net", "cogs", "gross"]);
    sheet("المبيعات حسب العميل", [["العميل", "name", 46], ["المدينة", "city", 14], ["صافي المبيعات", "net", 14, true], ["الحصة %", "share", 10], ["الفواتير", "n", 10], ["آخر فاتورة", "last", 12]], f.salesByClient, ["net", "n"]);
    sheet("فواتير البيع", [["رقم", "no", 10], ["التاريخ", "date", 12], ["العميل", "party", 44], ["الفرع", "branch", 10], ["الصافي", "net", 14, true], ["الضريبة", "tax", 12, true], ["الإجمالي", "total", 14, true], ["المدفوع", "paid", 14, true], ["المتبقي", "unpaid", 14, true], ["المرتجع", "refund", 12, true], ["الحالة", "st", 14]],
      f.sales.map(s => ({ ...s, st: STATUS[s.status] })), ["net", "tax", "total", "paid", "unpaid", "refund"]);
  }
  const ageCols: Col[] = [["الاسم", "name", 44], ["المتبقي", "unpaid", 14, true], ["متأخر", "overdue", 14, true], ...(["current", "1-30", "31-60", "61-90", "90+"].map(b => [BK[b], `b_${b}`, 12, true] as Col)), ["أقدم تأخير (يوم)", "oldestDue", 12], ["فواتير", "n", 8]];
  const ageRows = (ps: typeof f.ar.parties) => ps.map(p => ({ ...p, ...Object.fromEntries(Object.entries(p.b).map(([k, v]) => [`b_${k}`, v])) }));
  if (want("ar")) { sheet("ليا عند العملاء", ageCols, ageRows(f.ar.parties), ["unpaid", "overdue", "b_current", "b_1-30", "b_31-60", "b_61-90", "b_90+"]); sheet("فواتير مستحقة", [["رقم", "no", 10], ["التاريخ", "date", 12], ["العميل", "party", 44], ["تاريخ الاستحقاق", "due", 12], ["أيام التأخير", "days", 10], ["المتبقي", "unpaid", 14, true]], f.ar.open, ["unpaid"]); }
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="elite-finance-${section}-${from}_${to}.xlsx"` } });
}

/** Excel of one month's sales plan (+ actuals). */
async function planBook(month: string) {
  if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: "شهر غير صحيح" }, { status: 400 });
  const r = await query("SELECT data FROM fin_plans WHERE month=$1", [month]);
  if (!r.rows[0]) return NextResponse.json({ error: "مفيش خطة محفوظة للشهر ده" }, { status: 404 });
  const plan = cleanPlan(r.rows[0].data);
  const { rows, t, advice } = computePlan(plan);
  const wb = new ExcelJS.Workbook(); wb.creator = "Elite Skin CRM";
  const add = (name: string, cols: Col[], data: Array<Record<string, unknown>>, totals?: string[]) => {
    const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map(([header, key, width]) => ({ header, key, width: width || 16 }));
    for (const x of data) ws.addRow(x);
    const h = ws.getRow(1); h.font = { bold: true, color: { argb: "FFFFFFFF" } }; h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF10484F" } }; h.height = 22;
    for (const [, key, , money] of cols) if (money) ws.getColumn(key).numFmt = "#,##0.00";
    if (totals && data.length) { const tt: Record<string, unknown> = { [cols[0][1]]: "الإجمالي" }; for (const k of totals) tt[k] = data.reduce((s, x) => s + (Number(x[k]) || 0), 0); const tr = ws.addRow(tt); tr.font = { bold: true }; tr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAFBF8" } }; }
  };
  add("ملخص الخطة", [["البند", "label", 40], ["القيمة", "value", 18, true], ["ملاحظة", "note", 50]], [
    { label: "الشهر", value: null, note: month },
    { label: "إجمالي الرواتب", value: t.salaries, note: "" }, { label: "إجمالي الرواتب والمصاريف", value: t.fixed, note: "" },
    { label: "صافي الربح المستهدف", value: t.target_profit, note: "" }, { label: "تكاليف متغيرة % من البيع", value: t.variable_pct, note: "عمولات، شحن، عينات" },
    { label: "متوسط ربح الحبة", value: t.avg_unit_profit, note: "حسب نسب الأصناف" },
    { label: "نقطة التعادل (ر.س)", value: t.be_revenue, note: `${t.be_pieces ?? "—"} حبة` },
    { label: "هدف المبيعات (ر.س)", value: t.target_revenue, note: `${t.target_pieces ?? "—"} حبة` },
    { label: "مبيعات الخطة", value: t.plan_revenue, note: `${t.plan_pieces} حبة` }, { label: "ربح الخطة الصافي", value: t.plan_profit, note: `هامش ${t.plan_margin ?? "—"}%` },
    { label: "هامش الأمان %", value: t.safety, note: "" }, { label: "بضاعة محتاج تشتريها (بالتكلفة)", value: t.buy_cash, note: "" },
    { label: "المبيعات الفعلية", value: t.has_actual ? t.actual_revenue : null, note: t.achieve_revenue === null ? "" : `${t.achieve_revenue}% من الخطة` },
    { label: "المصاريف الفعلية", value: t.has_actual ? t.fixed_actual : null, note: "" },
    { label: "صافي الربح الفعلي", value: t.has_actual ? t.actual_profit : null, note: t.actual_margin === null ? "" : `هامش ${t.actual_margin}%` },
  ]);
  add("الأصناف", [["الصنف", "name", 40], ["تكلفة الحبة", "cost", 12, true], ["سعر البيع", "price", 12, true], ["ربح الحبة", "unit_profit", 12, true], ["هامش %", "unit_margin", 9], ["نسبته %", "share", 9], ["كمية التعادل", "be_qty", 11], ["الكمية المطلوبة", "target_qty", 12], ["كمية الخطة", "plan_qty", 11], ["مبيعات الخطة", "plan_revenue", 14, true], ["ربح الخطة", "plan_profit", 14, true], ["متوسط بيع شهري", "hist_qty", 12], ["المخزون", "stock", 10], ["محتاج تشتري", "to_buy", 11], ["الكمية الفعلية", "actual_qty", 12], ["السعر الفعلي", "actual_price", 12, true], ["المبيعات الفعلية", "actual_revenue", 14, true], ["الربح الفعلي", "actual_profit", 14, true], ["التحقيق %", "achieve", 10]],
    rows as unknown as Array<Record<string, unknown>>, ["be_qty", "target_qty", "plan_qty", "plan_revenue", "plan_profit", "to_buy", "actual_qty", "actual_revenue", "actual_profit"]);
  add("الرواتب والمصاريف", [["البند", "name", 34], ["النوع", "k", 10], ["المخطط", "planned", 14, true], ["الفعلي", "actual", 14, true]], plan.costs.map(c => ({ ...c, k: c.kind === "salary" ? "راتب" : "مصروف" })), ["planned", "actual"]);
  add("نصايح المستشار", [["الأهمية", "level", 10], ["العنوان", "title", 60], ["التفاصيل", "text", 120]], advice.map(a => ({ ...a, level: ({ danger: "عاجل", warn: "مهم", good: "فرصة", info: "للعلم" } as Record<string, string>)[a.level] })));
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="elite-plan-${month}.xlsx"` } });
}
