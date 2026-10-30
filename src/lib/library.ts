import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { sniffUpload } from "@/lib/upload-sniff";

export type Who = { id: string; role: string; name: string };
export const SOURCES = ["lib", "brochure", "visit", "task", "request", "request_signed"] as const;
export type Src = typeof SOURCES[number];
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_UPLOAD = 15 * 1024 * 1024;

/** Every file in the app the user is allowed to see, as one virtual table. $1 = user id, $2 = is admin. */
const UNION = `
  SELECT 'lib'::text src, l.id::text id, l.name, l.mime, l.size_bytes::bigint size, l.created_at, l.owner_id::text owner_id, u.name owner_name,
    l.folder, l.description, l.visibility, l.signed, l.source_kind, l.source_id,
    CASE WHEN l.signed THEN 'نسخة موقعة / مختومة' ELSE 'المكتبة · ' || l.folder END ctx, NULL::text ctx_url
  FROM library_files l JOIN users u ON u.id=l.owner_id
  WHERE l.deleted_at IS NULL AND ($2::boolean OR l.visibility='team' OR l.owner_id=$1::uuid OR l.shared_with=$1::uuid)
  UNION ALL
  SELECT 'brochure', b.id::text, b.file_name, b.mime, b.size_bytes::bigint, b.created_at, NULL, 'إدارة المنتجات',
    'بروشورات المنتجات', COALESCE(NULLIF(b.title,''), p.name), 'team', false, NULL, NULL,
    'بروشور · ' || p.name, CASE WHEN $2::boolean THEN '/admin/products' ELSE '/products' END
  FROM product_brochures b JOIN products p ON p.id=b.product_id
  WHERE ($2::boolean OR (b.active AND p.active))
  UNION ALL
  SELECT 'visit', a.id::text, a.file_name, a.mime_type, a.size_bytes::bigint, a.created_at, v.sales_rep_id::text, u.name,
    'مرفقات الزيارات', '', 'private', false, 'visit', v.id::text,
    'زيارة · ' || d.name || ' · ' || to_char(v.visited_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD'), CASE WHEN $2::boolean THEN '/visits' ELSE '/visits/log' END
  FROM visit_attachments a JOIN visits v ON v.id=a.visit_id JOIN users u ON u.id=v.sales_rep_id JOIN doctors d ON d.id=v.doctor_id
  WHERE ($2::boolean OR v.sales_rep_id=$1::uuid)
  UNION ALL
  SELECT 'task', a.id::text, a.file_name, a.mime_type, a.size_bytes::bigint, a.created_at, t.created_by::text, COALESCE(u.name,'—'),
    'مرفقات المهام', '', 'private', false, 'task', t.id::text, 'مهمة · ' || t.title, '/tasks'
  FROM task_attachments a JOIN tasks t ON t.id=a.task_id LEFT JOIN users u ON u.id=t.created_by
  WHERE ($2::boolean OR t.created_by=$1::uuid OR t.assigned_to=$1::uuid OR EXISTS(SELECT 1 FROM task_assignees x WHERE x.task_id=t.id AND x.user_id=$1::uuid))
  UNION ALL
  SELECT 'request', r.id::text, COALESCE(r.file_name,'document'), COALESCE(r.file_mime,'application/octet-stream'), octet_length(r.file_data)::bigint, r.created_at, r.requester_id::text, u.name,
    'مرفقات الطلبات', r.title, 'private', false, 'request', r.id::text, 'طلب · ' || r.title,
    CASE WHEN $2::boolean THEN '/admin/requests?request=' ELSE '/requests?request=' END || r.id::text
  FROM service_requests r JOIN users u ON u.id=r.requester_id
  WHERE r.file_data IS NOT NULL AND ($2::boolean OR r.requester_id=$1::uuid)
  UNION ALL
  SELECT 'request_signed', r.id::text, COALESCE(r.signed_file_name,'signed.pdf'), COALESCE(r.signed_file_mime,'application/pdf'), octet_length(r.signed_file_data)::bigint, COALESCE(r.signed_at, r.updated_at), r.requester_id::text, u.name,
    'مرفقات الطلبات', r.title, 'private', true, 'request', r.id::text, 'طلب موقّع · ' || r.title,
    CASE WHEN $2::boolean THEN '/admin/requests?request=' ELSE '/requests?request=' END || r.id::text
  FROM service_requests r JOIN users u ON u.id=r.requester_id
  WHERE r.signed_file_data IS NOT NULL AND ($2::boolean OR r.requester_id=$1::uuid)`;

export type LibFilter = { q?: string; src?: string; type?: string; folder?: string; scope?: string; sort?: string };

export async function listLibrary(u: Who, f: LibFilter) {
  const vals: unknown[] = [u.id, u.role === "admin"];
  const w: string[] = [];
  const add = (sql: string, v: unknown) => { vals.push(v); w.push(sql.replaceAll("$?", `$${vals.length}`)); };
  if (f.q?.trim()) add(`(x.name || ' ' || COALESCE(x.description,'') || ' ' || x.ctx || ' ' || COALESCE(x.owner_name,'')) ILIKE $?`, `%${f.q.trim()}%`);
  if (f.src === "signed") w.push("x.signed");
  else if (f.src === "request") w.push("x.src IN ('request','request_signed')");
  else if (f.src && (SOURCES as readonly string[]).includes(f.src)) add("x.src=$?", f.src);
  if (f.folder) add("x.src='lib' AND x.folder=$?", f.folder);
  if (f.scope === "mine") w.push("x.owner_id=$1::uuid::text");
  if (f.type === "pdf") w.push("x.mime='application/pdf'");
  else if (f.type === "image") w.push("x.mime LIKE 'image/%'");
  else if (f.type === "office") w.push("(x.mime LIKE '%officedocument%' OR x.mime IN ('application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint','text/csv'))");
  const order = f.sort === "name" ? "x.name" : f.sort === "size" ? "x.size DESC NULLS LAST" : f.sort === "old" ? "x.created_at" : "x.created_at DESC";
  const rows = (await query(`SELECT * FROM (${UNION}) x ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY ${order} LIMIT 400`, vals)).rows;
  const counts = (await query(`SELECT x.src, count(*)::int n, count(*) FILTER (WHERE x.signed)::int signed, count(*) FILTER (WHERE x.owner_id=$1::uuid::text)::int mine, COALESCE(sum(x.size),0)::bigint bytes FROM (${UNION}) x GROUP BY x.src`, [u.id, u.role === "admin"])).rows;
  const folders = (await query(`SELECT folder, count(*)::int n FROM library_files WHERE deleted_at IS NULL AND NOT signed AND ($2::boolean OR visibility='team' OR owner_id=$1::uuid) GROUP BY folder ORDER BY folder`, [u.id, u.role === "admin"])).rows;
  return { files: rows, counts, folders };
}

export type FileBytes = { name: string; mime: string; data: Buffer; ownerId: string | null; libVisibility?: string };

/** Loads one file's bytes after checking the user may read it. */
export async function readLibraryFile(u: Who, src: string, id: string): Promise<FileBytes | null> {
  if (!UUID_RE.test(id)) return null;
  const admin = u.role === "admin";
  if (src === "lib") {
    const r = (await query(`SELECT name, mime, data, owner_id::text owner_id, visibility, shared_with::text shared_with FROM library_files WHERE id=$1 AND deleted_at IS NULL`, [id])).rows[0];
    if (!r || !(admin || r.visibility === "team" || r.owner_id === u.id || r.shared_with === u.id)) return null;
    return { name: r.name, mime: r.mime, data: r.data, ownerId: r.owner_id, libVisibility: r.visibility };
  }
  if (src === "brochure") {
    const r = (await query(`SELECT b.file_name, b.mime, b.data FROM product_brochures b JOIN products p ON p.id=b.product_id WHERE b.id=$1 AND ($2::boolean OR (b.active AND p.active))`, [id, admin])).rows[0];
    return r ? { name: r.file_name, mime: r.mime, data: r.data, ownerId: null } : null;
  }
  if (src === "visit" || src === "task") {
    const r = src === "visit"
      ? (await query(`SELECT a.file_name, a.file_path, a.mime_type, v.sales_rep_id::text owner FROM visit_attachments a JOIN visits v ON v.id=a.visit_id WHERE a.id=$1 AND ($2::boolean OR v.sales_rep_id=$3::uuid)`, [id, admin, u.id])).rows[0]
      : (await query(`SELECT a.file_name, a.file_path, a.mime_type, t.created_by::text owner FROM task_attachments a JOIN tasks t ON t.id=a.task_id WHERE a.id=$1 AND ($2::boolean OR t.created_by=$3::uuid OR t.assigned_to=$3::uuid OR EXISTS(SELECT 1 FROM task_assignees x WHERE x.task_id=t.id AND x.user_id=$3::uuid))`, [id, admin, u.id])).rows[0];
    if (!r) return null;
    try { return { name: r.file_name, mime: r.mime_type, data: await readFile(String(r.file_path)), ownerId: r.owner }; } catch { return null; }
  }
  if (src === "request" || src === "request_signed") {
    const signed = src === "request_signed";
    const r = (await query(`SELECT ${signed ? "signed_file_name n, signed_file_mime m, signed_file_data d" : "file_name n, file_mime m, file_data d"}, requester_id::text owner FROM service_requests WHERE id=$1 AND ($2::boolean OR requester_id=$3::uuid)`, [id, admin, u.id])).rows[0];
    if (!r?.d) return null;
    return { name: r.n || "document", mime: r.m || "application/octet-stream", data: r.d, ownerId: r.owner };
  }
  return null;
}

const OFFICE: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword", xls: "application/vnd.ms-excel", ppt: "application/vnd.ms-powerpoint",
};
/** Real type from bytes (+ extension for office/text formats, which share container signatures). */
export function detectType(buf: Buffer, fileName: string): string | null {
  const s = sniffUpload(buf);
  if (s) return s.mime;
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  const zip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  const ole = buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (zip && ["docx", "xlsx", "pptx"].includes(ext)) return OFFICE[ext];
  if (ole && ["doc", "xls", "ppt"].includes(ext)) return OFFICE[ext];
  if (["csv", "txt"].includes(ext) && !buf.subarray(0, 4096).includes(0)) return ext === "csv" ? "text/csv" : "text/plain";
  return null;
}
export const cleanName = (n: string) => (n || "file").replace(/[\\/\0\r\n<>:"|?*]/g, "_").trim().slice(0, 160) || "file";
export const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
export const cleanFolder = (f: unknown) => String(f || "").replace(/[\r\n\t]/g, " ").trim().slice(0, 60) || "عام";
