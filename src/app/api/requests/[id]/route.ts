import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { pool, query } from "@/lib/db";
import { canTransitionRequest, type RequestStatus } from "@/lib/request-workflow";
import { PDFDocument } from "pdf-lib";
import { badId, validIds } from "@/lib/ids";

const priorities = new Set(["low", "normal", "high", "urgent"]);
const categories = new Set(["general", "hr", "products", "documents", "support", "doctor", "visit", "plan", "samples"]);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {if(!validIds(await params))return badId();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await query(
    "SELECT requester_id,file_data,file_name,file_mime,signed_file_data,signed_file_name,signed_file_mime FROM service_requests WHERE id=$1",
    [id],
  );
  if (!result.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const row = result.rows[0];
  if (user.role !== "admin" && row.requester_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const kind = new URL(req.url).searchParams.get("kind") === "signed" ? "signed" : "original";
  const data = kind === "signed" ? row.signed_file_data : row.file_data;
  const name = kind === "signed" ? row.signed_file_name : row.file_name;
  const mime = kind === "signed" ? row.signed_file_mime : row.file_mime;
  if (!data) return NextResponse.json({ error: "File not found" }, { status: 404 });
  return new NextResponse(data, {
    headers: {
      "content-type": mime || "application/octet-stream",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name || "document")}`,
      "x-content-type-options": "nosniff",
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {if(!validIds(await params))return badId();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form" }, { status: 400 });

  const nextStatus = String(form.get("status") || "");
  const response = String(form.get("response") || "").trim().slice(0, 5000);
  const resolution = String(form.get("resolution_summary") || "").trim().slice(0, 5000);
  const internalNote = String(form.get("admin_note") || "").trim().slice(0, 5000);
  const priority = String(form.get("priority") || "");
  const category = String(form.get("category") || "");
  const dueRaw = String(form.get("due_at") || "");
  const dueAt = dueRaw ? new Date(dueRaw) : null;
  const assignedTo = String(form.get("assigned_to") || "") || null;
  const signedFile = form.get("signed_file");

  if (priority && !priorities.has(priority)) return NextResponse.json({ error: "أولوية غير صالحة" }, { status: 400 });
  if (category && !categories.has(category)) return NextResponse.json({ error: "تصنيف غير صالح" }, { status: 400 });
  if (dueAt && !Number.isFinite(dueAt.getTime())) return NextResponse.json({ error: "موعد الإنجاز غير صالح" }, { status: 400 });
  let fileData: Buffer | null = null;
  if (signedFile instanceof File) {
    if (signedFile.size <= 0 || signedFile.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "حجم ملف PDF غير صالح أو يتجاوز 15 ميجابايت" }, { status: 400 });
    }
    if (signedFile.type !== "application/pdf") {
      return NextResponse.json({ error: "الملف الموقع يجب أن يكون PDF" }, { status: 415 });
    }
    fileData = Buffer.from(await signedFile.arrayBuffer());
    if (!fileData.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      return NextResponse.json({ error: "ملف PDF غير صالح" }, { status: 400 });
    }
    try {
      const pdf = await PDFDocument.load(fileData);
      if (pdf.getPageCount() < 1) throw new Error("empty PDF");
    } catch {
      return NextResponse.json({ error: "ملف PDF تالف أو غير قابل للقراءة" }, { status: 400 });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      "SELECT requester_id,title,status,kind FROM service_requests WHERE id=$1 FOR UPDATE",
      [id],
    );
    const current = locked.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    }
    const target = (nextStatus || current.status) as RequestStatus;
    if (target !== current.status && !canTransitionRequest("admin", current.status, target)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "لا يمكن نقل الطلب إلى هذه الحالة" }, { status: 409 });
    }
    if (fileData && (current.kind !== "document_signature" || target !== "completed")) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "يُقبل الملف الموقع فقط عند إكمال طلب توقيع مستند" }, { status: 409 });
    }
    if (["needs_info", "rejected"].includes(target) && response.length < 3) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "اكتب رسالة واضحة للمندوب" }, { status: 400 });
    }
    if (["completed", "closed"].includes(target) && (resolution || response).length < 3) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "اكتب ملخص التنفيذ قبل الإغلاق" }, { status: 400 });
    }
    if (assignedTo) {
      const assignee = await client.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND active=true", [assignedTo]);
      if (!assignee.rowCount) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "المسؤول المحدد غير صالح" }, { status: 400 });
      }
    }

    await client.query(
      `UPDATE service_requests SET
        status=$1,response=CASE WHEN $2<>'' THEN $2 ELSE response END,
        priority=CASE WHEN $3<>'' THEN $3 ELSE priority END,
        category=CASE WHEN $4<>'' THEN $4 ELSE category END,
        due_at=COALESCE($5,due_at),assigned_to=$6,
        resolution_summary=CASE WHEN $7<>'' THEN $7 ELSE resolution_summary END,
        claimed_at=CASE WHEN claimed_at IS NULL AND $1 IN ('in_progress','approved') THEN now() ELSE claimed_at END,
        closed_at=CASE WHEN status='closed' THEN closed_at ELSE NULL END,
        last_action_at=now(),updated_at=now(),responded_at=now(),responded_by=$8,
        signed_file_data=COALESCE($9,signed_file_data),
        signed_file_name=COALESCE($10,signed_file_name),
        signed_file_mime=COALESCE($11,signed_file_mime)
       WHERE id=$12`,
      [target, response, priority, category, dueAt, assignedTo, resolution, user.id, fileData,
        fileData && signedFile instanceof File ? signedFile.name : null,
        fileData ? "application/pdf" : null, id],
    );

    const sharedMessage = response || resolution || (target !== current.status ? `تم تحديث حالة الطلب إلى ${target}` : "تم تحديث الطلب");
    await client.query(
      `INSERT INTO service_request_events(request_id,actor_id,event_type,visibility,message,from_status,to_status)
       VALUES($1,$2,$3,'shared',$4,$5,$6)`,
      [id, user.id, target !== current.status ? "status_changed" : "updated", sharedMessage, current.status, target],
    );
    if (internalNote) {
      await client.query(
        `INSERT INTO service_request_events(request_id,actor_id,event_type,visibility,message)
         VALUES($1,$2,'internal_note','admin',$3)`,
        [id, user.id, internalNote],
      );
    }
    await client.query(
      "INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,entity_type,entity_id) VALUES($1,NULL,'service_request_updated',$2,$3,'service_request',$4)",
      [current.requester_id, `تم تحديث طلبك: ${current.title}`, `/requests?request=${id}`, id],
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, status: target });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
