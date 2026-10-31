import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { pool } from "@/lib/db";
import { canTransitionOrder, type OrderApprovalStatus } from "@/lib/order-approval";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "معرّف غير صحيح" }, { status: 400 });
  const body = await req.json().catch(() => null) as { status?: unknown; note?: unknown } | null;
  if (!body || typeof body !== "object" || !["approved", "rejected"].includes(String(body.status))) return NextResponse.json({ error: "الحالة غير صحيحة" }, { status: 400 });
  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") return NextResponse.json({ error: "ملاحظة غير صحيحة" }, { status: 400 });
  const status = body.status as OrderApprovalStatus; const note = typeof body.note === "string" ? body.note.slice(0, 1000) : "";

  // Lock the order row so two admins can't record contradictory decisions; decision + notification commit together.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT vi.approval_status, v.sales_rep_id, p.name product_name FROM visit_items vi JOIN visits v ON v.id=vi.visit_id JOIN products p ON p.id=vi.product_id WHERE vi.id=$1 AND vi.kind='order' FOR UPDATE OF vi`, [id]);
    const row = current.rows[0] as { approval_status: OrderApprovalStatus; sales_rep_id: string; product_name: string } | undefined;
    if (!row) { await client.query("ROLLBACK"); return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 }); }
    if (!canTransitionOrder(row.approval_status, status, user.role)) { await client.query("ROLLBACK"); return NextResponse.json({ error: "لا يمكن تغيير حالة هذا الطلب" }, { status: 409 }); }
    await client.query(`UPDATE visit_items SET approval_status=$1, approval_note=$2, approved_by=$3, approved_at=now() WHERE id=$4`, [status, note, user.id, id]);
    const message = status === "approved" ? `تمت الموافقة على طلب ${row.product_name}` : `تم رفض طلب ${row.product_name}${note ? `: ${note}` : ""}`;
    await client.query(`INSERT INTO task_notifications(user_id, task_id, order_item_id, kind, message) VALUES($1,NULL,$2,$3,$4)`, [row.sales_rep_id, id, `order_${status}`, message]);
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("order decision failed", e);
    return NextResponse.json({ error: "تعذر حفظ القرار" }, { status: 500 });
  } finally { client.release(); }
}
