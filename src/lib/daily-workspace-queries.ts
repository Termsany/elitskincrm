export const dailyVisitsSql = `SELECT count(*)::int total FROM visits WHERE sales_rep_id=$1 AND status='completed' AND (visited_at AT TIME ZONE 'Asia/Riyadh')::date=$2::date`;
export const dailyPlansSql = `SELECT pi.id,pi.doctor_id,d.name doctor_name,d.clinic_name,d.city,
 EXISTS(SELECT 1 FROM visits v WHERE v.sales_rep_id=$1 AND v.doctor_id=pi.doctor_id AND v.status='completed' AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=$2::date) done
 FROM plan_items pi JOIN plans p ON p.id=pi.plan_id JOIN doctors d ON d.id=pi.doctor_id
 WHERE p.user_id=$1 AND p.status='approved' AND pi.planned_date=$2::date ORDER BY d.city,d.name,pi.id`;
export const dailyTasksSql = `SELECT t.id,t.title,t.priority,t.due_date,ta.status,d.name doctor_name,
 count(*) OVER()::int total_count,
 count(*) FILTER(WHERE t.due_date<$2::date) OVER()::int overdue_count
 FROM tasks t JOIN task_assignees ta ON ta.task_id=t.id AND ta.user_id=$1 LEFT JOIN doctors d ON d.id=t.doctor_id
 WHERE t.archived=false AND ta.status IN ('pending','in_progress') AND (t.due_date IS NULL OR t.due_date<=$2::date)
 ORDER BY t.due_date ASC NULLS LAST,CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,t.created_at LIMIT 8`;
export const dailyRequestsSql = `SELECT count(*)::int total FROM service_requests WHERE requester_id=$1 AND status IN ('pending','in_progress','needs_info','approved','deferred','reopened')`;
