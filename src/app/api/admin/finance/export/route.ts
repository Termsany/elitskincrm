import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/session";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";

const DAY = /^20\d\d-\d\d-\d\d$/;
const STATUS: Record<number, string> = { 0: "غير مدفوعة", 1: "مدفوعة جزئياً", 2: "مدفوعة", 3: "مرتجعة" };
const BK: Record<string, string> = { current: "لم تستحق", "1-30": "1-30 يوم", "31-60": "31-60 يوم", "61-90": "61-90 يوم", "90+": "+90 يوم" };
const TREAT: Record<string, string> = { opex: "مصروف تشغيلي", cogs: "تكلفة مبيعات", exclude: "مستبعد (ليس مصروف)", other_income: "إيراد آخر" };
const PRICE: Record<string, string> = { loss: "يُباع بخسارة", below_breakeven: "تحت سعر التعادل", thin: "هامش ضعيف", healthy: "هامش جيد", no_cost: "بدون تكلفة", dead_stock: "مخزون راكد", no_sales: "بدون مبيعات" };
type Col = [header: string, key: string, width?: number, money?: boolean];

/** Excel workbook of any (or every) section of the finance hub. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") || "", to = sp.get("to") || "", section = sp.get("section") || "all";
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
  if (want("summary")) {
    const k = f.kpi;
    sheet("الملخص", [["البند", "label", 34], ["القيمة", "value", 18, true], ["ملاحظة", "note", 50]], [
      { label: `الفترة`, value: null, note: `${from} → ${to}` },
      { label: "صافي المبيعات (بعد المرتجعات، قبل الضريبة)", value: k.sales, note: `${k.invoices} فاتورة · ${k.clients} عميل` },
      { label: "تكلفة البضاعة المباعة", value: k.cogs, note: `تغطية التكلفة ${k.cost_coverage}% من المبيعات` },
      { label: "مجمل الربح", value: k.gross, note: `هامش ${k.gross_margin ?? "—"}%` },
      { label: "المصروفات التشغيلية", value: k.opex, note: "من دفترة حسب دليل الحسابات" },
      { label: "إيرادات أخرى", value: k.other_income, note: "" },
      { label: "صافي الربح", value: k.net, note: `هامش ${k.net_margin ?? "—"}%` },
      { label: "المشتريات (قبل الضريبة)", value: k.purchases, note: `${k.purchase_invoices} فاتورة شراء` },
      { label: "المحصّل من العملاء", value: k.collected, note: "" },
      { label: "ليا عند العملاء (مستحقات)", value: k.ar, note: `منها متأخر ${k.ar_overdue}` },
      { label: "عليا للموردين", value: k.ap, note: `منها متأخر ${k.ap_overdue}` },
      { label: "ضريبة المخرجات (مبيعات)", value: k.vat_out, note: "" }, { label: "ضريبة المدخلات (مشتريات ومصروفات)", value: k.vat_in, note: "" },
      { label: "صافي الضريبة المستحقة (تقديري)", value: k.vat_payable, note: "قبل أي تسويات في إقرار الزكاة والضريبة" },
    ]);
    sheet("شهري", [["الشهر", "m", 10], ["المبيعات", "sales", 14, true], ["تكلفة المبيعات", "cogs", 14, true], ["مجمل الربح", "gross", 14, true], ["المصروفات", "opex", 14, true], ["إيرادات أخرى", "other", 12, true], ["صافي الربح", "net", 14, true], ["المشتريات", "purchases", 14, true], ["المحصّل", "collected", 14, true], ["عدد الفواتير", "invoices", 10]],
      f.monthly as Array<Record<string, unknown>>, ["sales", "cogs", "gross", "opex", "other", "net", "purchases", "collected", "invoices"]);
  }
  if (want("sales")) {
    sheet("المبيعات حسب المنتج", [["المنتج", "name", 40], ["الكمية", "qty", 10], ["صافي المبيعات", "net", 14, true], ["التكلفة", "cogs", 14, true], ["مجمل الربح", "gross", 14, true], ["الهامش %", "margin", 10], ["عدد الفواتير", "invoices", 10]], f.salesByProduct, ["qty", "net", "cogs", "gross"]);
    sheet("المبيعات حسب العميل", [["العميل", "name", 46], ["المدينة", "city", 14], ["صافي المبيعات", "net", 14, true], ["الحصة %", "share", 10], ["الفواتير", "n", 10], ["آخر فاتورة", "last", 12]], f.salesByClient, ["net", "n"]);
    sheet("فواتير البيع", [["رقم", "no", 10], ["التاريخ", "date", 12], ["العميل", "party", 44], ["الفرع", "branch", 10], ["الصافي", "net", 14, true], ["الضريبة", "tax", 12, true], ["الإجمالي", "total", 14, true], ["المدفوع", "paid", 14, true], ["المتبقي", "unpaid", 14, true], ["المرتجع", "refund", 12, true], ["الحالة", "st", 14]],
      f.sales.map(s => ({ ...s, st: STATUS[s.status] })), ["net", "tax", "total", "paid", "unpaid", "refund"]);
  }
  if (want("purchases")) {
    sheet("المشتريات حسب الصنف", [["الصنف", "name", 40], ["الكمية", "qty", 10], ["الإجمالي قبل الضريبة", "net", 16, true], ["متوسط سعر الشراء", "avg_unit", 14, true], ["آخر سعر شراء", "last_unit", 14, true], ["تاريخ آخر شراء", "last_date", 12], ["آخر مورد", "supplier", 30]], f.purchasesByProduct, ["qty", "net"]);
    sheet("المشتريات حسب المورد", [["المورد", "name", 44], ["قبل الضريبة", "net", 14, true], ["الإجمالي", "total", 14, true], ["المتبقي عليك", "unpaid", 14, true], ["الفواتير", "n", 10]], f.purchasesBySupplier, ["net", "total", "unpaid", "n"]);
    sheet("فواتير الشراء", [["رقم", "no", 10], ["التاريخ", "date", 12], ["المورد", "party", 44], ["الصافي", "net", 14, true], ["الضريبة", "tax", 12, true], ["الإجمالي", "total", 14, true], ["المدفوع", "paid", 14, true], ["المتبقي", "unpaid", 14, true], ["الحالة", "st", 14]],
      f.purchases.map(s => ({ ...s, st: STATUS[s.status] })), ["net", "tax", "total", "paid", "unpaid"]);
  }
  const ageCols: Col[] = [["الاسم", "name", 44], ["المتبقي", "unpaid", 14, true], ["متأخر", "overdue", 14, true], ...(["current", "1-30", "31-60", "61-90", "90+"].map(b => [BK[b], `b_${b}`, 12, true] as Col)), ["أقدم تأخير (يوم)", "oldestDue", 12], ["فواتير", "n", 8]];
  const ageRows = (ps: typeof f.ar.parties) => ps.map(p => ({ ...p, ...Object.fromEntries(Object.entries(p.b).map(([k, v]) => [`b_${k}`, v])) }));
  if (want("ar")) { sheet("ليا عند العملاء", ageCols, ageRows(f.ar.parties), ["unpaid", "overdue", "b_current", "b_1-30", "b_31-60", "b_61-90", "b_90+"]); sheet("فواتير مستحقة", [["رقم", "no", 10], ["التاريخ", "date", 12], ["العميل", "party", 44], ["تاريخ الاستحقاق", "due", 12], ["أيام التأخير", "days", 10], ["المتبقي", "unpaid", 14, true]], f.ar.open, ["unpaid"]); }
  if (want("ap")) { sheet("عليا للموردين", ageCols, ageRows(f.ap.parties), ["unpaid", "overdue", "b_current", "b_1-30", "b_31-60", "b_61-90", "b_90+"]); sheet("فواتير شراء مستحقة", [["رقم", "no", 10], ["التاريخ", "date", 12], ["المورد", "party", 44], ["تاريخ الاستحقاق", "due", 12], ["أيام التأخير", "days", 10], ["المتبقي", "unpaid", 14, true]], f.ap.open, ["unpaid"]); }
  if (want("pricing")) sheet("التسعير والمنتجات", [["المنتج", "name", 38], ["متوسط التكلفة", "avg_cost", 12, true], ["آخر سعر شراء", "last_cost", 12, true], ["سعر القائمة", "list_price", 12, true], ["متوسط سعر البيع الفعلي", "realized_price", 14, true], ["الهامش %", "margin", 9], ["سعر التعادل", "breakeven_price", 12, true], ["السعر المقترح", "suggested_price", 12, true], ["الكمية المباعة", "qty_sold", 10], ["المبيعات", "revenue", 14, true], ["مجمل الربح", "gross", 14, true], ["المخزون", "stock", 9], ["قيمة المخزون", "stock_value", 14, true], ["آخر بيع", "last_sale", 12], ["الحالة", "st", 16]],
    f.pricing.map(p => ({ ...p, st: PRICE[p.status] })), ["qty_sold", "revenue", "gross", "stock_value"]);
  if (want("pnl")) {
    sheet("المصروفات حسب الحساب", [["الحساب", "name", 36], ["الكود", "code", 10], ["المعالجة", "t", 20], ["المبلغ", "amount", 14, true], ["عدد القيود", "n", 10]], f.expensesByAccount.map(a => ({ ...a, t: TREAT[a.treatment] })), ["amount", "n"]);
    sheet("قيود المصروفات", [["التاريخ", "date", 12], ["البيان", "note", 44], ["الجهة", "vendor", 20], ["الحساب", "account", 28], ["المعالجة", "t", 20], ["المبلغ", "amount", 14, true], ["الضريبة", "tax", 10, true]], f.entries.map(e => ({ ...e, t: TREAT[e.treatment] || e.treatment })), ["amount", "tax"]);
    sheet("المصروفات الثابتة", [["البند", "name", 30], ["النوع", "category", 14], ["شهرياً", "monthly_amount", 14, true], ["من", "start_month", 12], ["إلى", "end_month", 12], ["ملاحظات", "notes", 30]], f.fixed as unknown as Array<Record<string, unknown>>, ["monthly_amount"]);
  }
  if (want("advisor")) {
    const p = f.plan;
    sheet("التخطيط", [["المؤشر", "label", 46], ["القيمة", "value", 18, true], ["التفسير", "note", 60]], [
      { label: "متوسط المبيعات الشهرية (آخر 6 شهور)", value: p.current_sales, note: "" },
      { label: "هامش مجمل الربح", value: p.gm, note: "% من المبيعات يتبقى بعد تكلفة البضاعة" },
      { label: "المصاريف الثابتة الشهرية", value: p.monthly_fixed, note: p.fixed_source === "planned" ? "من المصروفات الثابتة اللي حددتها" : "متوسط المصروفات الفعلية من دفترة" },
      { label: "نقطة التعادل (مبيعات شهرية)", value: p.break_even_sales, note: "أقل مبيعات تغطي كل المصاريف بدون خسارة" },
      { label: `هدف المبيعات الشهري (صافي ربح ${f.settings.target_net_margin}%)`, value: p.target_sales, note: "" },
      { label: "هدف المبيعات السنوي", value: p.target_annual, note: "" },
      { label: "المصروفات المسموحة شهرياً", value: p.allowed_opex, note: "على مستوى المبيعات الحالي" },
    ]);
    sheet("التوصيات", [["الأولوية", "level", 10], ["التوصية", "title", 50], ["التفاصيل", "text", 90]], f.advice.map(a => ({ ...a, level: { danger: "عاجل", warn: "مهم", good: "ممتاز", info: "للعلم" }[a.level] })));
  }
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="elite-finance-${section}-${from}_${to}.xlsx"` } });
}
