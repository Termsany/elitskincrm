import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { pool } from "@/lib/db";
import { canCancelServiceRequest } from "@/lib/request-cancellation";

type ExistingRequest = { requester_id: string; status: string; title: string };

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "sales_rep") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<ExistingRequest>("SELECT requester_id,status,title FROM service_requests WHERE id=$1 FOR UPDATE", [id]);
    const request = existing.rows[0];
    if (!request || request.requester_id !== user.id) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    }
    if (!canCancelServiceRequest({ id: user.id, role: user.role }, request)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "لا يمكن إلغاء الطلب بعد صدور القرار أو إتمامه" }, { status: 409 });
    }
    const updated = await client.query(
      `UPDATE service_requests SET status='cancelled',cancelled_at=now(),cancelled_by=$1,last_action_at=now(),updated_at=now()
       WHERE id=$2 AND requester_id=$1 AND status IN ('pending','in_progress','needs_info') RETURNING id`,
      [user.id, id],
    );
    if (!updated.rows.length) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "تغيرت حالة الطلب؛ حدّث الصفحة وحاول مجددًا" }, { status: 409 });
    }
    await client.query(
      `INSERT INTO service_request_events(request_id,actor_id,event_type,visibility,message,from_status,to_status)
       VALUES($1,$2,'cancelled','shared',$3,$4,'cancelled')`,
      [id, user.id, `ألغى ${user.name} الطلب`, request.status],
    );
    const admins = await client.query<{ id: string }>("SELECT id FROM users WHERE role='admin' AND active=true");
    for (const admin of admins.rows) {
      await client.query(
        `INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,entity_type,entity_id)
         VALUES($1,NULL,'service_request_cancelled',$2,$3,'service_request',$4)`,
        [admin.id, `${user.name} ألغى الطلب: ${request.title}`, `/admin/requests?request=${id}`, id],
      );
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
