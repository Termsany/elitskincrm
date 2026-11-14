import { pool, query } from "@/lib/db";
import { rankedDoctors } from "@/lib/doctor-suggest";
import { addDays } from "@/lib/fmt";

const DAY = 864e5;
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
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

/** Candidates for the week, from the shared ranking (counted as of the week's last day, so follow-ups due that week are in). */
async function candidates(repId: string, weekStart: string, weekEnd: string): Promise<Cand[]> {
  const [rows, missed] = await Promise.all([
    rankedDoctors(repId, weekEnd).catch(e => { console.error("auto-plan candidates", e); return []; }),
    missedLastWeek(repId, weekStart).catch(() => new Set<string>()),
  ]);
  // visits planned last week and not done come first (unless the doctor is paused this month)
  return rows.filter(d => !d.paused && (d.prio.score >= 20 || missed.has(d.id)))
    .map(d => ({ id: d.id, name: d.name, city: d.city || "بدون مدينة", clinic: d.clinic_name || "", cls: (d.classification || "").toUpperCase(),
      score: missed.has(d.id) ? Math.max(d.prio.score, 100) : d.prio.score, reason: missed.has(d.id) ? "اتأجلت من الأسبوع اللي فات" : d.prio.reason }))
    .sort((a, b) => b.score - a.score);
}

/** Doctors in the rep's plan for the week before `weekStart` that the rep never visited that week. */
export async function missedLastWeek(repId: string, weekStart: string) {
  const r = await query<{ doctor_id: string }>(`SELECT DISTINCT pi.doctor_id FROM plan_items pi JOIN plans p ON p.id=pi.plan_id
    WHERE p.user_id=$1 AND p.status::text IN ('approved','pending') AND pi.planned_date BETWEEN $2::date - 7 AND $2::date - 1
      AND pi.planned_date < (now() AT TIME ZONE 'Asia/Riyadh')::date
      AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.doctor_id=pi.doctor_id AND v.sales_rep_id=p.user_id AND v.status::text IN ('completed','follow_up')
        AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $2::date - 7 AND $2::date - 1)`, [repId, weekStart]);
  return new Set(r.rows.map(x => x.doctor_id));
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
    const picked = (await candidates(rep.id, weekStart, weekEnd)).slice(0, Math.min(50, free.length * PER_DAY));
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
