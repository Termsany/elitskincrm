import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { INFO_KINDS, levelOf } from "@/lib/notification-levels";

/** Marks as read whatever no longer needs the reader: the plan / expense / request / signature / order was already decided, or an FYI is two weeks old. */
async function autoResolve(userId: string) {
  await query(`UPDATE task_notifications n SET is_read=true, read_at=COALESCE(read_at, now()), resolved_at=COALESCE(resolved_at, now())
    WHERE n.user_id=$1 AND n.is_read=false AND (
      (n.kind='plan_pending' AND n.plan_id IS NOT NULL AND EXISTS (SELECT 1 FROM plans p WHERE p.id=n.plan_id AND p.status::text<>'pending'))
      OR (n.kind='expense_pending' AND EXISTS (SELECT 1 FROM expenses e WHERE e.id::text=n.entity_id AND e.status<>'pending'))
      OR (n.entity_type='service_request' AND n.kind IN ('service_request_created','service_request_comment') AND EXISTS (SELECT 1 FROM service_requests r WHERE r.id::text=n.entity_id AND r.status NOT IN ('pending','reopened','in_progress','needs_info','deferred')))
      OR (n.entity_type='sign_request' AND n.kind='sign_request' AND EXISTS (SELECT 1 FROM sign_requests s WHERE s.id::text=n.entity_id AND s.status<>'pending'))
      OR (n.order_item_id IS NOT NULL AND EXISTS (SELECT 1 FROM visit_items vi WHERE vi.id=n.order_item_id AND vi.approval_status::text<>'pending'))
      OR (n.kind = ANY($2::text[]) AND n.created_at < now() - interval '14 days')
      OR (n.kind IN ('morning_summary','smart_daily','finance_brief') AND n.created_at < now() - interval '20 hours')
      OR (n.kind='plan_draft' AND n.plan_id IS NOT NULL AND EXISTS (SELECT 1 FROM plans p WHERE p.id=n.plan_id AND p.status::text<>'draft'))
      OR (n.kind='password_reset_request' AND NOT EXISTS (SELECT 1 FROM password_reset_requests r WHERE r.handled_at IS NULL))
      OR (n.task_id IS NOT NULL AND n.kind IN ('assigned','reminder','overdue','update') AND EXISTS (SELECT 1 FROM tasks t WHERE t.id=n.task_id AND (t.archived OR t.status::text NOT IN ('pending','in_progress'))))
    )`, [userId, INFO_KINDS]).catch(e => console.error("notifications auto-resolve", e));
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await autoResolve(user.id);
  const r = await query(`SELECT n.*, t.title task_title,
    CASE WHEN n.plan_id IS NOT NULL THEN 'الخطة الأسبوعية' ELSE NULL END plan_title
    FROM task_notifications n
    LEFT JOIN tasks t ON t.id=n.task_id
    WHERE n.user_id=$1 AND n.is_read=false AND (n.snoozed_until IS NULL OR n.snoozed_until <= now())
    ORDER BY n.created_at DESC LIMIT 100`, [user.id]);
  const rows = r.rows.map(n => ({ ...n, level: levelOf(String(n.kind)) }));
  const counts = (await query<{ kind: string; n: number }>("SELECT kind, count(*)::int n FROM task_notifications WHERE user_id=$1 AND is_read=false AND (snoozed_until IS NULL OR snoozed_until <= now()) GROUP BY kind", [user.id])).rows;
  const important = counts.filter(c => levelOf(c.kind) === "important").reduce((s, c) => s + c.n, 0);
  const info = counts.reduce((s, c) => s + c.n, 0) - important;
  // Badge = what is new since the bell was last opened (unread important notifications created after that).
  const seen = (await query<{ at: string | null; live: Record<string, number> }>("SELECT bell_seen_at at, bell_seen_live live FROM users WHERE id=$1", [user.id]).catch(() => ({ rows: [] }))).rows[0];
  const seenAt = seen?.at ? Date.parse(seen.at) : 0;
  const fresh = (rows as Array<{ is_read: boolean; level: string; created_at: string }>).filter(n => !n.is_read && n.level === "important" && Date.parse(String(n.created_at)) > seenAt).length;
  // `unread` stays the number other screens read: important only
  return NextResponse.json({ notifications: rows, unread: important, important, info, fresh, seen_live: seen?.live || {} });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (body?.seen) {
    // The bell was opened: everything in it now counts as seen (not read) — the badge goes back to zero.
    const live: Record<string, number> = {};
    if (body.live && typeof body.live === "object") for (const [k, v] of Object.entries(body.live as Record<string, unknown>).slice(0, 30)) if (/^[a-zA-Z]{1,40}$/.test(k)) live[k] = Math.max(0, Math.min(100000, Number(v) || 0));
    await query("UPDATE users SET bell_seen_at=now(), bell_seen_live=$2 WHERE id=$1", [user.id, JSON.stringify(live)]);
    return NextResponse.json({ ok: true });
  }
  if (body?.all) {
    const level = body.level === "info" || body.level === "important" ? body.level : null;
    if (level) await query(`UPDATE task_notifications SET is_read=true, read_at=COALESCE(read_at, now()) WHERE user_id=$1 AND is_read=false AND (kind = ANY($2::text[])) = $3`, [user.id, INFO_KINDS, level === "info"]);
    else await query(`UPDATE task_notifications SET is_read=true, read_at=COALESCE(read_at, now()) WHERE user_id=$1`, [user.id]);
  } else if (body?.snooze) {
    // Hide until tomorrow 8:00 Riyadh (or a given number of days), then it comes back unread.
    const id = String(body.snooze); const days = Math.min(Math.max(Number(body.days) || 1, 1), 7);
    if (!uuid.test(id)) return NextResponse.json({ error: "Invalid notification id" }, { status: 400 });
    const r = await query(`UPDATE task_notifications SET status='snoozed', snoozed_until=(((now() AT TIME ZONE 'Asia/Riyadh')::date + $3::int + time '08:00') AT TIME ZONE 'Asia/Riyadh')
      WHERE id=$1 AND user_id=$2 RETURNING snoozed_until`, [id, user.id, days]);
    if (!r.rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, until: r.rows[0].snoozed_until });
  } else if (Array.isArray(body?.ids)) {
    const ids = (body.ids as unknown[]).map(String).filter(x => uuid.test(x)).slice(0, 200);
    if (ids.length) await query(`UPDATE task_notifications SET is_read=true, read_at=COALESCE(read_at, now()) WHERE user_id=$1 AND id = ANY($2::uuid[])`, [user.id, ids]);
  } else if (body?.id) {
    const id = String(body.id);
    if (!uuid.test(id)) return NextResponse.json({ error: "Invalid notification id" }, { status: 400 });
    const updated = await query(`UPDATE task_notifications SET is_read=true, read_at=COALESCE(read_at, now()) WHERE id=$1 AND user_id=$2 RETURNING id`, [id, user.id]);
    if (!updated.rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
