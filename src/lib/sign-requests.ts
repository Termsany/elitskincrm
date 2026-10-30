import { query } from "@/lib/db";
import { readLibraryFile, UUID_RE, type Who } from "@/lib/library";

const SIGNABLE = new Set(["application/pdf", "image/png", "image/jpeg"]);
const WANT: Record<string, string> = { signature: "توقيع", stamp: "ختم", both: "توقيع وختم" };

async function notify(userIds: string[], kind: string, message: string, url: string, id: string) {
  for (const uid of userIds) await query(`INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,entity_type,entity_id) VALUES($1,NULL,$2,$3,$4,'sign_request',$5)`, [uid, kind, message, url, id]);
}

export async function createSignRequest(u: Who, src: string, itemId: string, note: string, want: string) {
  if (!["signature", "stamp", "both"].includes(want)) want = "signature";
  const f = await readLibraryFile(u, src, itemId);
  if (!f) return { status: 404, error: "الملف غير موجود أو غير مسموح لك" };
  if (!SIGNABLE.has(f.mime)) return { status: 415, error: "التوقيع متاح لملفات PDF والصور فقط" };
  const dup = await query(`SELECT 1 FROM sign_requests WHERE src=$1 AND item_id=$2 AND requested_by=$3 AND status='pending'`, [src, itemId, u.id]);
  if (dup.rowCount) return { status: 409, error: "فيه طلب توقيع على الملف ده لسه مستني" };
  const r = await query(`INSERT INTO sign_requests(src,item_id,file_name,requested_by,note,want) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [src, itemId, f.name, u.id, note.slice(0, 400), want]);
  const id = r.rows[0].id as string;
  const admins = (await query(`SELECT id FROM users WHERE role='admin' AND active`)).rows.map(x => x.id as string);
  await notify(admins, "sign_request", `${u.name} طالب ${WANT[want]} على «${f.name}»${note ? ` — ${note.slice(0, 60)}` : ""}`, `/library?view=signreq`, id);
  await query(`INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'request_sign','sign_request',$2,$3)`, [u.id, id, JSON.stringify({ src, itemId, want })]);
  return { status: 201, id };
}

export async function listSignRequests(u: Who) {
  const admin = u.role === "admin";
  const r = await query(`SELECT s.id, s.src, s.item_id, s.file_name, s.note, s.want, s.status, s.admin_note, s.created_at, s.decided_at, s.signed_file_id,
      s.requested_by::text requested_by, u.name requested_by_name, d.name decided_by_name, lf.sign_meta->>'ref' ref
    FROM sign_requests s JOIN users u ON u.id=s.requested_by LEFT JOIN users d ON d.id=s.decided_by LEFT JOIN library_files lf ON lf.id=s.signed_file_id
    WHERE ($1::boolean OR s.requested_by=$2::uuid) AND (s.status='pending' OR s.created_at > now() - interval '60 days')
    ORDER BY CASE WHEN s.status='pending' THEN 0 ELSE 1 END, s.created_at DESC LIMIT 200`, [admin, u.id]);
  return r.rows;
}

export async function decideSignRequest(u: Who, id: string, action: string, note: string) {
  if (!UUID_RE.test(id)) return { status: 404, error: "Not found" };
  const s = (await query(`SELECT * FROM sign_requests WHERE id=$1`, [id])).rows[0];
  if (!s || s.status !== "pending") return { status: 409, error: "الطلب اتقفل بالفعل" };
  if (action === "cancel") {
    if (s.requested_by !== u.id) return { status: 403, error: "Forbidden" };
    await query(`UPDATE sign_requests SET status='cancelled', decided_at=now(), decided_by=$2 WHERE id=$1`, [id, u.id]);
    return { status: 200, ok: true };
  }
  if (action === "reject") {
    if (u.role !== "admin") return { status: 403, error: "Forbidden" };
    if (note.trim().length < 3) return { status: 400, error: "اكتب سبب الرفض للمندوب" };
    await query(`UPDATE sign_requests SET status='rejected', admin_note=$2, decided_at=now(), decided_by=$3 WHERE id=$1`, [id, note.trim().slice(0, 300), u.id]);
    await notify([s.requested_by], "sign_request_rejected", `المدير رفض توقيع «${s.file_name}»: ${note.trim().slice(0, 80)}`, `/library?view=signreq`, id);
    return { status: 200, ok: true };
  }
  return { status: 400, error: "Invalid" };
}

/** Called inside the signing transaction when the manager signs from a request. */
export async function fulfillInTx(db: { query: (s: string, v?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> }, u: Who, requestId: string, src: string, itemId: string, signedFileId: string) {
  const s = (await db.query(`SELECT * FROM sign_requests WHERE id=$1 FOR UPDATE`, [requestId])).rows[0];
  if (!s || s.status !== "pending" || s.src !== src || s.item_id !== itemId) return false;
  await db.query(`UPDATE sign_requests SET status='signed', signed_file_id=$2, decided_at=now(), decided_by=$3 WHERE id=$1`, [requestId, signedFileId, u.id]);
  await db.query(`UPDATE library_files SET shared_with=$2 WHERE id=$1`, [signedFileId, s.requested_by]);
  await db.query(`INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,entity_type,entity_id) VALUES($1,NULL,'sign_request_done',$2,$3,'sign_request',$4)`,
    [s.requested_by, `اتوقّع «${s.file_name}» ✓ — النسخة الموقعة جاهزة للتنزيل`, `/library?file=${signedFileId}`, requestId]);
  return true;
}
