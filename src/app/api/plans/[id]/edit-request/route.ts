import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { pool, query } from "@/lib/db";
import { riyadhDateParts } from "@/lib/plan-reminders";

type ProposedItem = { doctor_id: string; planned_date: string; product_id?: string | null; note?: string; priority?: string };

// Rep submits a proposed edit to an already-approved plan. The approved plan and
// its items are NOT touched here — they stay live until an admin approves.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const planRes = await query(`SELECT id, user_id, status, period, period_start::text period_start, period_end::text period_end FROM plans WHERE id=$1`, [id]);
  const plan = planRes.rows[0] as Record<string, unknown> | undefined;
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role === "admin") return NextResponse.json({ error: "المدير يعدّل الخطة مباشرة" }, { status: 400 });
  if (String(plan.user_id) !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (String(plan.status) !== "approved") return NextResponse.json({ error: "طلب التعديل متاح للخطط المعتمدة فقط" }, { status: 409 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const note = String(body.note || "").trim();
  if (note.length < 5) return NextResponse.json({ error: "اكتب سبب التعديل (5 أحرف على الأقل)" }, { status: 400 });
  const items = body.items as ProposedItem[] | undefined;
  if (!items || !items.length) return NextResponse.json({ error: "أضف زيارة واحدة على الأقل" }, { status: 400 });
  if (items.length > 50) return NextResponse.json({ error: "الحد 50 زيارة" }, { status: 400 });
  const today = riyadhDateParts().date;
  const periodStart = String(plan.period_start), periodEnd = String(plan.period_end);
  for (const it of items) {
    if (!it.doctor_id || !/^\d{4}-\d{2}-\d{2}$/.test(String(it.planned_date))) return NextResponse.json({ error: "بيانات زيارة غير صحيحة" }, { status: 400 });
    if (String(it.planned_date) < periodStart || String(it.planned_date) > periodEnd) return NextResponse.json({ error: "كل زيارة يجب أن تكون داخل تواريخ الخطة" }, { status: 400 });
    if (String(it.planned_date) < today) return NextResponse.json({ error: `لا يمكن تعديل زيارة بتاريخ سابق لليوم (${today})` }, { status: 400 });
  }

  const existing = await query(`SELECT id FROM plan_edit_requests WHERE plan_id=$1 AND status='pending'`, [id]);
  if (existing.rows[0]) return NextResponse.json({ error: "يوجد طلب تعديل قيد المراجعة بالفعل لهذه الخطة" }, { status: 409 });

  const orig = await query(`SELECT doctor_id, planned_date::text planned_date, product_id, note, priority, sort_order FROM plan_items WHERE plan_id=$1 ORDER BY sort_order, planned_date`, [id]);
  const proposed = items.map((it, idx) => ({
    doctor_id: String(it.doctor_id),
    planned_date: String(it.planned_date),
    product_id: it.product_id || null,
    note: String(it.note || ""),
    priority: String(it.priority || "medium"),
    sort_order: idx,
  }));
  const reqRes = await query(
    `INSERT INTO plan_edit_requests(plan_id, requested_by, note, proposed_items, original_items) VALUES($1,$2,$3,$4,$5) RETURNING id`,
    [id, user.id, note, JSON.stringify(proposed), JSON.stringify(orig.rows)],
  );
  const admins = await query(`SELECT id FROM users WHERE role='admin'`);
  for (const a of admins.rows as Record<string, unknown>[]) {
    await query(`INSERT INTO task_notifications(user_id, task_id, plan_id, kind, message) VALUES($1,NULL,$2,'plan_edit_request',$3)`, [a.id, id, `${user.name} طلب تعديل خطة معتمدة — ${note.slice(0, 60)}`]);
  }
  await query(`INSERT INTO audit_logs(actor_id, action, entity, entity_id, details) VALUES($1,'edit_request','plan',$2,$3)`, [user.id, id, JSON.stringify({ request_id: reqRes.rows[0].id, items: proposed.length })]);
  return NextResponse.json({ ok: true, id: reqRes.rows[0].id }, { status: 201 });
}

// Admin approves or rejects the pending edit request.
// approve -> apply proposed items to the plan. reject -> keep the original plan.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const action = String(body.action || "");
  if (!["approve", "reject"].includes(action)) return NextResponse.json({ error: "إجراء غير صحيح" }, { status: 400 });
  const adminNote = String(body.admin_note || "").slice(0, 1000);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const er = await client.query(`SELECT * FROM plan_edit_requests WHERE plan_id=$1 AND status='pending' FOR UPDATE`, [id]);
    const editReq = er.rows[0] as Record<string, unknown> | undefined;
    if (!editReq) { await client.query("ROLLBACK"); return NextResponse.json({ error: "لا يوجد طلب تعديل قيد المراجعة. حدّث الصفحة." }, { status: 409 }); }
    const planRes = await client.query(`SELECT user_id, period FROM plans WHERE id=$1 FOR UPDATE`, [id]);
    const plan = planRes.rows[0] as Record<string, unknown> | undefined;
    if (!plan) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Not found" }, { status: 404 }); }

    if (action === "approve") {
      const proposed = (editReq.proposed_items as Array<Record<string, unknown>>) || [];
      await client.query(`DELETE FROM plan_items WHERE plan_id=$1`, [id]);
      for (let idx = 0; idx < proposed.length; idx++) {
        const it = proposed[idx];
        await client.query(`INSERT INTO plan_items(plan_id, doctor_id, planned_date, product_id, note, priority, sort_order) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [id, it.doctor_id, it.planned_date, it.product_id || null, it.note || "", it.priority || "medium", Number(it.sort_order ?? idx)]);
      }
      await client.query(`UPDATE plans SET updated_at=now() WHERE id=$1`, [id]);
      await client.query(`UPDATE plan_edit_requests SET status='approved', admin_note=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$1`, [editReq.id, adminNote, user.id]);
      await client.query(`INSERT INTO task_notifications(user_id, task_id, plan_id, kind, message) VALUES($1,NULL,$2,'plan_edit_approved',$3)`, [plan.user_id, id, `تم اعتماد تعديلك على الخطة${adminNote ? ` — ${adminNote}` : ""}`]);
      await client.query(`INSERT INTO audit_logs(actor_id, action, entity, entity_id, details) VALUES($1,'edit_approved','plan',$2,$3)`, [user.id, id, JSON.stringify({ request_id: editReq.id })]);
    } else {
      // Reject: the original approved plan_items are left exactly as they are.
      await client.query(`UPDATE plan_edit_requests SET status='rejected', admin_note=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$1`, [editReq.id, adminNote, user.id]);
      await client.query(`INSERT INTO task_notifications(user_id, task_id, plan_id, kind, message) VALUES($1,NULL,$2,'plan_edit_rejected',$3)`, [plan.user_id, id, `تم رفض تعديلك — الخطة الأصلية المعتمدة سارية${adminNote ? ` — ${adminNote}` : ""}`]);
      await client.query(`INSERT INTO audit_logs(actor_id, action, entity, entity_id, details) VALUES($1,'edit_rejected','plan',$2,$3)`, [user.id, id, JSON.stringify({ request_id: editReq.id })]);
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
