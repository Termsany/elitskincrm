import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { pool, query } from "@/lib/db";
import { UUID_RE, type Who } from "@/lib/library";

type Q = { query: (sql: string, vals?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> };
export const TRASH_DAYS = 30;
const SRC_LABEL: Record<string, string> = { lib: "المكتبة", brochure: "بروشور منتج", visit: "مرفق زيارة", task: "مرفق مهمة", request: "مرفق طلب", request_signed: "نسخة طلب موقعة" };

/** Who may delete what: admin everything; a rep only his own library files, his visits' and his own tasks' attachments. */
async function loadForDelete(db: Q, u: Who, src: string, id: string) {
  const admin = u.role === "admin";
  if (src === "lib") {
    const r = (await db.query(`SELECT l.id, l.name, l.mime, l.size_bytes, l.owner_id::text owner_id, l.folder FROM library_files l WHERE l.id=$1 AND l.deleted_at IS NULL FOR UPDATE`, [id])).rows[0];
    return r && (admin || r.owner_id === u.id) ? { name: r.name, mime: r.mime, size: r.size_bytes, owner: r.owner_id, ctx: `المكتبة · ${r.folder}`, row: r } : null;
  }
  if (src === "visit") {
    const r = (await db.query(`SELECT a.*, v.sales_rep_id::text owner, d.name doctor FROM visit_attachments a JOIN visits v ON v.id=a.visit_id JOIN doctors d ON d.id=v.doctor_id WHERE a.id=$1 FOR UPDATE OF a`, [id])).rows[0];
    return r && (admin || r.owner === u.id) ? { name: r.file_name, mime: r.mime_type, size: r.size_bytes, owner: r.owner, ctx: `زيارة · ${r.doctor}`, row: r } : null;
  }
  if (src === "task") {
    const r = (await db.query(`SELECT a.*, t.created_by::text owner, t.title FROM task_attachments a JOIN tasks t ON t.id=a.task_id WHERE a.id=$1 FOR UPDATE OF a`, [id])).rows[0];
    return r && (admin || r.owner === u.id) ? { name: r.file_name, mime: r.mime_type, size: r.size_bytes, owner: r.owner, ctx: `مهمة · ${r.title}`, row: r } : null;
  }
  if (!admin) return null;
  if (src === "brochure") {
    const r = (await db.query(`SELECT b.*, p.name product FROM product_brochures b JOIN products p ON p.id=b.product_id WHERE b.id=$1 FOR UPDATE OF b`, [id])).rows[0];
    return r ? { name: r.file_name, mime: r.mime, size: r.size_bytes, owner: null, ctx: `بروشور · ${r.product}`, row: r } : null;
  }
  if (src === "request" || src === "request_signed") {
    const s = src === "request_signed";
    const r = (await db.query(`SELECT id, title, requester_id::text owner, ${s ? "signed_file_name n, signed_file_mime m, signed_file_data d, signed_sha256 h, signed_at sa, signed_by sb" : "file_name n, file_mime m, file_data d"} FROM service_requests WHERE id=$1 FOR UPDATE`, [id])).rows[0];
    return r?.d ? { name: r.n || "document", mime: r.m || "application/octet-stream", size: r.d.length, owner: r.owner, ctx: `طلب · ${r.title}`, row: r } : null;
  }
  return null;
}

async function purgeExpired(db: Q) {
  const old = (await db.query(`DELETE FROM library_trash WHERE deleted_at < now() - make_interval(days => $1::int) RETURNING src, item_id`, [TRASH_DAYS])).rows;
  const libIds = old.filter(r => r.src === "lib").map(r => r.item_id);
  if (libIds.length) await db.query(`DELETE FROM library_files WHERE id = ANY($1::uuid[]) AND deleted_at IS NOT NULL`, [libIds]);
}

export async function deleteItems(u: Who, items: Array<{ src: string; id: string }>) {
  const deleted: string[] = [], failed: Array<{ src: string; id: string; error: string }> = [];
  const unlinkLater: string[] = [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const it of items.slice(0, 100)) {
      if (!UUID_RE.test(it.id)) { failed.push({ ...it, error: "Invalid" }); continue; }
      const f = await loadForDelete(client, u, it.src, it.id);
      if (!f) { failed.push({ ...it, error: "غير مسموح أو غير موجود" }); continue; }
      let data: Buffer | null = null; let snapshot: Record<string, unknown> = {};
      const r = f.row as Record<string, any>;
      if (it.src === "lib") {
        await client.query(`UPDATE library_files SET deleted_at=now() WHERE id=$1`, [it.id]);
      } else if (it.src === "visit" || it.src === "task") {
        try { data = await readFile(String(r.file_path)); } catch { data = null; }
        const { data: _d, owner: _o, doctor: _dc, title: _t, ...row } = r; snapshot = row;
        await client.query(`DELETE FROM ${it.src === "visit" ? "visit_attachments" : "task_attachments"} WHERE id=$1`, [it.id]);
        unlinkLater.push(String(r.file_path));
      } else if (it.src === "brochure") {
        const { data: d, product: _p, ...row } = r; data = d; snapshot = row;
        await client.query(`DELETE FROM product_brochures WHERE id=$1`, [it.id]);
      } else {
        data = r.d; snapshot = it.src === "request_signed" ? { sha256: r.h, signed_at: r.sa, signed_by: r.sb } : {};
        await client.query(it.src === "request_signed"
          ? `UPDATE service_requests SET signed_file_data=NULL, signed_file_name=NULL, signed_file_mime=NULL, signed_sha256=NULL, updated_at=now() WHERE id=$1`
          : `UPDATE service_requests SET file_data=NULL, file_name=NULL, file_mime=NULL, updated_at=now() WHERE id=$1`, [it.id]);
      }
      await client.query(`INSERT INTO library_trash(src,item_id,name,mime,size_bytes,data,snapshot,ctx,owner_id,deleted_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [it.src, it.id, f.name, f.mime || "application/octet-stream", Number(f.size || 0), data, JSON.stringify(snapshot), f.ctx, f.owner || null, u.id]);
      await client.query(`INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'delete','library_file',$2,$3)`, [u.id, it.id, JSON.stringify({ src: it.src, name: f.name })]);
      deleted.push(`${it.src}:${it.id}`);
    }
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  for (const p of unlinkLater) await unlink(p).catch(() => undefined);
  return { deleted, failed };
}

export async function listTrash(u: Who) {
  await purgeExpired({ query });
  const r = await query(`SELECT t.id, t.src, t.item_id, t.name, t.mime, t.size_bytes, t.ctx, t.deleted_at, u.name deleted_by_name, t.deleted_by::text deleted_by,
      GREATEST(0, $3::int - floor(extract(epoch FROM now()-t.deleted_at)/86400)::int) days_left
    FROM library_trash t JOIN users u ON u.id=t.deleted_by WHERE ($1::boolean OR t.deleted_by=$2::uuid OR t.owner_id=$2::uuid) ORDER BY t.deleted_at DESC LIMIT 300`, [u.role === "admin", u.id, TRASH_DAYS]);
  return r.rows.map(x => ({ ...x, src_label: SRC_LABEL[x.src] || x.src }));
}

export async function restoreItem(u: Who, trashId: string) {
  if (!UUID_RE.test(trashId)) return { status: 404, error: "Not found" };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = (await client.query(`SELECT * FROM library_trash WHERE id=$1 FOR UPDATE`, [trashId])).rows[0];
    if (!t || !(u.role === "admin" || t.deleted_by === u.id || t.owner_id === u.id)) { await client.query("ROLLBACK"); return { status: 404, error: "غير موجود" }; }
    if (["brochure", "request", "request_signed"].includes(t.src) && u.role !== "admin") { await client.query("ROLLBACK"); return { status: 403, error: "الاسترجاع للمدير فقط" }; }
    const s = t.snapshot as Record<string, any>;
    if (t.src === "lib") {
      await client.query(`UPDATE library_files SET deleted_at=NULL WHERE id=$1`, [t.item_id]);
    } else if (t.src === "visit" || t.src === "task") {
      const parent = t.src === "visit" ? "visits" : "tasks";
      const pid = t.src === "visit" ? s.visit_id : s.task_id;
      const ok = (await client.query(`SELECT 1 FROM ${parent} WHERE id=$1`, [pid])).rowCount;
      if (!ok || !t.data) { await client.query("ROLLBACK"); return { status: 409, error: !ok ? `${t.src === "visit" ? "الزيارة" : "المهمة"} الأصلية اتحذفت` : "محتوى الملف مش متاح" }; }
      await mkdir(path.dirname(String(s.file_path)), { recursive: true });
      await writeFile(String(s.file_path), t.data);
      await client.query(`INSERT INTO ${t.src === "visit" ? "visit_attachments(id,visit_id" : "task_attachments(id,task_id"},file_name,file_path,mime_type,size_bytes,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [s.id, pid, s.file_name, s.file_path, s.mime_type, s.size_bytes, s.created_at]);
    } else if (t.src === "brochure") {
      const ok = (await client.query(`SELECT 1 FROM products WHERE id=$1`, [s.product_id])).rowCount;
      if (!ok) { await client.query("ROLLBACK"); return { status: 409, error: "المنتج الأصلي اتحذف" }; }
      await client.query(`INSERT INTO product_brochures(id,product_id,title,file_name,mime,data,size_bytes,pages,sort_order,active,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())`,
        [s.id, s.product_id, s.title || "", s.file_name, s.mime, t.data, s.size_bytes, s.pages || 1, s.sort_order || 0, s.active !== false, s.created_at]);
    } else {
      const signed = t.src === "request_signed";
      const r = await client.query(signed
        ? `UPDATE service_requests SET signed_file_data=$2, signed_file_name=$3, signed_file_mime=$4, signed_sha256=$5, updated_at=now() WHERE id=$1 AND signed_file_data IS NULL`
        : `UPDATE service_requests SET file_data=$2, file_name=$3, file_mime=$4, updated_at=now() WHERE id=$1 AND file_data IS NULL`,
        signed ? [t.item_id, t.data, t.name, t.mime, s.sha256 || null] : [t.item_id, t.data, t.name, t.mime]);
      if (!r.rowCount) { await client.query("ROLLBACK"); return { status: 409, error: "الطلب الأصلي اتحذف أو عليه ملف جديد" }; }
    }
    await client.query(`DELETE FROM library_trash WHERE id=$1`, [trashId]);
    await client.query(`INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'restore','library_file',$2,$3)`, [u.id, t.item_id, JSON.stringify({ src: t.src, name: t.name })]);
    await client.query("COMMIT");
    return { status: 200, ok: true };
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}

export async function purgeItem(u: Who, trashId: string) {
  if (!UUID_RE.test(trashId)) return { status: 404, error: "Not found" };
  const t = (await query(`SELECT src, item_id, deleted_by::text deleted_by FROM library_trash WHERE id=$1`, [trashId])).rows[0];
  if (!t || !(u.role === "admin" || t.deleted_by === u.id)) return { status: 404, error: "غير موجود" };
  await query(`DELETE FROM library_trash WHERE id=$1`, [trashId]);
  if (t.src === "lib") await query(`DELETE FROM library_files WHERE id=$1 AND deleted_at IS NOT NULL`, [t.item_id]);
  await query(`INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'purge','library_file',$2,$3)`, [u.id, t.item_id, JSON.stringify({ src: t.src })]);
  return { status: 200, ok: true };
}
