import { query } from "@/lib/db";
import { pausedSql, riyadhMonthStart } from "@/lib/doctor-pauses";

/** Used when a doctor has no classification frequency. */
export const FALLBACK_GAP_DAYS = 10;
/** THE overdue rule, used everywhere (rep alerts, admin alerts, doctors page, reports):
 *  a doctor is overdue when days since the last visit (completed or follow-up) exceed 30 ÷ visits-per-month of their class (A/B/C).
 *  The rep badge and the doctors page "late" filter both leave out doctors paused this month or already in an upcoming plan. */
export const gapSql = (pf = "pf") => `COALESCE(ceil(30.0 / NULLIF(${pf}.visits_per_month, 0)), ${FALLBACK_GAP_DAYS})::int`;

export type StaleDoctor = {
  id: string; name: string; clinic_name: string; city: string; phone: string; classification: string;
  last_visit: string; visits: number; gap_days: number; days_since: number; overdue_days: number; next_planned: string | null;
};

/**
 * Doctors this rep visits whose last completed visit is older than their category frequency
 * (A/B/C from plan_frequencies, same rule as the "overdue doctors" report). Inactive doctors and
 * doctors the rep paused for this month are excluded. `next_planned` is set when the doctor is
 * already in an upcoming (pending/approved) plan — those are shown but not counted as alerts.
 */
export async function staleDoctors(repId: string, limit = 200): Promise<StaleDoctor[]> {
  const r = await query<StaleDoctor>(`
    WITH l AS (
      SELECT doctor_id, max(visited_at) last_visit, count(*)::int visits
      FROM visits WHERE sales_rep_id=$1 AND status::text IN ('completed','follow_up') GROUP BY doctor_id
    ), x AS (
      SELECT d.id, d.name, COALESCE(d.clinic_name,'') clinic_name, COALESCE(d.city,'') city, COALESCE(d.phone,'') phone,
        COALESCE(d.classification,'') classification, l.last_visit, l.visits,
        ${gapSql()} gap_days,
        ((now() AT TIME ZONE 'Asia/Riyadh')::date - (l.last_visit AT TIME ZONE 'Asia/Riyadh')::date)::int days_since,
        (SELECT to_char(min(pi.planned_date), 'YYYY-MM-DD') FROM plan_items pi JOIN plans pl ON pl.id=pi.plan_id
          WHERE pl.user_id=$1 AND pl.status::text<>'rejected' AND pi.doctor_id=d.id
            AND pi.planned_date >= (now() AT TIME ZONE 'Asia/Riyadh')::date) next_planned
      FROM l JOIN doctors d ON d.id=l.doctor_id
      LEFT JOIN plan_frequencies pf ON pf.classification=d.classification
      WHERE COALESCE(d.status,'active')='active' AND NOT ${pausedSql("$1", "d.id", "$2")}
    )
    SELECT *, (days_since - gap_days) overdue_days FROM x WHERE days_since > gap_days
    ORDER BY (next_planned IS NOT NULL), (days_since - gap_days) DESC, name
    LIMIT $3`, [repId, riyadhMonthStart(), limit]);
  return r.rows;
}

/** Badge count: overdue doctors that are not already in an upcoming plan. */
export const alertCount = (rows: Pick<StaleDoctor, "next_planned">[]) => rows.filter(r => !r.next_planned).length;

/** Admin view of the same rule across all reps: last completed visit by anyone, active doctors only. */
export async function overdueDoctorsAll(limit = 200) {
  const r = await query<{ id: string; name: string; clinic_name: string; city: string; classification: string; last_visit: string; gap_days: number; days_since: number; rep_name: string | null }>(`
    WITH l AS (SELECT v.doctor_id, max(v.visited_at) last_visit, (array_agg(u.name ORDER BY v.visited_at DESC))[1] rep_name
      FROM visits v JOIN users u ON u.id=v.sales_rep_id WHERE v.status::text IN ('completed','follow_up') GROUP BY v.doctor_id),
    x AS (SELECT d.id, d.name, COALESCE(d.clinic_name,'') clinic_name, COALESCE(d.city,'') city, COALESCE(d.classification,'') classification, l.last_visit, l.rep_name,
        ${gapSql()} gap_days, ((now() AT TIME ZONE 'Asia/Riyadh')::date - (l.last_visit AT TIME ZONE 'Asia/Riyadh')::date)::int days_since
      FROM l JOIN doctors d ON d.id=l.doctor_id LEFT JOIN plan_frequencies pf ON pf.classification=d.classification WHERE COALESCE(d.status,'active')='active')
    SELECT * FROM x WHERE days_since > gap_days ORDER BY (days_since - gap_days) DESC, name LIMIT $1`, [limit]);
  const never = await query<{ n: number }>(`SELECT count(*)::int n FROM doctors d WHERE COALESCE(d.status,'active')='active' AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.doctor_id=d.id AND v.status='completed')`);
  return { overdue: r.rows, never: never.rows[0]?.n ?? 0 };
}
