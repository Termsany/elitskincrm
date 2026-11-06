import { query } from "@/lib/db";
import { pausedSql, riyadhMonthStart } from "@/lib/doctor-pauses";

/** Used when a doctor has no classification frequency. */
export const FALLBACK_GAP_DAYS = 10;

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
      FROM visits WHERE sales_rep_id=$1 AND status='completed' GROUP BY doctor_id
    ), x AS (
      SELECT d.id, d.name, COALESCE(d.clinic_name,'') clinic_name, COALESCE(d.city,'') city, COALESCE(d.phone,'') phone,
        COALESCE(d.classification,'') classification, l.last_visit, l.visits,
        COALESCE(ceil(30.0 / NULLIF(pf.visits_per_month, 0)), $2)::int gap_days,
        ((now() AT TIME ZONE 'Asia/Riyadh')::date - (l.last_visit AT TIME ZONE 'Asia/Riyadh')::date)::int days_since,
        (SELECT to_char(min(pi.planned_date), 'YYYY-MM-DD') FROM plan_items pi JOIN plans pl ON pl.id=pi.plan_id
          WHERE pl.user_id=$1 AND pl.status IN ('pending','approved') AND pi.doctor_id=d.id
            AND pi.planned_date >= (now() AT TIME ZONE 'Asia/Riyadh')::date) next_planned
      FROM l JOIN doctors d ON d.id=l.doctor_id
      LEFT JOIN plan_frequencies pf ON pf.classification=d.classification
      WHERE COALESCE(d.status,'active')='active' AND NOT ${pausedSql("$1", "d.id", "$3")}
    )
    SELECT *, (days_since - gap_days) overdue_days FROM x WHERE days_since > gap_days
    ORDER BY (next_planned IS NOT NULL), (days_since - gap_days) DESC, name
    LIMIT $4`, [repId, FALLBACK_GAP_DAYS, riyadhMonthStart(), limit]);
  return r.rows;
}

/** Badge count: overdue doctors that are not already in an upcoming plan. */
export const alertCount = (rows: Pick<StaleDoctor, "next_planned">[]) => rows.filter(r => !r.next_planned).length;
