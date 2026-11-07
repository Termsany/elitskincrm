import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { badId, validIds } from "@/lib/ids";
import { sniffUpload } from "@/lib/upload-sniff";
import { HR_KINDS, OPEN } from "@/lib/hr";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const NEXT: Record<string, { to: string; from: string[]; label: string }> = {
  approve: { to: "approved", from: OPEN, label: "اعتمد" },
  reject: { to: "rejected", from: OPEN, label: "رفض" },
  needs_info: { to: "needs_info", from: ["pending", "reopened", "in_progress"], label: "طلب توضيح في" },
  complete: { to: "completed", from: ["approved", "in_progress", ...OPEN], label: "سلّم" },
};

/** Admin decision on an employee request: approve / reject / ask for info / complete (with the issued document as PDF). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validIds(await params)) return badId();
  const user = await getCurrentUser();
  if (!user) return bad("Unauthorized", 401);
  if (user.role !== "admin") return bad("Forbidden", 403);
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  if (!form) return bad("بيانات غير صالحة");
  const action = String(form.get("action") || ""), note = String(form.get("note") || "").trim().slice(0, 2000);
  const step = NEXT[action];
  if (!step) return bad("إجراء غير معروف");
  if ((action === "reject" || action === "needs_info") && note.length < 3) return bad("اكتب السبب للمندوب");
  const file = form.get("file");
  let doc: Buffer | null = null;
  if (file instanceof File && file.size > 0) {
    if (action !== "complete") return bad("المستند بيترفع عند التسليم بس");
    if (file.size > 15 * 1024 * 1024) return bad("الحد الأقصى 15 ميجابايت");
    doc = Buffer.from(await file.arrayBuffer());
    if (sniffUpload(doc)?.mime !== "application/pdf") return bad("المستند لازم يكون PDF");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = (await client.query<{ requester_id: string; title: string; status: string; kind: string }>(
      "SELECT requester_id, title, status, kind FROM service_requests WHERE id=$1 AND kind = ANY($2::text[]) FOR UPDATE", [id, HR_KINDS])).rows[0];
    if (!cur) { await client.query("ROLLBACK"); return bad("الطلب غير موجود", 404); }
    if (!step.from.includes(cur.status)) { await client.query("ROLLBACK"); return bad("حالة الطلب اتغيرت — حدّث الصفحة", 409); }
    if (action === "complete" && !["exit_reentry", "salary_letter"].includes(cur.kind)) { await client.query("ROLLBACK"); return bad("التسليم للخطابات والتأشيرات بس", 409); }
    const message = note || (action === "approve" ? "تم اعتماد الطلب" : action === "complete" ? "تم تجهيز المطلوب" : "");
    await client.query(
      `UPDATE service_requests SET status=$2, response=CASE WHEN $3<>'' THEN $3 ELSE response END,
         resolution_summary=CASE WHEN $2='completed' THEN $3 ELSE resolution_summary END,
         claimed_at=COALESCE(claimed_at, now()), responded_at=now(), responded_by=$4, last_action_at=now(), updated_at=now(),
         signed_file_data=COALESCE($5, signed_file_data), signed_file_name=COALESCE($6, signed_file_name), signed_file_mime=COALESCE($7, signed_file_mime)
       WHERE id=$1`,
      [id, step.to, message, user.id, doc, doc && file instanceof File ? file.name : null, doc ? "application/pdf" : null]);
    await client.query(
      "INSERT INTO service_request_events(request_id,actor_id,event_type,visibility,message,from_status,to_status) VALUES($1,$2,'status_changed','shared',$3,$4,$5)",
      [id, user.id, `${user.name} ${step.label} الطلب${message ? ` — ${message}` : ""}`, cur.status, step.to]);
    const verdict = { approved: "اتعتمد ✓", rejected: "اترفض", needs_info: "محتاج توضيح", completed: "جاهز ✓" }[step.to] || "اتحدث";
    await client.query(
      "INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,entity_type,entity_id) VALUES($1,NULL,'service_request_updated',$2,$3,'service_request',$4)",
      [cur.requester_id, `طلبك ${verdict}: ${cur.title}`, `/work?hr=${id}`, id]);
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, status: step.to });
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}
