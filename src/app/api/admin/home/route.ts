import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// The unbounded queue is intentional: queueLimit controls the UI preview only.
// All six counts and every queue row share the same statement snapshot.
export const HOME_SQL = `
WITH clock AS (
  SELECT CURRENT_TIMESTAMP AS generated_at,
         (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date AS today
), actions AS (
  SELECT vi.id::text AS id, 'pendingOrders'::text AS kind,
         'طلب منتج: ' || p.name || ' × ' || vi.quantity::text || ' · ' || doc.name AS title, u.name AS owner,
         vi.created_at, '#order-' || vi.id::text AS href,
         u.id::text AS rep_id,
         '/visits?repId=' || u.id::text || '&day=' || (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date::text || '&visit=' || v.id::text || '&order=' || vi.id::text AS detail_href
  FROM visit_items vi
  JOIN visits v ON v.id=vi.visit_id
  JOIN doctors doc ON doc.id=v.doctor_id
  JOIN users u ON u.id=v.sales_rep_id
  JOIN products p ON p.id=vi.product_id
  WHERE vi.kind='order' AND vi.approval_status='pending'
  UNION ALL
  SELECT d.id::text, 'pendingDoctorRequests',
         (CASE WHEN d.kind='create' THEN 'إضافة طبيب: ' ELSE 'تعديل طبيب: ' END) ||
         COALESCE(NULLIF(d.payload->>'name',''), 'طلب طبيب'),
         u.name, d.created_at,
         '/admin/requests?doctorRequest=' || d.id::text || '#doctor-requests',
         u.id::text, NULL::text
  FROM doctor_requests d JOIN users u ON u.id=d.requester_id
  WHERE d.status='pending'
  UNION ALL
  SELECT r.id::text, 'activeServiceRequests', r.title, u.name, r.created_at,
         '/admin/requests?request=' || r.id::text, u.id::text, NULL::text
  FROM service_requests r JOIN users u ON u.id=r.requester_id
  WHERE r.status IN ('pending','in_progress','needs_info','approved','deferred','reopened')
  UNION ALL
  SELECT p.id::text, 'pendingPlans',
         'خطة ' || p.period_start::text || ' — ' || p.period_end::text,
         u.name, p.created_at,
         '/plans?status=pending&planId=' || p.id::text, u.id::text, NULL::text
  FROM plans p JOIN users u ON u.id=p.user_id WHERE p.status='pending'
  UNION ALL
  SELECT t.id::text, 'overdueTasks', t.title, u.name, t.created_at,
         '/tasks?view=full&task=' || t.id::text, u.id::text, NULL::text
  FROM tasks t JOIN users u ON u.id=t.assigned_to CROSS JOIN clock c
  WHERE t.status IN ('pending','in_progress') AND t.archived=false
    AND t.due_date < c.today
  UNION ALL
  SELECT f.id::text, 'overdueFollowups', f.title, u.name, f.created_at,
         '/doctors/' || f.doctor_id::text || '?followup=' || f.id::text || '#followup-' || f.id::text,
         u.id::text, NULL::text
  FROM doctor_followups f JOIN users u ON u.id=f.sales_rep_id CROSS JOIN clock c
  WHERE f.status='open' AND f.due_at < c.today
), daily_visits AS (
  SELECT v.sales_rep_id, count(*)::int AS total,
         max(v.visited_at) FILTER (WHERE v.visited_at <= c.generated_at AND v.status IN ('completed','follow_up')) AS last_visit_at
  FROM visits v CROSS JOIN clock c
  WHERE (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=c.today
  GROUP BY v.sales_rep_id
)
SELECT c.today::text AS today, c.generated_at,
  COALESCE((SELECT json_agg(json_build_object(
    'rep_id',u.id,'rep_name',u.name,'total',COALESCE(d.total,0),
    'last_visit_at',d.last_visit_at) ORDER BY u.name,u.id)
    FROM users u LEFT JOIN daily_visits d ON d.sales_rep_id=u.id
    WHERE u.role='sales_rep' AND u.active=true), '[]'::json) AS visits,
  (SELECT json_build_object(
    'pendingOrders',count(*) FILTER (WHERE kind='pendingOrders'),
    'pendingDoctorRequests',count(*) FILTER (WHERE kind='pendingDoctorRequests'),
    'activeServiceRequests',count(*) FILTER (WHERE kind='activeServiceRequests'),
    'pendingPlans',count(*) FILTER (WHERE kind='pendingPlans'),
    'overdueTasks',count(*) FILTER (WHERE kind='overdueTasks'),
    'overdueFollowups',count(*) FILTER (WHERE kind='overdueFollowups')) FROM actions) AS counts,
  COALESCE((SELECT json_agg(json_build_object(
    'id',id,'kind',kind,'title',title,'owner',owner,
    'created_at',created_at,'href',href,'rep_id',rep_id,'detail_href',detail_href)
    ORDER BY CASE WHEN kind IN ('overdueTasks','overdueFollowups') THEN 0 WHEN kind IN ('pendingOrders','pendingDoctorRequests') THEN 1 ELSE 2 END,created_at DESC,kind,id) FROM actions), '[]'::json) AS queue
FROM clock c
`;

export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
    const result = await query(HOME_SQL, []);
    if (!result.rows[0]) throw new Error('Missing home snapshot');
    return NextResponse.json({ ...result.rows[0], queueLimit: 8 }, { headers });
  } catch {
    return NextResponse.json({ error: 'تعذر تحميل الصفحة الرئيسية. حاول مرة أخرى.' }, { status: 503, headers });
  }
}
