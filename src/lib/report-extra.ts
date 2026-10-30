import { query } from "@/lib/db";
import { getDetailedReportData } from "@/lib/report-data";
import { reportDefinition, type ReportType } from "@/lib/reporting";

// ───────────────────────── Filters ─────────────────────────
export type ReportFilters = { from: string; to: string; repId: string; productId: string; city: string; status: string };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_RE = /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const STATUSES = new Set(["completed", "planned", "cancelled", "follow_up"]);

export function riyadhToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date()); }

export function parseReportFilters(sp: URLSearchParams): ReportFilters {
  const today = riyadhToday();
  let from = sp.get("from") || "", to = sp.get("to") || "";
  if (!DAY_RE.test(from)) from = `${today.slice(0, 7)}-01`;
  if (!DAY_RE.test(to)) to = today;
  if (from > to) [from, to] = [to, from];
  const repId = UUID_RE.test(sp.get("repId") || "") ? sp.get("repId")! : "";
  const productId = UUID_RE.test(sp.get("productId") || "") ? sp.get("productId")! : "";
  const city = (sp.get("city") || "").slice(0, 100);
  const status = STATUSES.has(sp.get("status") || "") ? sp.get("status")! : "";
  return { from, to, repId, productId, city, status };
}

const addDays = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const spanDays = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5) + 1;
export function previousPeriod(f: ReportFilters) { const n = spanDays(f.from, f.to); return { from: addDays(f.from, -n), to: addDays(f.from, -1) }; }

/** CTE "fv" = filtered visits (one row per visit). Also returns the product line filter for visit_items. */
function fvCte(f: ReportFilters, vals: unknown[], range = { from: f.from, to: f.to }) {
  const p = (v: unknown) => { vals.push(v); return `$${vals.length}`; };
  const c = [
    `v.visited_at >= (${p(range.from)}::date::timestamp AT TIME ZONE 'Asia/Riyadh')`,
    `v.visited_at < ((${p(range.to)}::date + 1)::timestamp AT TIME ZONE 'Asia/Riyadh')`,
  ];
  if (f.repId) c.push(`v.sales_rep_id=${p(f.repId)}`);
  if (f.city) c.push(`d.city=${p(f.city)}`);
  if (f.status) c.push(`v.status::text=${p(f.status)}`);
  let line = "";
  if (f.productId) {
    const x = p(f.productId);
    c.push(`(EXISTS(SELECT 1 FROM visit_items q WHERE q.visit_id=v.id AND q.product_id=${x}) OR EXISTS(SELECT 1 FROM visit_presented_products q WHERE q.visit_id=v.id AND q.product_id=${x}))`);
    line = ` AND vi.product_id=${x}`;
  }
  const cte = `fv AS (SELECT v.id, v.status::text AS status, v.doctor_id, v.sales_rep_id, v.visited_at, v.created_at, v.notes, v.lat,
      (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date AS day FROM visits v JOIN doctors d ON d.id=v.doctor_id WHERE ${c.join(" AND ")})`;
  return { cte, line };
}

// ───────────────────────── Summary (KPIs, chart data) ─────────────────────────
type Totals = { visits: number; completed: number; doctors: number; reps: number; samples: number; orders: number };
async function totals(f: ReportFilters, range: { from: string; to: string }): Promise<Totals> {
  const vals: unknown[] = []; const { cte, line } = fvCte(f, vals, range);
  const r = await query<Totals>(`WITH ${cte}
    SELECT (SELECT count(*) FROM fv)::int visits, (SELECT count(*) FROM fv WHERE status='completed')::int completed,
      (SELECT count(DISTINCT doctor_id) FROM fv)::int doctors, (SELECT count(DISTINCT sales_rep_id) FROM fv)::int reps,
      (SELECT COALESCE(sum(vi.quantity),0) FROM visit_items vi JOIN fv ON fv.id=vi.visit_id WHERE vi.kind='sample'${line})::int samples,
      (SELECT COALESCE(sum(vi.quantity),0) FROM visit_items vi JOIN fv ON fv.id=vi.visit_id WHERE vi.kind='order'${line})::int orders`, vals);
  return r.rows[0];
}

export async function getReportSummary(f: ReportFilters) {
  const prev = previousPeriod(f);
  const [current, previous] = await Promise.all([totals(f, f), totals(f, prev)]);
  const v1: unknown[] = []; const a = fvCte(f, v1);
  const daily = await query<{ day: string; visits: number; completed: number }>(`WITH ${a.cte}
    SELECT day::text, count(*)::int visits, count(*) FILTER (WHERE status='completed')::int completed FROM fv GROUP BY day ORDER BY day`, v1);
  const v2: unknown[] = []; const b = fvCte(f, v2);
  const reactions = await query<{ product_id: string; product_name: string; interested: number; neutral: number; not_interested: number }>(`WITH ${b.cte}
    SELECT p.id product_id, p.name product_name,
      count(*) FILTER (WHERE pp.reaction='interested')::int interested, count(*) FILTER (WHERE pp.reaction='neutral')::int neutral,
      count(*) FILTER (WHERE pp.reaction='not_interested')::int not_interested
    FROM visit_presented_products pp JOIN fv ON fv.id=pp.visit_id JOIN products p ON p.id=pp.product_id
    ${f.productId ? `WHERE pp.product_id=$${v2.indexOf(f.productId) + 1}` : ""}
    GROUP BY p.id, p.name ORDER BY count(*) DESC`, v2);
  return { range: { from: f.from, to: f.to }, previousRange: prev, current, previous, daily: daily.rows, reactions: reactions.rows };
}

// ───────────────────────── Report registry ─────────────────────────
export type ColType = "text" | "int" | "money" | "pct" | "date" | "datetime" | "time" | "status" | "reaction" | "approval" | "purpose";
export type Col = { key: string; label: string; type?: ColType };
export type ReportDef = { id: string; label: string; group: "activity" | "doctors" | "products" | "targets"; hint: string; columns: Col[] };

const T: Record<string, ColType> = {
  visited_at: "datetime", last_visit: "datetime", last_activity: "datetime", last_sample: "datetime", created_at: "datetime", approved_at: "datetime",
  due: "date", day: "date", first_visit: "time", last_visit_time: "time", status: "status", approval_status: "approval", sample_purpose: "purpose",
  annual_sales_target: "money", achieved: "money", remaining: "money", pct: "pct", interest_pct: "pct", rate: "pct",
};
const INT_KEYS = /^(visits|completed|completed_visits|unique_doctors|doctors|samples|orders|reps|presented|interested|neutral|not_interested|quantity|sample_visits|products_count|monthly_target|actual_visits|planned|clinics|days_since|gap_days|delay_hours|visits_per_month|cancelled)$/;
const typed = (cols: Array<{ key: string; label: string }>): Col[] => cols.map(c => ({ ...c, type: T[c.key] || (INT_KEYS.test(c.key) ? "int" : "text") }));

const BASE: Array<{ id: ReportType; group: ReportDef["group"]; hint: string }> = [
  { id: "reps", group: "activity", hint: "زيارات وأطباء وعينات وأوردرات كل مندوب في الفترة" },
  { id: "visits", group: "activity", hint: "كل زيارة بتفاصيلها" },
  { id: "compliance", group: "targets", hint: "زيارات الخطة المعتمدة اللي اتنفذت في ميعادها" },
  { id: "coverage", group: "doctors", hint: "المطلوب شهرياً حسب الفئة مقابل المنفذ" },
  { id: "products", group: "products", hint: "شرح المنتجات وردود الفعل والعينات" },
  { id: "samples", group: "products", hint: "كل عينة اتوزعت ولمين" },
  { id: "sampleDoctors", group: "doctors", hint: "الأطباء اللي أخدوا عينات" },
  { id: "sales", group: "targets", hint: "الهدف السنوي مقابل المبيعات المعتمدة (سنة بداية الفترة)" },
];
const EXTRA: ReportDef[] = [
  { id: "daily", label: "النشاط اليومي", group: "activity", hint: "كل مندوب في كل يوم: أول وآخر زيارة والعدد", columns: typed([
    { key: "day", label: "اليوم" }, { key: "rep_name", label: "المندوب" }, { key: "first_visit", label: "أول زيارة" }, { key: "last_visit_time", label: "آخر زيارة" },
    { key: "visits", label: "الزيارات" }, { key: "completed", label: "المكتملة" }, { key: "cancelled", label: "الملغاة" }, { key: "doctors", label: "الأطباء" },
    { key: "samples", label: "العينات" }, { key: "orders", label: "الأوردر" }]) },
  { id: "overdue", label: "أطباء متأخرين", group: "doctors", hint: "أطباء عدّى ميعاد زيارتهم حسب الفئة (حتى اليوم)", columns: typed([
    { key: "doctor_name", label: "الطبيب" }, { key: "classification", label: "الفئة" }, { key: "specialty", label: "التخصص" }, { key: "clinic_name", label: "العيادة" },
    { key: "city", label: "المدينة" }, { key: "gap_days", label: "كل كام يوم" }, { key: "last_visit", label: "آخر زيارة" }, { key: "days_since", label: "أيام من آخر زيارة" },
    { key: "rep_name", label: "آخر مندوب" }]) },
  { id: "followups", label: "المتابعات", group: "doctors", hint: "المتابعات المستحقة في الفترة + المتأخرة المفتوحة", columns: typed([
    { key: "due", label: "الميعاد" }, { key: "state", label: "الحالة" }, { key: "doctor_name", label: "الطبيب" }, { key: "clinic_name", label: "العيادة" },
    { key: "city", label: "المدينة" }, { key: "rep_name", label: "المندوب" }, { key: "note", label: "المطلوب" }, { key: "source", label: "المصدر" }]) },
  { id: "orders", label: "الأوردرات", group: "products", hint: "كل أوردر وحالة الموافقة عليه", columns: typed([
    { key: "visited_at", label: "التاريخ" }, { key: "rep_name", label: "المندوب" }, { key: "doctor_name", label: "الطبيب" }, { key: "clinic_name", label: "العيادة" },
    { key: "city", label: "المدينة" }, { key: "product_name", label: "المنتج" }, { key: "quantity", label: "الكمية" }, { key: "approval_status", label: "الموافقة" },
    { key: "approval_note", label: "ملاحظة الموافقة" }, { key: "approved_at", label: "وقت الموافقة" }]) },
  { id: "quality", label: "جودة التسجيل", group: "activity", hint: "زيارات اتسجلت متأخر، أو من غير موقع، أو ملاحظتها قصيرة", columns: typed([
    { key: "visited_at", label: "وقت الزيارة" }, { key: "created_at", label: "وقت التسجيل" }, { key: "delay_hours", label: "التأخير (ساعات)" },
    { key: "rep_name", label: "المندوب" }, { key: "doctor_name", label: "الطبيب" }, { key: "status", label: "الحالة" }, { key: "issues", label: "الملاحظات على التسجيل" }, { key: "notes", label: "نص الملاحظة" }]) },
  { id: "repProduct", label: "المندوب × المنتج", group: "products", hint: "مين بيشرح أنهي منتج وردود الفعل", columns: typed([
    { key: "rep_name", label: "المندوب" }, { key: "product_name", label: "المنتج" }, { key: "presented", label: "مرات الشرح" }, { key: "interested", label: "مهتم" },
    { key: "neutral", label: "محايد" }, { key: "not_interested", label: "غير مهتم" }, { key: "interest_pct", label: "نسبة الاهتمام" }, { key: "samples", label: "العينات" }, { key: "orders", label: "الأوردر" }]) },
  { id: "cities", label: "المدن", group: "doctors", hint: "توزيع الزيارات حسب المدينة", columns: typed([
    { key: "city", label: "المدينة" }, { key: "visits", label: "الزيارات" }, { key: "completed", label: "المكتملة" }, { key: "doctors", label: "الأطباء" },
    { key: "clinics", label: "العيادات" }, { key: "reps", label: "المناديب" }, { key: "samples", label: "العينات" }, { key: "orders", label: "الأوردر" }]) },
];
const BASE_LABEL: Record<string, string> = { reps: "أداء المناديب", visits: "تفاصيل الزيارات", compliance: "الالتزام بالخطة", coverage: "Coverage الأطباء", products: "المنتجات", samples: "توزيع العينات", sampleDoctors: "أطباء العينات", sales: "الأهداف والمبيعات" };

export const REPORTS: ReportDef[] = [
  ...BASE.map(b => {
    const cols = typed(reportDefinition(b.id).columns);
    if (b.id === "compliance") cols.push({ key: "pct", label: "نسبة الالتزام", type: "pct" });
    if (b.id === "coverage") cols.splice(7, 0, { key: "pct", label: "النسبة", type: "pct" });
    if (b.id === "sales") cols.push({ key: "pct", label: "نسبة التحقيق", type: "pct" });
    return { id: b.id, label: BASE_LABEL[b.id], group: b.group, hint: b.hint, columns: cols };
  }),
  ...EXTRA,
];
export const REPORT_ORDER = ["reps", "daily", "visits", "quality", "compliance", "coverage", "overdue", "followups", "cities", "products", "repProduct", "samples", "sampleDoctors", "orders", "sales"];
export function findReport(id: string) { return REPORTS.find(r => r.id === id); }

// ───────────────────────── Rows ─────────────────────────
type Row = Record<string, unknown>;
const pct = (a: unknown, b: unknown) => (Number(b) ? Math.round((Number(a) / Number(b)) * 100) : null);

async function baseRows(id: ReportType, f: ReportFilters, unlimited: boolean): Promise<Row[]> {
  const sp = new URLSearchParams({ reportType: id });
  if (id === "sales") { const y = f.from.slice(0, 4); sp.set("year", y); if (f.repId) sp.set("repId", f.repId); }
  else for (const k of ["from", "to", "repId", "productId", "city", "status"] as const) if (f[k]) sp.set(k, f[k]);
  const data = await getDetailedReportData(sp, { unlimited });
  const rows = (data[reportDefinition(id).source] as Row[]) || [];
  if (id === "compliance") return rows.map(r => ({ ...r, pct: pct(r.completed, r.planned) }));
  if (id === "coverage") return rows.map(r => ({ ...r, pct: pct(r.actual_visits, r.monthly_target) }));
  if (id === "sales") return rows.map(r => ({ ...r, pct: pct(r.achieved, r.annual_sales_target) }));
  return rows;
}

async function extraRows(id: string, f: ReportFilters): Promise<Row[]> {
  const vals: unknown[] = [];
  const p = (v: unknown) => { vals.push(v); return `$${vals.length}`; };
  if (id === "daily") {
    const { cte, line } = fvCte(f, vals);
    return (await query(`WITH ${cte}
      SELECT fv.day::text AS day, u.id rep_id, u.name rep_name,
        to_char(min(fv.visited_at) AT TIME ZONE 'Asia/Riyadh','HH24:MI') first_visit, to_char(max(fv.visited_at) AT TIME ZONE 'Asia/Riyadh','HH24:MI') last_visit_time,
        count(*)::int visits, count(*) FILTER (WHERE fv.status='completed')::int completed, count(*) FILTER (WHERE fv.status='cancelled')::int cancelled,
        count(DISTINCT fv.doctor_id)::int doctors,
        COALESCE((SELECT sum(vi.quantity) FROM visit_items vi JOIN fv f2 ON f2.id=vi.visit_id WHERE vi.kind='sample' AND f2.day=fv.day AND f2.sales_rep_id=u.id${line}),0)::int samples,
        COALESCE((SELECT sum(vi.quantity) FROM visit_items vi JOIN fv f2 ON f2.id=vi.visit_id WHERE vi.kind='order' AND f2.day=fv.day AND f2.sales_rep_id=u.id${line}),0)::int orders
      FROM fv JOIN users u ON u.id=fv.sales_rep_id GROUP BY fv.day, u.id, u.name ORDER BY fv.day DESC, u.name`, vals)).rows;
  }
  if (id === "overdue") {
    const repCond = f.repId ? `AND v.sales_rep_id=${p(f.repId)}` : "";
    const conds = ["COALESCE(d.status,'active')='active'", "(l.last_visit IS NULL OR (now() AT TIME ZONE 'Asia/Riyadh')::date - (l.last_visit AT TIME ZONE 'Asia/Riyadh')::date > ceil(30.0/pf.visits_per_month))"];
    if (f.city) conds.push(`d.city=${p(f.city)}`);
    if (f.repId) conds.push(`(l.doctor_id IS NOT NULL OR EXISTS(SELECT 1 FROM plan_items pi JOIN plans pl ON pl.id=pi.plan_id WHERE pl.user_id=$1 AND pi.doctor_id=d.id))`);
    return (await query(`WITH l AS (SELECT v.doctor_id, max(v.visited_at) last_visit,
          (array_agg(u.name ORDER BY v.visited_at DESC))[1] rep_name, (array_agg(u.id ORDER BY v.visited_at DESC))[1] rep_id
        FROM visits v JOIN users u ON u.id=v.sales_rep_id WHERE v.status='completed' ${repCond} GROUP BY v.doctor_id)
      SELECT d.id doctor_id, d.name doctor_name, d.classification, d.specialty, d.clinic_name, d.city,
        ceil(30.0/pf.visits_per_month)::int gap_days, l.last_visit, l.rep_name, l.rep_id,
        CASE WHEN l.last_visit IS NULL THEN NULL ELSE ((now() AT TIME ZONE 'Asia/Riyadh')::date - (l.last_visit AT TIME ZONE 'Asia/Riyadh')::date) END days_since
      FROM doctors d JOIN plan_frequencies pf ON pf.classification=d.classification AND pf.visits_per_month>0 LEFT JOIN l ON l.doctor_id=d.id
      WHERE ${conds.join(" AND ")}
      ORDER BY d.classification, days_since DESC NULLS FIRST, d.name`, vals)).rows;
  }
  if (id === "followups") {
    const from = p(f.from), to = p(f.to);
    const extra: string[] = [];
    if (f.repId) extra.push(`x.rep_id=${p(f.repId)}`);
    if (f.city) extra.push(`x.city=${p(f.city)}`);
    const rows = (await query(`SELECT * FROM (
        SELECT 'زيارة' source, v.follow_up_at due, v.follow_up_note note, d.id doctor_id, d.name doctor_name, d.clinic_name, d.city, u.id rep_id, u.name rep_name,
          EXISTS(SELECT 1 FROM visits v2 WHERE v2.doctor_id=v.doctor_id AND v2.sales_rep_id=v.sales_rep_id AND v2.visited_at>v.visited_at AND v2.status='completed') done
        FROM visits v JOIN doctors d ON d.id=v.doctor_id JOIN users u ON u.id=v.sales_rep_id WHERE v.follow_up_at IS NOT NULL
        UNION ALL
        SELECT 'متابعة طبيب', f.due_at, concat_ws(' — ', NULLIF(f.title,''), NULLIF(f.note,'')), d.id, d.name, d.clinic_name, d.city, u.id, u.name,
          (f.completed_at IS NOT NULL OR f.status IN ('done','completed','closed'))
        FROM doctor_followups f JOIN doctors d ON d.id=f.doctor_id JOIN users u ON u.id=f.sales_rep_id WHERE f.due_at IS NOT NULL
      ) x WHERE ((x.due BETWEEN ${from}::date AND ${to}::date) OR (NOT x.done AND x.due < (now() AT TIME ZONE 'Asia/Riyadh')::date))
      ${extra.length ? "AND " + extra.join(" AND ") : ""} ORDER BY x.done, x.due`, vals)).rows as Row[];
    const today = riyadhToday();
    return rows.map(r => {
      const due = String(r.due).slice(0, 10);
      return { ...r, due, state: r.done ? "تمت" : due < today ? "متأخرة" : due === today ? "اليوم" : "قادمة" };
    });
  }
  if (id === "orders") {
    const { cte, line } = fvCte(f, vals);
    return (await query(`WITH ${cte}
      SELECT vi.id, fv.visited_at, u.id rep_id, u.name rep_name, d.id doctor_id, d.name doctor_name, d.clinic_name, d.city,
        p.id product_id, p.name product_name, vi.quantity, vi.approval_status, vi.approval_note, vi.approved_at
      FROM visit_items vi JOIN fv ON fv.id=vi.visit_id JOIN users u ON u.id=fv.sales_rep_id JOIN doctors d ON d.id=fv.doctor_id JOIN products p ON p.id=vi.product_id
      WHERE vi.kind='order'${line} ORDER BY fv.visited_at DESC`, vals)).rows;
  }
  if (id === "quality") {
    const { cte } = fvCte(f, vals);
    return (await query(`WITH ${cte}, q AS (
        SELECT fv.*, round(extract(epoch FROM (fv.created_at - fv.visited_at))/3600.0, 1) delay_hours,
          concat_ws('، ', CASE WHEN fv.created_at - fv.visited_at > interval '2 hours' THEN 'تسجيل متأخر' END,
                          CASE WHEN fv.lat IS NULL THEN 'بدون موقع' END,
                          CASE WHEN length(btrim(COALESCE(fv.notes,''))) < 15 THEN 'ملاحظة قصيرة' END) issues FROM fv)
      SELECT q.id, q.visited_at, q.created_at, q.delay_hours::float delay_hours, u.id rep_id, u.name rep_name, d.id doctor_id, d.name doctor_name, q.status, q.issues, q.notes
      FROM q JOIN users u ON u.id=q.sales_rep_id JOIN doctors d ON d.id=q.doctor_id WHERE q.issues <> '' ORDER BY q.visited_at DESC`, vals)).rows;
  }
  if (id === "repProduct") {
    const { cte, line } = fvCte(f, vals);
    const pf = f.productId ? line.replace("vi.product_id", "pp.product_id") : "";
    const rows = (await query(`WITH ${cte},
      pres AS (SELECT fv.sales_rep_id rep, pp.product_id, count(*)::int presented, count(*) FILTER (WHERE pp.reaction='interested')::int interested,
                 count(*) FILTER (WHERE pp.reaction='neutral')::int neutral, count(*) FILTER (WHERE pp.reaction='not_interested')::int not_interested
               FROM visit_presented_products pp JOIN fv ON fv.id=pp.visit_id WHERE true${pf} GROUP BY 1,2),
      it AS (SELECT fv.sales_rep_id rep, vi.product_id, COALESCE(sum(vi.quantity) FILTER (WHERE vi.kind='sample'),0)::int samples,
               COALESCE(sum(vi.quantity) FILTER (WHERE vi.kind='order'),0)::int orders FROM visit_items vi JOIN fv ON fv.id=vi.visit_id WHERE true${line} GROUP BY 1,2),
      k AS (SELECT rep, product_id FROM pres UNION SELECT rep, product_id FROM it)
      SELECT u.id rep_id, u.name rep_name, p.id product_id, p.name product_name, COALESCE(pres.presented,0) presented, COALESCE(pres.interested,0) interested,
        COALESCE(pres.neutral,0) neutral, COALESCE(pres.not_interested,0) not_interested, COALESCE(it.samples,0) samples, COALESCE(it.orders,0) orders
      FROM k JOIN users u ON u.id=k.rep JOIN products p ON p.id=k.product_id
      LEFT JOIN pres ON pres.rep=k.rep AND pres.product_id=k.product_id LEFT JOIN it ON it.rep=k.rep AND it.product_id=k.product_id
      ORDER BY u.name, presented DESC, p.name`, vals)).rows as Row[];
    return rows.map(r => ({ ...r, interest_pct: pct(r.interested, r.presented) }));
  }
  if (id === "cities") {
    const { cte, line } = fvCte(f, vals);
    return (await query(`WITH ${cte}
      SELECT COALESCE(NULLIF(d.city,''),'غير محدد') city, count(*)::int visits, count(*) FILTER (WHERE fv.status='completed')::int completed,
        count(DISTINCT fv.doctor_id)::int doctors, count(DISTINCT NULLIF(d.clinic_name,''))::int clinics, count(DISTINCT fv.sales_rep_id)::int reps,
        COALESCE(sum((SELECT sum(vi.quantity) FROM visit_items vi WHERE vi.visit_id=fv.id AND vi.kind='sample'${line})),0)::int samples,
        COALESCE(sum((SELECT sum(vi.quantity) FROM visit_items vi WHERE vi.visit_id=fv.id AND vi.kind='order'${line})),0)::int orders
      FROM fv JOIN doctors d ON d.id=fv.doctor_id GROUP BY 1 ORDER BY visits DESC`, vals)).rows;
  }
  throw new Error("Unknown report");
}

export async function getReportRows(id: string, f: ReportFilters, opts: { unlimited?: boolean } = {}): Promise<Row[]> {
  if (BASE.some(b => b.id === id)) return baseRows(id as ReportType, f, !!opts.unlimited);
  return extraRows(id, f);
}
