import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { taskReminderDateWindow } from "@/lib/plan-reminders";
import { query } from "@/lib/db";

type TaskRow = { id: string; title: string };
type AssigneeRow = { user_id: string };

function hasValidCronAuthorization(request: Request, secret: string) {
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function createReminder(userId: string, taskId: string, kind: "reminder" | "overdue", message: string, date: string) {
  const result = await query(
    `INSERT INTO task_notifications(user_id, task_id, kind, message, notification_date)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, task_id, notification_date, kind)
     WHERE task_id IS NOT NULL AND notification_date IS NOT NULL
     DO NOTHING RETURNING id`,
    [userId, taskId, kind, message, date],
  );
  return result.rowCount ?? 0;
}

// Cron callers must configure CRON_SECRET. Without one, only an authenticated admin may run this manually.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    if (!hasValidCronAuthorization(request, cronSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { today, tomorrow } = taskReminderDateWindow();
  const dueSoon = await query<TaskRow>(
    `SELECT t.id, t.title FROM tasks t
     WHERE t.due_date=$1 AND t.status IN ('pending','in_progress') AND t.archived=false`,
    [tomorrow],
  );
  let created = 0;
  for (const task of dueSoon.rows) {
    const assignees = await query<AssigneeRow>(`SELECT user_id FROM task_assignees WHERE task_id=$1`, [task.id]);
    for (const assignee of assignees.rows) {
      created += await createReminder(assignee.user_id, task.id, "reminder", `تذكير: مهمة تستحق غدا — ${task.title}`, today);
    }
  }

  const overdue = await query<TaskRow>(
    `SELECT t.id, t.title FROM tasks t
     WHERE t.due_date < $1 AND t.status IN ('pending','in_progress') AND t.archived=false`,
    [today],
  );
  for (const task of overdue.rows) {
    const assignees = await query<AssigneeRow>(`SELECT user_id FROM task_assignees WHERE task_id=$1`, [task.id]);
    for (const assignee of assignees.rows) {
      created += await createReminder(assignee.user_id, task.id, "overdue", `متأخرة: ${task.title}`, today);
    }
  }

  return NextResponse.json({ created, dueSoon: dueSoon.rows.length, overdue: overdue.rows.length });
}
