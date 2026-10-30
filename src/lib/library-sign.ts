import { PDFDocument, StandardFonts, rgb, degrees, type PDFPage } from "pdf-lib";
import { query, pool } from "@/lib/db";
import { readLibraryFile, sha256, cleanName, type Who } from "@/lib/library";
import { fulfillInTx } from "@/lib/sign-requests";
const VERIFY_HOST = process.env.PUBLIC_HOST || "crm.eliteskinsa.com";

/** A placement as the user drew it on the page preview: fractions (0..1) of the displayed page, top-left origin. */
export type Placement = { asset_id: string; page: number; x: number; y: number; w: number; h: number; allPages?: boolean };

/** Map a box drawn on the displayed (possibly rotated) page to unrotated PDF coordinates + image rotation. */
function place(page: PDFPage, p: { x: number; y: number; w: number; h: number }) {
  const box = page.getCropBox();
  const W = box.width, H = box.height, ox = box.x, oy = box.y;
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  if (rot === 90) return { x: ox + (p.y + p.h) * W, y: oy + p.x * H, width: p.w * H, height: p.h * W, rotate: degrees(90) };
  if (rot === 180) return { x: ox + (1 - p.x) * W, y: oy + (p.y + p.h) * H, width: p.w * W, height: p.h * H, rotate: degrees(180) };
  if (rot === 270) return { x: ox + (1 - p.y - p.h) * W, y: oy + (1 - p.x) * H, width: p.w * H, height: p.h * W, rotate: degrees(270) };
  return { x: ox + p.x * W, y: oy + (1 - p.y - p.h) * H, width: p.w * W, height: p.h * H, rotate: degrees(0) };
}

async function toPdf(data: Buffer, mime: string) {
  if (mime === "application/pdf") return PDFDocument.load(data);
  if (mime !== "image/png" && mime !== "image/jpeg") throw new Error("type");
  const pdf = await PDFDocument.create();
  const img = mime === "image/png" ? await pdf.embedPng(data) : await pdf.embedJpg(data);
  const scale = Math.min(1, 595 / img.width, 842 / img.height) || 1;
  const page = pdf.addPage([img.width * scale, img.height * scale]);
  page.drawImage(img, { x: 0, y: 0, width: img.width * scale, height: img.height * scale });
  return pdf;
}

export async function signDocument(u: Who, src: string, id: string, placements: Placement[], opts: { footer: boolean; visibility: string; name?: string; requestId?: string }) {
  if (opts.requestId && u.role !== "admin") return { status: 403, error: "Forbidden" };
  if (!placements.length || placements.length > 40) return { status: 400, error: "ضع توقيع أو ختم واحد على الأقل" };
  for (const p of placements) {
    if (![p.page, p.x, p.y, p.w, p.h].every(Number.isFinite) || p.page < 1 || p.x < 0 || p.y < 0 || p.w <= 0.01 || p.h <= 0.005 || p.x + p.w > 1.001 || p.y + p.h > 1.001)
      return { status: 400, error: "مكان التوقيع خارج حدود الصفحة" };
  }
  const file = await readLibraryFile(u, src, id);
  if (!file) return { status: 404, error: "الملف غير موجود أو غير مسموح لك" };
  let pdf: PDFDocument;
  try { pdf = await toPdf(file.data, file.mime); }
  catch { return { status: 415, error: "التوقيع متاح لملفات PDF والصور (JPG/PNG) فقط" }; }
  const ids = [...new Set(placements.map(p => p.asset_id))];
  const assets = (await query(`SELECT id::text id, kind, name, mime_type, data FROM document_assets WHERE id = ANY($1::uuid[]) AND owner_id=$2 AND active`, [ids, u.id])).rows as Array<{ id: string; kind: string; name: string; mime_type: string; data: Buffer }>;
  if (assets.length !== ids.length) return { status: 400, error: "التوقيع أو الختم غير موجود" };
  if (u.role !== "admin" && assets.some(a => a.kind === "stamp")) return { status: 403, error: "الختم متاح للإدارة فقط" };
  const embedded = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();
  for (const a of assets) {
    try { embedded.set(a.id, a.mime_type === "image/png" ? await pdf.embedPng(a.data) : await pdf.embedJpg(a.data)); }
    catch { return { status: 400, error: `صورة "${a.name}" غير صالحة` }; }
  }
  const pages = pdf.getPages();
  const used = new Set<number>();
  for (const p of placements) {
    const targets = p.allPages ? pages.map((_, i) => i) : [p.page - 1];
    for (const i of targets) {
      if (!pages[i]) return { status: 400, error: "رقم الصفحة غير موجود" };
      pages[i].drawImage(embedded.get(p.asset_id)!, place(pages[i], p));
      used.add(i);
    }
  }
  const ref = crypto.randomUUID().slice(0, 8).toUpperCase();
  const when = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(",", "");
  if (opts.footer) {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const i of used) {
      const pg = pages[i]; const at = place(pg, { x: 0.03, y: 0.982, w: 0.6, h: 0.008 });
      pg.drawText(`Signed via Elite Skin CRM ${when} (Riyadh) - Ref ${ref} - verify: ${VERIFY_HOST}/verify?ref=${ref}`, { x: at.x, y: at.y, rotate: at.rotate, size: 6.5, font, color: rgb(0.35, 0.4, 0.45) });
    }
  }
  pdf.setModificationDate(new Date());
  pdf.setProducer("Elite Skin CRM");
  const out = Buffer.from(await pdf.save());
  const hash = sha256(out);
  const base = cleanName(opts.name || file.name).replace(/\.(pdf|png|jpe?g)$/i, "");
  const name = `${base} - موقّع.pdf`;
  const meta = { ref, signed_at: new Date().toISOString(), signer: u.name, source: { src, id, name: file.name }, placements: placements.map(p => ({ ...p, kind: assets.find(a => a.id === p.asset_id)?.kind })), sha256: hash };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(`INSERT INTO library_files(owner_id,name,folder,description,mime,size_bytes,data,sha256,visibility,signed,source_kind,source_id,sign_meta,shared_with)
      VALUES($1,$2,'المستندات الموقعة',$3,'application/pdf',$4,$5,$6,$7,true,$8,$9,$10,$11) RETURNING id`,
      [u.id, name, `${placements.some(p => assets.find(a => a.id === p.asset_id)?.kind === "stamp") ? "مختوم" : "موقّع"} بواسطة ${u.name} · Ref ${ref}`, out.length, out, hash, opts.visibility === "team" ? "team" : "private", src, id, JSON.stringify(meta), file.ownerId && file.ownerId !== u.id ? file.ownerId : null]);
    if (opts.requestId && !(await fulfillInTx(client, u, opts.requestId, src, id, r.rows[0].id))) { await client.query("ROLLBACK"); return { status: 409, error: "طلب التوقيع اتقفل أو مش مطابق للملف" }; }
    await client.query(`INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'sign','library_file',$2,$3)`, [u.id, r.rows[0].id, JSON.stringify({ ref, src, id, sha256: hash, placements: placements.length })]);
    if (!opts.requestId && file.ownerId && file.ownerId !== u.id) await client.query(`INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,entity_type,entity_id) VALUES($1,NULL,'document_signed',$2,$3,'library_file',$4)`, [file.ownerId, `${u.name} وقّع/ختم مستند: ${file.name}`, `/library?file=${r.rows[0].id}`, r.rows[0].id]);
    await client.query("COMMIT");
    return { status: 201, id: r.rows[0].id as string, ref, sha256: hash, name };
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}
