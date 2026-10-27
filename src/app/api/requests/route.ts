import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { defaultRequestDueAt } from "@/lib/request-workflow";

const priorities = new Set(["low", "normal", "high", "urgent"]);
const categories = new Set(["general", "hr", "products", "documents", "support", "doctor", "visit", "plan", "samples"]);
const references = new Set(["doctor", "visit", "plan", "product", "task"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function referenceIsAccessible(type: string, id: string, userId: string) {
  const sql: Record<string, string> = {
    doctor: "SELECT 1 FROM doctors WHERE id=$1 AND status='active' AND $2::uuid IS NOT NULL",
    product: "SELECT 1 FROM products WHERE id=$1 AND active=true AND $2::uuid IS NOT NULL",
    visit: "SELECT 1 FROM visits WHERE id=$1 AND sales_rep_id=$2",
    plan: "SELECT 1 FROM plans WHERE id=$1 AND user_id=$2",
    task: "SELECT 1 FROM task_assignees WHERE task_id=$1 AND user_id=$2",
  };
  const result = await query(sql[type], [id, userId]);
  return (result.rowCount || 0) > 0;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const where = user.role === "admin" ? "" : "WHERE r.requester_id=$1";
  const values = user.role === "admin" ? [] : [user.id];
  const eventScope = user.role === "admin" ? "" : "AND e.visibility='shared'";
  const result = await query(
    `SELECT r.id,r.kind,r.title,r.body,r.status,r.file_name,r.signed_file_name,r.response,
      r.priority,r.category,r.due_at,r.cancelled_at,r.assigned_to,r.last_action_at,
      r.created_at,r.updated_at,r.urgent_reason,r.reference_type,r.reference_id,
      r.claimed_at,r.closed_at,r.resolution_summary,u.name requester_name,
      assignee.name assigned_name,
      (SELECT count(*)::int FROM service_request_events e WHERE e.request_id=r.id ${eventScope}) event_count
     FROM service_requests r
     JOIN users u ON u.id=r.requester_id
     LEFT JOIN users assignee ON assignee.id=r.assigned_to
     ${where}
     ORDER BY CASE WHEN r.status IN ('pending','reopened','needs_info') THEN 0 ELSE 1 END,
       CASE r.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
       r.updated_at DESC`,
    values,
  );
  const assignees = user.role === "admin"
    ? (await query("SELECT id,name FROM users WHERE role='admin' AND active=true ORDER BY name")).rows
    : [];
  return NextResponse.json({ requests: result.rows, assignees });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "sales_rep") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form" }, { status: 400 });

  const kind = String(form.get("kind") || "manual_request");
  const title = String(form.get("title") || "").trim();
  const body = String(form.get("body") || "").trim();
  const priority = String(form.get("priority") || "normal");
  const category = String(form.get("category") || "general");
  const urgentReason = String(form.get("urgent_reason") || "").trim();
  const referenceTypeValue = String(form.get("reference_type") || "");
  const referenceType = references.has(referenceTypeValue) ? referenceTypeValue : null;
  const referenceId = referenceType ? String(form.get("reference_id") || "").trim().slice(0, 100) || null : null;

  if (referenceTypeValue && !referenceType) {
    return NextResponse.json({ error: "نوع السجل المرتبط غير صالح" }, { status: 400 });
  }
  if (referenceType && (!referenceId || !uuidPattern.test(referenceId) || !await referenceIsAccessible(referenceType, referenceId, user.id))) {
    return NextResponse.json({ error: "السجل المرتبط غير موجود أو غير متاح لك" }, { status: 400 });
  }

  if (!["document_signature", "manual_request"].includes(kind) || title.length < 3 || title.length > 180) {
    return NextResponse.json({ error: "اكتب عنوانًا واضحًا للطلب" }, { status: 400 });
  }
  if (body.length > 5000 || !priorities.has(priority) || !categories.has(category)) {
    return NextResponse.json({ error: "بيانات الطلب غير صالحة" }, { status: 400 });
  }
  if (priority === "urgent" && urgentReason.length < 5) {
    return NextResponse.json({ error: "اكتب سبب أولوية الطلب العاجلة" }, { status: 400 });
  }

  const file = form.get("file");
  if (kind === "document_signature" && (!(file instanceof File) || file.size === 0 || file.type !== "application/pdf")) {
    return NextResponse.json({ error: "ارفع ملف PDF المطلوب" }, { status: 400 });
  }
  if (file instanceof File && file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "الحد الأقصى لحجم الملف 15 ميجابايت" }, { status: 400 });
  }
  const data = file instanceof File ? Buffer.from(await file.arrayBuffer()) : null;
  if (kind === "document_signature" && data && !data.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    return NextResponse.json({ error: "ملف PDF غير صالح" }, { status: 400 });
  }
  const dueAt = defaultRequestDueAt(priority);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = await client.query(
      `INSERT INTO service_requests(
        requester_id,kind,title,body,priority,category,due_at,urgent_reason,
        reference_type,reference_id,file_data,file_name,file_mime,last_action_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()) RETURNING id`,
      [user.id, kind, title, body, priority, category, dueAt, urgentReason, referenceType, referenceId,
        data, file instanceof File ? file.name : null,
        file instanceof File ? (file.type || "application/octet-stream") : null],
    );
    const id = created.rows[0].id;
    await client.query(
      `INSERT INTO service_request_events(request_id,actor_id,event_type,message,to_status)
       VALUES($1,$2,'created',$3,'pending')`,
      [id, user.id, `أنشأ ${user.name} الطلب`],
    );
    const admins = await client.query("SELECT id FROM users WHERE role='admin' AND active=true");
    for (const admin of admins.rows) {
      await client.query(
        "INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,entity_type,entity_id) VALUES($1,NULL,'service_request_created',$2,$3,'service_request',$4)",
        [admin.id, `${user.name} أرسل طلبًا جديدًا: ${title}`, `/admin/requests?request=${id}`, id],
      );
    }
    await client.query("COMMIT");
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
