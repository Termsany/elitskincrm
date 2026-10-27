import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import {
  OPEN_REQUEST_STATUSES, requestToWorkItem, sortWorkItems, summarizeWorkItems, taskToWorkItem,
  type RequestRow, type TaskRow,
} from "@/lib/work-items";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = user.role === "admin";
  const now = new Date();

  const requestSql = isAdmin
    ? `SELECT r.id,r.title,r.status,r.priority,r.due_at,r.requester_id,r.assigned_to,r.updated_at,
         u.name requester_name,a.name assigned_name
       FROM service_requests r JOIN users u ON u.id=r.requester_id LEFT JOIN users a ON a.id=r.assigned_to
       WHERE r.status = ANY($1::text[])`
    : `SELECT r.id,r.title,r.status,r.priority,r.due_at,r.requester_id,r.assigned_to,r.updated_at,
         u.name requester_name,a.name assigned_name
       FROM service_requests r JOIN users u ON u.id=r.requester_id LEFT JOIN users a ON a.id=r.assigned_to
       WHERE r.status = ANY($1::text[]) AND r.requester_id=$2`;
  const taskSql = isAdmin
    ? `SELECT t.id,t.title,t.status::text status,t.priority::text priority,t.due_date::text due_date,t.updated_at,
         c.name creator_name,
         (SELECT string_agg(u.name, '، ' ORDER BY u.name) FROM task_assignees ta JOIN users u ON u.id=ta.user_id WHERE ta.task_id=t.id) assignee_names
       FROM tasks t JOIN users c ON c.id=t.created_by
       WHERE t.archived=false AND t.status IN ('pending','in_progress')`
    : `SELECT t.id,t.title,ta.status::text status,t.priority::text priority,t.due_date::text due_date,t.updated_at,
         c.name creator_name, NULL::text assignee_names
       FROM tasks t JOIN users c ON c.id=t.created_by
       JOIN task_assignees ta ON ta.task_id=t.id AND ta.user_id=$1
       WHERE t.archived=false AND ta.status IN ('pending','in_progress')`;

  const [requests, tasks, unread] = await Promise.all([
    query<RequestRow>(requestSql, isAdmin ? [OPEN_REQUEST_STATUSES] : [OPEN_REQUEST_STATUSES, user.id]),
    query<TaskRow>(taskSql, isAdmin ? [] : [user.id]),
    query<{ entity_type: string | null; entity_id: string | null; task_id: string | null; n: number }>(
      `SELECT entity_type, entity_id, task_id::text task_id, count(*)::int n FROM task_notifications
       WHERE user_id=$1 AND is_read=false GROUP BY entity_type, entity_id, task_id`, [user.id]),
  ]);

  const requestUnread = new Map<string, number>();
  const taskUnread = new Map<string, number>();
  for (const row of unread.rows) {
    if (row.entity_type === "service_request" && row.entity_id) requestUnread.set(row.entity_id, (requestUnread.get(row.entity_id) || 0) + row.n);
    else if (row.task_id) taskUnread.set(row.task_id, (taskUnread.get(row.task_id) || 0) + row.n);
  }

  const items = sortWorkItems([
    ...requests.rows.map((row) => requestToWorkItem(row, user.role, user.id, requestUnread.get(row.id) || 0, now)),
    ...tasks.rows.map((row) => taskToWorkItem(row, user.role, taskUnread.get(row.id) || 0, now)),
  ]);
  return NextResponse.json({ items, summary: summarizeWorkItems(items, now), generated_at: now.toISOString() });
}
