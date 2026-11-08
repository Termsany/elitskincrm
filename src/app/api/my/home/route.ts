import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { riyadhToday } from "@/lib/riyadh-day";
import { rankedDoctors } from "@/lib/doctor-suggest";
import { salesPace } from "@/lib/smart";
import { nextWeekStart, workDays } from "@/lib/auto-plan";
import { addDays } from "@/lib/fmt";


/** Everything the rep home needs in one call: today's plan, follow-ups, late doctors, month target + 6-month trend, open tasks, next week's plan. */
export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (u.role !== "sales_rep") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const today = riyadhToday(), m6 = `${addDays(`${today.slice(0, 7)}-01`, -155).slice(0, 7)}-01`, ws = nextWeekStart(today), we = workDays(ws)[4];
  const [plan, fu, stale, pace, trend, byProduct, tasks, next, taskList, recent] = await Promise.all([
    query<{ id: string; doctor_id: string; doctor_name: string; clinic_name: string | null; city: string | null; phone: string | null; classification: string | null; note: string | null; done_at: string | null; sort_order: number | null }>(`
      SELECT pi.id, pi.doctor_id, d.name doctor_name, d.clinic_name, d.city, NULLIF(d.phone,'') phone, upper(d.classification) classification, pi.note, pi.sort_order,
        (SELECT to_char(min(v.visited_at) AT TIME ZONE 'Asia/Riyadh', 'HH24:MI') FROM visits v WHERE v.sales_rep_id=$1 AND v.doctor_id=pi.doctor_id AND v.status::text='completed'
          AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=$2::date) done_at
      FROM plan_items pi JOIN plans p ON p.id=pi.plan_id JOIN doctors d ON d.id=pi.doctor_id
      WHERE p.user_id=$1 AND p.status='approved' AND pi.planned_date=$2::date ORDER BY COALESCE(d.city,''), pi.sort_order NULLS LAST, d.name`, [u.id, today]),
    query<{ n: number }>(`SELECT count(*)::int n FROM (
        SELECT v.doctor_id FROM visits v WHERE v.sales_rep_id=$1 AND v.follow_up_at IS NOT NULL AND v.follow_up_at::date <= $2::date AND v.status::text<>'cancelled'
          AND NOT EXISTS (SELECT 1 FROM visits v2 WHERE v2.doctor_id=v.doctor_id AND v2.sales_rep_id=v.sales_rep_id AND v2.visited_at > v.visited_at AND v2.status::text='completed')
        UNION SELECT f.doctor_id FROM doctor_followups f WHERE f.sales_rep_id=$1 AND f.completed_at IS NULL AND f.due_at::date <= $2::date) x`, [u.id, today]).catch(() => ({ rows: [{ n: 0 }] })),
    rankedDoctors(u.id, today).catch(() => []),
    salesPace(today, u.id).catch(() => []),
    query<{ month: string; v: number }>(`SELECT to_char(date_trunc('month', invoice_date), 'YYYY-MM') AS month, COALESCE(sum(value),0)::float8 v FROM daftra_sales_v
      WHERE rep_id=$1 AND invoice_date >= $2::date AND invoice_date <= $3::date GROUP BY 1 ORDER BY 1`, [u.id, m6, today]),
    query<{ name: string; v: number }>(`SELECT COALESCE(p.name, 'أخرى') AS name, COALESCE(sum(s.value),0)::float8 v FROM daftra_sales_v s LEFT JOIN products p ON p.id=s.product_id
      WHERE s.rep_id=$1 AND s.invoice_date >= $2::date AND s.invoice_date <= $3::date GROUP BY 1 HAVING sum(s.value) > 0 ORDER BY 2 DESC LIMIT 4`, [u.id, `${today.slice(0, 7)}-01`, today]),
    query<{ n: number; late: number }>(`SELECT count(*)::int n, count(*) FILTER (WHERE t.due_date < $2::date)::int late FROM tasks t JOIN task_assignees ta ON ta.task_id=t.id
      WHERE ta.user_id=$1 AND t.archived=false AND ta.status::text IN ('pending','in_progress')`, [u.id, today]).catch(() => ({ rows: [{ n: 0, late: 0 }] })),
    query<{ id: string; status: string; visits: number }>(`SELECT p.id, p.status::text status, (SELECT count(*)::int FROM plan_items pi WHERE pi.plan_id=p.id) visits FROM plans p
      WHERE p.user_id=$1 AND p.status::text<>'rejected' AND p.period_start<=$3::date AND p.period_end>=$2::date ORDER BY p.created_at DESC LIMIT 1`, [u.id, ws, we]),
    query<{ id: string; title: string; due: string | null; late: boolean }>(`SELECT t.id::text id, t.title, t.due_date::text due, (t.due_date IS NOT NULL AND t.due_date < $2::date) late FROM tasks t JOIN task_assignees ta ON ta.task_id=t.id
      WHERE ta.user_id=$1 AND t.archived=false AND ta.status::text IN ('pending','in_progress') ORDER BY t.due_date NULLS LAST, t.created_at LIMIT 4`, [u.id, today]).catch(() => ({ rows: [] })),
    query<{ id: string; doctor_id: string; doctor: string; clinic: string; at: string; status: string }>(`SELECT v.id::text id, d.id::text doctor_id, d.name doctor, COALESCE(d.clinic_name,'') clinic, v.visited_at::text at, v.status::text status
      FROM visits v JOIN doctors d ON d.id=v.doctor_id WHERE v.sales_rep_id=$1 AND v.status::text IN ('completed','follow_up') ORDER BY v.visited_at DESC LIMIT 4`, [u.id]).catch(() => ({ rows: [] })),
  ]);
  // brief for the next planned visit: how long since the last one, what was noted, and why it matters now
  const nextItem = plan.rows.find(p => !p.done_at);
  const lastV = nextItem ? (await query<{ days: number; note: string | null }>(`SELECT ($3::date - (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date)::int days, NULLIF(left(btrim(regexp_replace(COALESCE(v.notes,''), '\\s+', ' ', 'g')), 110),'') note
      FROM visits v WHERE v.sales_rep_id=$1 AND v.doctor_id=$2 AND v.status::text IN ('completed','follow_up') ORDER BY v.visited_at DESC LIMIT 1`, [u.id, nextItem.doctor_id, today]).catch(() => ({ rows: [] }))).rows[0] : undefined;
  const nextBrief = nextItem ? { doctor_id: nextItem.doctor_id, days: lastV?.days ?? null, note: lastV?.note ?? null, why: stale.find(s => s.id === nextItem.doctor_id)?.prio.reason || null } : null;
  const inPlan = new Set(plan.rows.map(p => p.doctor_id));
  const late = stale.filter(s => !s.paused && s.prio.tags.includes("late") && !s.in_plan_next && !inPlan.has(s.id))
    .map(s => ({ ...s, classification: (s.classification || "").toUpperCase(), overdue_days: (s.days_since ?? 0) - (s.gap_days ?? 0) }));
  // last 6 months, zero-filled
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 6 + i, 1)); return d.toISOString().slice(0, 7); });
  const tv = new Map(trend.rows.map(r => [r.month, r.v]));
  return NextResponse.json({
    today, name: (u.name || "").split(" ")[0],
    plan: plan.rows.map(p => ({ ...p, done: !!p.done_at })),
    followups: fu.rows[0]?.n || 0,
    lateA: late.filter(l => l.classification === "A").length,
    late: late.slice(0, 4).map(l => ({ id: l.id, name: l.name, clinic: l.clinic_name, city: l.city, classification: l.classification, overdue_days: l.overdue_days })), lateCount: late.length,
    pace: pace[0] || null,
    trend: months.map(m => ({ month: m, value: Math.round(tv.get(m) || 0) })),
    byProduct: byProduct.rows.map(r => ({ name: r.name, value: Math.round(r.v) })),
    tasks: { open: tasks.rows[0]?.n || 0, late: tasks.rows[0]?.late || 0 },
    nextWeek: { start: ws, plan: next.rows[0] || null },
    nextBrief, taskList: taskList.rows, recent: recent.rows,
  });
}
