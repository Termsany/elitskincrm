import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { riyadhDateParts } from "@/lib/plan-reminders";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = riyadhDateParts().date;
  const values: unknown[] = [];
  let where = user.role === "admin" ? "p.status IN ('approved','pending','needs_revision')" : "p.status='approved' AND p.period='weekly'";
  if (user.role !== "admin") {
    values.push(user.id);
    where += ` AND p.user_id=$${values.length}`;
  }
  values.push(today);
  const todayParam = `$${values.length}`;
  const plans = await query(`
    SELECT p.*, u.name user_name,
      (SELECT count(*)::int FROM plan_items pi WHERE pi.plan_id=p.id) items_count
    FROM plans p JOIN users u ON u.id=p.user_id
    WHERE ${where}
      AND (p.period_end >= ${todayParam} OR p.created_at >= now() - make_interval(days => 30))
    ORDER BY
      CASE WHEN ${todayParam} BETWEEN p.period_start AND p.period_end THEN 0 ELSE 1 END,
      p.period_start DESC
    LIMIT 12
  `, values);
  const ids = plans.rows.map((p: Record<string, unknown>) => String(p.id));
  let items: Record<string, unknown>[] = [];
  if (ids.length) {
    const result = await query(`
      SELECT pi.id, pi.plan_id, pi.planned_date, pi.doctor_id,
             d.name doctor_name, d.clinic_name, d.city,
             EXISTS(
               SELECT 1 FROM visits v
               JOIN plans p2 ON p2.id=pi.plan_id
               WHERE v.doctor_id=pi.doctor_id AND v.sales_rep_id=p2.user_id
                 AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=pi.planned_date
             ) done
      FROM plan_items pi
      JOIN doctors d ON d.id=pi.doctor_id
      WHERE pi.plan_id = ANY($1::uuid[])
      ORDER BY pi.planned_date, d.name
    `, [ids]);
    items = result.rows;
  }
  const approvedPlanIds = new Set(plans.rows.filter((p: Record<string, unknown>) => String(p.status) === "approved").map((p: Record<string, unknown>) => String(p.id)));
  const todayItems = items.filter((item) => approvedPlanIds.has(String(item.plan_id)) && String(item.planned_date).slice(0, 10) === today);
  const missedResult = user.role === "admin" ? { rows: [] } : await query(`
    SELECT pi.id, pi.plan_id, pi.planned_date, pi.doctor_id,
           d.name doctor_name, d.clinic_name, d.city,
           p.period_start, p.period_end,
           (SELECT max(v.visited_at) FROM visits v WHERE v.doctor_id=pi.doctor_id AND v.sales_rep_id=p.user_id AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=pi.planned_date) last_visit
    FROM plan_items pi
    JOIN plans p ON p.id=pi.plan_id
    JOIN doctors d ON d.id=pi.doctor_id
    WHERE p.user_id=$1 AND p.status='approved' AND p.period='weekly'
      AND p.period_end < $2::date AND pi.planned_date < $2::date
      AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.doctor_id=pi.doctor_id AND v.sales_rep_id=p.user_id AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=pi.planned_date)
    ORDER BY p.period_end DESC, pi.planned_date DESC, d.name
    LIMIT 50
  `, [user.id, today]);
  return NextResponse.json({ plans: plans.rows, items, today, todayItems, missedItems: missedResult.rows });
}
