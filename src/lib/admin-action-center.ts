export const ACTION_CARDS = [
  { key: 'pendingPlans', label: 'خطط بانتظار الموافقة', href: '/plans?status=pending', detail: 'الحالة: بانتظار الموافقة فقط', action: 'مراجعة الخطط' },
  { key: 'pendingDoctorRequests', label: 'طلبات الأطباء المعلقة', href: '/admin/requests', detail: 'طلبات الإضافة والتعديل بانتظار الموافقة', action: 'مراجعة طلبات الأطباء' },
  { key: 'activeServiceRequests', label: 'طلبات الخدمة النشطة', href: '/admin/requests', detail: 'قيد الانتظار أو قيد التنفيذ', action: 'متابعة الطلبات' },
  { key: 'overdueTasks', label: 'مهام متأخرة', href: '/tasks', detail: 'غير مؤرشفة، قيد الانتظار أو التنفيذ، استحقاقها قبل اليوم', action: 'متابعة المهام' },
  { key: 'overdueFollowups', label: 'متابعات متأخرة', href: '/doctors', detail: 'متابعات الأطباء المفتوحة التي تجاوزت موعدها', action: 'فتح الأطباء' },
] as const;
export type ActionKind = typeof ACTION_CARDS[number]['key'];
export type ActionCenterData = {
  counts: Record<ActionKind, number>;
  queue: {id:string; kind:ActionKind; title:string; owner:string|null; created_at:string}[];
  generated_at:string;
  riyadh_date:string;
  queueLimit:number;
};
export const ACTION_CENTER_VALUES = [
  'pending',
  ['pending', 'in_progress', 'needs_info', 'approved', 'deferred', 'reopened'],
  ['pending', 'in_progress'],
  'Asia/Riyadh',
  6,
] as const;
// One statement gives counts + bounded queue a consistent PostgreSQL snapshot.
// No creation-date filter: these are all-time outstanding totals, not period activity.
export const ACTION_CENTER_SQL = `
WITH actions AS (
  SELECT p.id::text AS id, 'pendingPlans'::text AS kind,
    'خطة ' || p.period_start::text || ' — ' || p.period_end::text AS title,
    (SELECT u.name FROM users u WHERE u.id=p.user_id) AS owner, p.created_at
  FROM plans p WHERE p.status::text=$1
  UNION ALL
  SELECT d.id::text, 'pendingDoctorRequests',
    CASE WHEN d.kind='create' THEN 'إضافة طبيب: ' ELSE 'تعديل طبيب: ' END || COALESCE(NULLIF(d.payload->>'name',''),'طلب طبيب'),
    (SELECT u.name FROM users u WHERE u.id=d.requester_id), d.created_at
  FROM doctor_requests d WHERE d.status=$1
  UNION ALL
  SELECT r.id::text, 'activeServiceRequests', r.title,
    (SELECT u.name FROM users u WHERE u.id=r.requester_id), r.created_at
  FROM service_requests r WHERE r.status=ANY($2::text[])
  UNION ALL
  SELECT t.id::text, 'overdueTasks', t.title, NULL::text, t.created_at
  FROM tasks t WHERE t.status::text=ANY($3::text[]) AND t.archived=false
    AND t.due_date < (CURRENT_TIMESTAMP AT TIME ZONE $4)::date
), recent AS (
  SELECT * FROM actions ORDER BY created_at DESC,kind,id LIMIT $5
)
SELECT json_build_object(
  'pendingPlans',(SELECT count(*)::int FROM actions WHERE kind='pendingPlans'),
  'pendingDoctorRequests',(SELECT count(*)::int FROM actions WHERE kind='pendingDoctorRequests'),
  'activeServiceRequests',(SELECT count(*)::int FROM actions WHERE kind='activeServiceRequests'),
  'overdueTasks',(SELECT count(*)::int FROM actions WHERE kind='overdueTasks'),
  'overdueFollowups',(SELECT count(*)::int FROM actions WHERE kind='overdueFollowups')
) AS counts,
COALESCE((SELECT json_agg(recent ORDER BY created_at DESC,kind,id) FROM recent),'[]'::json) AS queue,
CURRENT_TIMESTAMP AS generated_at,
(CURRENT_TIMESTAMP AT TIME ZONE $4)::date::text AS riyadh_date
`;
