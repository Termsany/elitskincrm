import type { Actor } from './permissions';

type ProfileQuery = { text: string; values: unknown[] };

// Doctor master data is shared by the existing doctors page/API. Activity is not.
// Keep role restrictions in SQL, before aggregates and LIMIT, never in client filtering.
export function doctorProfileQueries(actor: Actor, doctorId: string): Record<'doctor' | 'visits' | 'summary' | 'plans' | 'tasks', ProfileQuery> {
  const admin = actor.role === 'admin';
  const values: unknown[] = admin ? [doctorId] : [doctorId, actor.id];
  const visitWhere = `v.doctor_id = $1${admin ? '' : ' AND v.sales_rep_id = $2'}`;
  return {
    doctor: {
      text: 'SELECT id, name, clinic_name, city, specialty, classification, phone, email, status FROM doctors WHERE id = $1',
      values: [doctorId],
    },
    summary: {
      text: `SELECT count(*)::int AS total_visits,
        count(*) FILTER (WHERE v.status = 'completed')::int AS completed_visits,
        max(v.visited_at) FILTER (WHERE v.visited_at <= now() AND v.status IN ('completed','follow_up')) AS last_visit_at
        FROM visits v WHERE ${visitWhere}`,
      values,
    },
    visits: {
      text: `SELECT v.id, v.visited_at, v.notes, v.status, v.follow_up_at::text, v.follow_up_note,
        ${admin ? 'u.name' : 'NULL::text'} AS rep_name,
        COALESCE((SELECT json_agg(json_build_object('id',vi.id,'product_name',pr.name,'kind',vi.kind,'quantity',vi.quantity,'sample_purpose',vi.sample_purpose,'approval_status',vi.approval_status) ORDER BY vi.kind,pr.name)
          FROM visit_items vi JOIN products pr ON pr.id=vi.product_id WHERE vi.visit_id=v.id),'[]'::json) AS items,
        COALESCE((SELECT json_agg(json_build_object('product_id',vp.product_id,'product_name',pp.name,'reaction',vp.reaction) ORDER BY pp.name)
          FROM visit_presented_products vp JOIN products pp ON pp.id=vp.product_id WHERE vp.visit_id=v.id),'[]'::json) AS presented,
        COALESCE((SELECT json_agg(json_build_object('id',va.id,'file_name',va.file_name,'mime_type',va.mime_type,'size_bytes',va.size_bytes,'created_at',va.created_at::text) ORDER BY va.created_at DESC)
          FROM visit_attachments va WHERE va.visit_id=v.id),'[]'::json) AS attachments
        FROM visits v ${admin ? 'JOIN users u ON u.id=v.sales_rep_id' : ''}
        WHERE ${visitWhere} ORDER BY v.visited_at DESC, v.id DESC LIMIT 20`,
      values,
    },
    plans: {
      text: `SELECT pi.id, pi.plan_id, pi.planned_date::text, pi.note, pi.priority,
        pr.name AS product_name, ${admin ? 'u.name' : 'NULL::text'} AS rep_name
        FROM plan_items pi JOIN plans p ON p.id=pi.plan_id
        LEFT JOIN products pr ON pr.id=pi.product_id ${admin ? 'JOIN users u ON u.id=p.user_id' : ''}
        WHERE pi.doctor_id = $1 AND p.status='approved'
          AND pi.planned_date >= (now() AT TIME ZONE 'Asia/Riyadh')::date
          ${admin ? '' : 'AND p.user_id = $2'}
        ORDER BY pi.planned_date, pi.sort_order, pi.id LIMIT 20`,
      values,
    },
    tasks: {
      // A shared task must not expose peer assignees, their status, comments or progress.
      text: `SELECT t.id, t.title, t.priority, t.due_date::text,
        ${admin ? 't.status::text' : 'ta.status::text'} AS status
        FROM tasks t ${admin ? '' : 'JOIN task_assignees ta ON ta.task_id=t.id AND ta.user_id = $2'}
        WHERE t.doctor_id = $1 AND t.archived=false
        ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC, t.id LIMIT 20`,
      values,
    },
  };
}
