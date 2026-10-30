import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_RE = /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const STATUS: Record<string, string> = { completed: "مكتملة", planned: "مجدولة", cancelled: "ملغاة", follow_up: "متابعة" };
const REACTION: Record<string, string> = { interested: "مهتم", neutral: "محايد", not_interested: "غير مهتم" };
const APPROVAL: Record<string, string> = { pending: "بانتظار الموافقة", approved: "معتمد", rejected: "مرفوض" };
type Row = {
  id: string; day: string; time: string; visited_at: string; created_at: string; status: string; notes: string | null;
  rep_name: string; doctor_name: string; classification: string | null; specialty: string | null; clinic_name: string | null; city: string | null;
  lat: number | null; lng: number | null; follow_up_at: string | null; follow_up_note: string | null;
  presented: Array<{ n: string; r: string }>; items: Array<{ n: string; k: string; q: number; a: string | null }>;
};

// Excel report of visits for one rep (or all reps) between two Riyadh dates, inclusive.
// GET /api/admin/visits/export?repId=<uuid?>&from=YYYY-MM-DD&to=YYYY-MM-DD&label=<optional title>
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const repId = sp.get("repId") || "";
  const from = sp.get("from") || "", to = sp.get("to") || "";
  if ((repId && !UUID_RE.test(repId)) || !DAY_RE.test(from) || !DAY_RE.test(to) || from > to)
    return NextResponse.json({ error: "Invalid range" }, { status: 400 });

  const rep = repId ? (await query<{ name: string }>("SELECT name FROM users WHERE id=$1", [repId])).rows[0] : null;
  if (repId && !rep) return NextResponse.json({ error: "Representative not found" }, { status: 404 });

  const vals: unknown[] = [from, to]; let repCond = "";
  if (repId) { vals.push(repId); repCond = "AND v.sales_rep_id=$3"; }
  const r = await query<Row>(`
    SELECT v.id,
           (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date::text AS day,
           to_char(v.visited_at AT TIME ZONE 'Asia/Riyadh', 'HH24:MI') AS time,
           v.visited_at, v.created_at, v.status::text AS status, v.notes, u.name AS rep_name,
           d.name AS doctor_name, d.classification, d.specialty, d.clinic_name, d.city,
           v.lat, v.lng, v.follow_up_at::text AS follow_up_at, v.follow_up_note,
           COALESCE((SELECT json_agg(json_build_object('n',pr.name,'r',pp.reaction) ORDER BY pr.name)
                     FROM visit_presented_products pp JOIN products pr ON pr.id=pp.product_id WHERE pp.visit_id=v.id),'[]'::json) AS presented,
           COALESCE((SELECT json_agg(json_build_object('n',p.name,'k',vi.kind,'q',vi.quantity,'a',vi.approval_status) ORDER BY vi.kind, p.name)
                     FROM visit_items vi JOIN products p ON p.id=vi.product_id WHERE vi.visit_id=v.id),'[]'::json) AS items
    FROM visits v JOIN users u ON u.id=v.sales_rep_id JOIN doctors d ON d.id=v.doctor_id
    WHERE v.visited_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Riyadh')
      AND v.visited_at <  (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Riyadh')
      ${repCond}
    ORDER BY v.visited_at, v.id`, vals);
  const rows = r.rows;

  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Elite Skin CRM";
  const HEAD = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF10484F" } } };
  const title = `${rep ? rep.name : "كل المناديب"} — ${from === to ? from : `${from} إلى ${to}`}`;

  // Sheet 1: summary per day
  const s1 = wb.addWorksheet("ملخص", { views: [{ rightToLeft: true, state: "frozen", ySplit: 3 }] });
  s1.addRow([`تقرير الزيارات: ${title}`]).font = { bold: true, size: 14 };
  s1.addRow([`تاريخ الإصدار: ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })}`]);
  const h1 = s1.addRow(["اليوم", "إجمالي الزيارات", "مكتملة", "ملغاة", "أخرى", "أطباء مختلفون", "عينات (قطع)", "أوردرات (قطع)"]);
  h1.eachCell(c => { c.font = HEAD.font; c.fill = HEAD.fill; });
  const byDay = new Map<string, Row[]>();
  for (const x of rows) (byDay.get(x.day) || byDay.set(x.day, []).get(x.day)!).push(x);
  const qty = (xs: Row[], k: string) => xs.reduce((a, x) => a + x.items.filter(i => i.k === k).reduce((b, i) => b + Number(i.q || 0), 0), 0);
  const line = (label: string, xs: Row[]) => {
    const done = xs.filter(x => x.status === "completed").length, canc = xs.filter(x => x.status === "cancelled").length;
    return [label, xs.length, done, canc, xs.length - done - canc, new Set(xs.map(x => x.doctor_name)).size, qty(xs, "sample"), qty(xs, "order")];
  };
  for (const [d, xs] of byDay) s1.addRow(line(d, xs));
  const tot = s1.addRow(line("الإجمالي", rows)); tot.font = { bold: true };
  tot.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4F2" } }; });
  s1.columns.forEach((c, i) => { c.width = i === 0 ? 16 : 15; });

  // Sheet 2: every visit
  const s2 = wb.addWorksheet("الزيارات", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  const cols = ["التاريخ", "الوقت", "المندوب", "الطبيب", "الفئة", "التخصص", "العيادة", "المدينة", "الحالة",
    "المنتجات المعروضة", "العينات", "الأوردرات", "الملاحظات", "المتابعة القادمة", "وقت التسجيل", "تسجيل متأخر", "الموقع"];
  const h2 = s2.addRow(cols); h2.eachCell(c => { c.font = HEAD.font; c.fill = HEAD.fill; c.alignment = { vertical: "middle" }; });
  for (const x of rows) {
    const late = new Date(x.created_at).getTime() - new Date(x.visited_at).getTime() > 2 * 3600 * 1000;
    const row = s2.addRow([
      x.day, x.time, x.rep_name, x.doctor_name, x.classification || "", x.specialty || "", x.clinic_name || "", x.city || "",
      STATUS[x.status] || x.status,
      x.presented.map(p => `${p.n} (${REACTION[p.r] || p.r})`).join("، "),
      x.items.filter(i => i.k === "sample").map(i => `${i.n} ×${i.q}`).join("، "),
      x.items.filter(i => i.k === "order").map(i => `${i.n} ×${i.q} — ${APPROVAL[i.a || ""] || i.a || ""}`).join("، "),
      x.notes || "",
      x.follow_up_at ? `${x.follow_up_at}${x.follow_up_note ? ` — ${x.follow_up_note}` : ""}` : "",
      new Date(x.created_at).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" }),
      late ? "نعم" : "",
      x.lat != null && x.lng != null ? { text: "خريطة", hyperlink: `https://www.google.com/maps?q=${x.lat},${x.lng}` } : "",
    ]);
    row.alignment = { vertical: "top", wrapText: true };
  }
  const widths = [12, 8, 18, 22, 6, 16, 22, 12, 10, 30, 22, 30, 45, 24, 18, 10, 10];
  s2.columns.forEach((c, i) => { c.width = widths[i] || 14; });
  s2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };

  const buf = await wb.xlsx.writeBuffer();
  const name = `visits-${repId ? "rep" : "all"}-${from}${from === to ? "" : `_${to}`}.xlsx`;
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
