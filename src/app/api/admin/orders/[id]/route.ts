import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { canTransitionOrder, type OrderApprovalStatus } from "@/lib/order-approval";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => null) as { status?: OrderApprovalStatus; note?: string } | null;
  if (!body?.status || !["approved","rejected"].includes(body.status)) return NextResponse.json({ error: "الحالة غير صحيحة" }, { status: 400 });
  const current = await query(`SELECT vi.approval_status, v.sales_rep_id, p.name product_name FROM visit_items vi JOIN visits v ON v.id=vi.visit_id JOIN products p ON p.id=vi.product_id WHERE vi.id=$1 AND vi.kind='order'`, [id]);
  if (!current.rows[0]) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
  const row = current.rows[0] as Record<string, unknown>;
  if (!canTransitionOrder(String(row.approval_status) as OrderApprovalStatus, body.status, user.role)) return NextResponse.json({ error: "لا يمكن تغيير حالة هذا الطلب" }, { status: 409 });
  await query(`UPDATE visit_items SET approval_status=$1, approval_note=$2, approved_by=$3, approved_at=now() WHERE id=$4`, [body.status, String(body.note||""), user.id, id]);
  const message = body.status === "approved" ? `تمت الموافقة على طلب ${row.product_name}` : `تم رفض طلب ${row.product_name}${body.note ? `: ${body.note}` : ""}`;
  await query(`INSERT INTO task_notifications(user_id, task_id, order_item_id, kind, message) VALUES($1,NULL,$2,$3,$4)`, [row.sales_rep_id, id, `order_${body.status}`, message]);
  return NextResponse.json({ ok: true });
}
