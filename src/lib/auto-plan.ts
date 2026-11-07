import { pool, query } from "@/lib/db";
import { pausedSql } from "@/lib/doctor-pauses";
import { reorderDue } from "@/lib/smart";

const DAY = 864e5;
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
const addDays = (d: string, n: number) => new Date(t(d) + n * DAY).toISOString().slice(0, 10);
const PER_DAY = 8;

/** Sunday that starts the week after `today` (Riyadh work week Sun–Thu). */
export function nextWeekStart(today: string) { const wd = new Date(`${today}T12:00:00Z`).getUTCDay(); return addDays(today, 7 - wd); }
export const workDays = (sunday: string) => [0, 1, 2, 3, 4].map(i => addDays(sunday, i));

type Cand = { id: string; name: string; city: string; clinic: string; cls: string; score: number; reason: string };

/** Pure: spread picked doctors over the days, keeping each clinic/city together so a day stays in one area. */
export function distribute(c: Cand[], days: string[], perDay = PER_DAY) {
  const groups = new Map<string, Cand[]>();
  for (const x of [...c].sort((a, b) => a.city.localeCompare(b.city, "ar") || a.clinic.localeCompare(b.clinic, "ar") || b.score - a.score)) {
    const k = `${x.city}::${x.clinic}`; groups.set(k, [...(groups.get(k) || []), x]);
  }
  const out: Array<Cand & { date: string }> = []; let d = 0, n = 0;
  for (const g of groups.values()) {
    if (n && n + g.length > perDay && d < days.length - 1) { d++; n = 0; }
    for (const x of g) { if (n >= perDay && d < days.length - 1) { d++; n = 0; } out.push({ ...x, date: days[d] }); n++; }
  }
  return out;
}

/** Score every active doctor for one rep for the week: reorder due, follow-up due, late by class, never visited. */
async function candidates(repId: string, weekStart: string, weekEnd: string, today: string): Promise<Cand[]> {
  const rows = (await query<{ id: string; name: string; city: string | null; clinic: string | null; cls: string | null; last: string | null; gap: number; fu: string | null }>(`
    SELECT d.id, d.name, d.city, d.clinic_name clinic, upper(d.classification) cls,
      (SELECT max(v.visited_at)::date::text FROM visits v WHERE v.doctor_id=d.id AND v.status::text<>'cancelled') last,
      COALESCE(ceil(30.0 / NULLIF((SELECT visits_per_month FROM plan_frequencies f WHERE f.classification=d.classification), 0)), 30)::int gap,
      (SELECT min(x.due)::text FROM (
        SELECT v.follow_up_at::date due FROM visits v WHERE v.doctor_id=d.id AND v.sales_rep_id=$1 AND v.follow_up_at IS NOT NULL AND v.follow_up_at::date <= $3::date
          AND NOT EXISTS (SELECT 1 FROM visits v2 WHERE v2.doctor_id=d.id AND v2.visited_at > v.visited_at AND v2.status::text='completed')
        UNION ALL SELECT f.due_at::date FROM doctor_followups f WHERE f.doctor_id=d.id AND f.sales_rep_id=$1 AND f.completed_at IS NULL AND f.due_at::date <= $3::date) x) fu
    FROM doctors d WHERE COALESCE(d.status,'active')='active' AND NOT ${pausedSql("$1", "d.id", "$2::date")}`, [repId, weekStart, weekEnd]).catch(e => { console.error("auto-plan candidates", e); return { rows: [] }; })).rows;
  const due = new Map<string, string>();
  for (const r of await reorderDue(today, { repId, ahead: 10 }).catch(() => [])) for (const doc of r.doctors.slice(0, 2)) due.set(doc.id, r.days_to < 0 ? `طلبها متأخر ${-r.days_to} يوم` : `طلبها الجاي خلال ${r.days_to} يوم`);
  const out: Cand[] = [];
  for (const r of rows) {
    const since = r.last ? Math.round((t(weekStart) - t(r.last)) / DAY) : null, late = since === null ? null : since - r.gap;
    let score = 0, reason = "";
    if (due.has(r.id)) { score = 100; reason = due.get(r.id)!; }
    else if (r.fu) { score = 90; reason = "متابعة مستحقة"; }
    else if (late !== null && late >= 0) { score = (r.cls === "A" ? 80 : r.cls === "B" ? 60 : 40) + Math.min(19, late); reason = `متأخر ${late} يوم (فئة ${r.cls || "—"})`; }
    else if (since === null) { score = r.cls === "A" ? 70 : r.cls === "B" ? 45 : 25; reason = "عمره ما اتزار"; }
    if (score) out.push({ id: r.id, name: r.name, city: r.city || "بدون مدينة", clinic: r.clinic || "", cls: r.cls || "", score, reason });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Build next week's draft plan for each active rep that has no plan for that week yet. Returns what was created. */
export async function buildAutoPlans(today: string, opts: { repId?: string; weekStart?: string } = {}) {
  const weekStart = opts.weekStart || nextWeekStart(today), days = workDays(weekStart), weekEnd = days[days.length - 1];
  const reps = (await query<{ id: string; name: string }>(`SELECT id, name FROM users WHERE role='sales_rep' AND active ${opts.repId ? "AND id=$1" : ""} ORDER BY name`, opts.repId ? [opts.repId] : [])).rows;
  const created: Array<{ rep: string; plan_id: string; visits: number }> = [], skipped: Array<{ rep: string; why: string }> = [];
  for (const rep of reps) {
    const has = (await query("SELECT 1 FROM plans WHERE user_id=$1 AND status::text<>'rejected' AND period_start<=$3::date AND period_end>=$2::date LIMIT 1", [rep.id, weekStart, weekEnd])).rowCount;
    if (has) { skipped.push({ rep: rep.name, why: "عنده خطة للأسبوع ده" }); continue; }
    const leave = (await query<{ s: string; e: string }>("SELECT start_date::text s, end_date::text e FROM service_requests WHERE requester_id=$1 AND kind='leave' AND status IN ('approved','completed','closed','pending') AND start_date<=$3::date AND end_date>=$2::date", [rep.id, weekStart, weekEnd]).catch(() => ({ rows: [] }))).rows;
    const free = days.filter(d => !leave.some(l => l.s <= d && l.e >= d));
    if (!free.length) { skipped.push({ rep: rep.name, why: "في إجازة الأسبوع كله" }); continue; }
    const picked = (await candidates(rep.id, weekStart, weekEnd, today)).slice(0, Math.min(50, free.length * PER_DAY));
    if (!picked.length) { skipped.push({ rep: rep.name, why: "مفيش أطباء محتاجين زيارة" }); continue; }
    const items = distribute(picked, free);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const p = await client.query<{ id: string }>(`INSERT INTO plans(user_id, period, period_start, period_end, status, target_visits, admin_note) VALUES($1,'weekly',$2,$3,'draft',$4,'مسودة تلقائية — راجعها وابعتها')
        RETURNING id`, [rep.id, weekStart, weekEnd, items.length]);
      for (let i = 0; i < items.length; i++) await client.query("INSERT INTO plan_items(plan_id, doctor_id, planned_date, note, priority, sort_order) VALUES($1,$2,$3,$4,$5,$6)",
        [p.rows[0].id, items[i].id, items[i].date, items[i].reason, items[i].score >= 80 ? "high" : "medium", i]);
      await client.query("INSERT INTO task_notifications(user_id, task_id, plan_id, kind, message, action_url) VALUES($1,NULL,$2,'plan_draft',$3,$4)",
        [rep.id, p.rows[0].id, `🗓️ خطة الأسبوع الجاي جاهزة كمسودة: ${items.length} زيارة — راجعها وابعتها`, `/plans?planId=${p.rows[0].id}`]);
      await client.query("COMMIT");
      created.push({ rep: rep.name, plan_id: p.rows[0].id, visits: items.length });
    } catch (e) { await client.query("ROLLBACK"); console.error("auto plan", rep.name, e); skipped.push({ rep: rep.name, why: "خطأ" }); } finally { client.release(); }
  }
  return { weekStart, weekEnd, created, skipped };
}
