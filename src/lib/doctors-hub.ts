import { query } from "@/lib/db";

export type HubDoctor = {
  id: string; name: string; clinic_name: string | null; clinic_id: string | null; city: string | null; specialty: string | null; classification: string | null;
  phone: string | null; email: string | null; status: string | null; gap_days: number | null;
  visits: number; completed: number; total_visits: number; last_visit: string | null; last_rep: string | null; last_note: string | null;
  days_since: number | null; next_follow_up: string | null; samples: number; orders: number; presented: number; interested: number; not_interested: number;
  reps: string | null; in_plan_next: string | null;
};

/** One row per doctor with activity in the period. Reps see their own activity; admins see the team (or one rep). */
export async function hubDoctors(u: { id: string; role: string }, days: number, repId: string | null): Promise<HubDoctor[]> {
  const scope = u.role === "admin" ? repId : u.id;
  const vals: unknown[] = [days];
  let vRep = ""; if (scope) { vals.push(scope); vRep = ` AND v.sales_rep_id=$${vals.length}`; }
  const planRep = scope ? `AND p.user_id=$${vals.length}` : "";
  const r = await query<HubDoctor>(`
    WITH v AS (SELECT v.* FROM visits v WHERE true ${vRep}),
    agg AS (SELECT v.doctor_id,
        count(*) FILTER (WHERE v.visited_at > now() - make_interval(days => $1::int))::int visits,
        count(*) FILTER (WHERE v.visited_at > now() - make_interval(days => $1::int) AND v.status='completed')::int completed,
        count(*)::int total_visits, max(v.visited_at) last_visit,
        string_agg(DISTINCT u.name, '، ') FILTER (WHERE v.visited_at > now() - make_interval(days => $1::int)) reps
      FROM v JOIN users u ON u.id=v.sales_rep_id GROUP BY v.doctor_id),
    lastv AS (SELECT DISTINCT ON (v.doctor_id) v.doctor_id, u.name last_rep, NULLIF(btrim(v.notes),'') last_note FROM v JOIN users u ON u.id=v.sales_rep_id ORDER BY v.doctor_id, v.visited_at DESC),
    items AS (SELECT v.doctor_id, COALESCE(sum(vi.quantity) FILTER (WHERE vi.kind='sample'),0)::int samples, COALESCE(sum(vi.quantity) FILTER (WHERE vi.kind='order'),0)::int orders
      FROM v JOIN visit_items vi ON vi.visit_id=v.id WHERE v.visited_at > now() - make_interval(days => $1::int) GROUP BY v.doctor_id),
    pres AS (SELECT v.doctor_id, count(*)::int presented, count(*) FILTER (WHERE pp.reaction='interested')::int interested, count(*) FILTER (WHERE pp.reaction='not_interested')::int not_interested
      FROM v JOIN visit_presented_products pp ON pp.visit_id=v.id WHERE v.visited_at > now() - make_interval(days => $1::int) GROUP BY v.doctor_id),
    fu AS (SELECT doctor_id, min(due)::text next_follow_up FROM (
        SELECT v.doctor_id, v.follow_up_at due FROM v WHERE v.follow_up_at >= (now() AT TIME ZONE 'Asia/Riyadh')::date - 30
          AND NOT EXISTS (SELECT 1 FROM visits v2 WHERE v2.doctor_id=v.doctor_id AND v2.sales_rep_id=v.sales_rep_id AND v2.visited_at>v.visited_at AND v2.status='completed')
        UNION ALL SELECT f.doctor_id, f.due_at FROM doctor_followups f WHERE f.completed_at IS NULL AND COALESCE(f.status,'') NOT IN ('done','completed','closed') ${scope ? `AND f.sales_rep_id=$${vals.length}` : ""}
      ) x GROUP BY doctor_id),
    nextplan AS (SELECT pi.doctor_id, min(pi.planned_date)::text in_plan_next FROM plan_items pi JOIN plans p ON p.id=pi.plan_id
      WHERE p.status::text<>'rejected' AND pi.planned_date >= (now() AT TIME ZONE 'Asia/Riyadh')::date ${planRep} GROUP BY pi.doctor_id)
    SELECT d.id, d.name, d.clinic_name, d.clinic_id, d.city, d.specialty, d.classification, d.phone, d.email, d.status,
      CASE WHEN pf.visits_per_month > 0 THEN ceil(30.0/pf.visits_per_month)::int END gap_days,
      COALESCE(a.visits,0) visits, COALESCE(a.completed,0) completed, COALESCE(a.total_visits,0) total_visits, a.last_visit, l.last_rep, l.last_note,
      CASE WHEN a.last_visit IS NULL THEN NULL ELSE ((now() AT TIME ZONE 'Asia/Riyadh')::date - (a.last_visit AT TIME ZONE 'Asia/Riyadh')::date) END days_since,
      fu.next_follow_up, COALESCE(i.samples,0) samples, COALESCE(i.orders,0) orders, COALESCE(pr.presented,0) presented, COALESCE(pr.interested,0) interested,
      COALESCE(pr.not_interested,0) not_interested, a.reps, np.in_plan_next
    FROM doctors d LEFT JOIN plan_frequencies pf ON pf.classification=d.classification
      LEFT JOIN agg a ON a.doctor_id=d.id LEFT JOIN lastv l ON l.doctor_id=d.id LEFT JOIN items i ON i.doctor_id=d.id
      LEFT JOIN pres pr ON pr.doctor_id=d.id LEFT JOIN fu ON fu.doctor_id=d.id LEFT JOIN nextplan np ON np.doctor_id=d.id
    WHERE COALESCE(d.status,'active')='active'
    ORDER BY d.name`, vals);
  return r.rows;
}
