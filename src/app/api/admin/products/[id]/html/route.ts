import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { badId, validIds } from "@/lib/ids";
import { HTML_MAX, checkHtmlUpload } from "@/lib/product-html";

type Ctx = { params: Promise<{ id: string }> };
const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
const META = "file_name,title,size_bytes,sha256,warnings,updated_at,created_at";

// Upload or replace the product's HTML file (multipart field "file").
export async function POST(req: Request, { params }: Ctx) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return forbidden();
  const p = await params; if (!validIds(p)) return badId();
  const len = Number(req.headers.get("content-length") || 0);
  if (len > HTML_MAX + 64 * 1024) return NextResponse.json({ error: "حجم الملف أكبر من 2 ميجابايت" }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "اختار ملف HTML" }, { status: 400 });
  if (file.size > HTML_MAX) return NextResponse.json({ error: "حجم الملف أكبر من 2 ميجابايت" }, { status: 413 });
  const check = checkHtmlUpload(file.name, Buffer.from(await file.arrayBuffer()));
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  const exists = await query("SELECT 1 FROM products WHERE id=$1", [p.id]);
  if (!exists.rowCount) return NextResponse.json({ error: "المنتج مش موجود" }, { status: 404 });
  try {
    const r = await query<{ inserted: boolean }>(`INSERT INTO product_html_files(product_id,file_name,title,size_bytes,sha256,data,warnings,uploaded_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (product_id) DO UPDATE SET file_name=EXCLUDED.file_name,title=EXCLUDED.title,size_bytes=EXCLUDED.size_bytes,
          sha256=EXCLUDED.sha256,data=EXCLUDED.data,warnings=EXCLUDED.warnings,uploaded_by=EXCLUDED.uploaded_by,updated_at=now()
        RETURNING (xmax = 0) inserted`,
      [p.id, check.fileName, check.title, check.size, check.sha256, check.data, check.warnings, u.id]);
    const replaced = !r.rows[0]?.inserted;
    await query("UPDATE products SET content_updated_at=now() WHERE id=$1", [p.id]);
    await query(`INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,$2,'product',$3,$4)`,
      [u.id, replaced ? "html_replace" : "html_upload", p.id, `${check.fileName} · ${check.size} bytes`]).catch(() => undefined);
    const meta = await query(`SELECT ${META} FROM product_html_files WHERE product_id=$1`, [p.id]);
    return NextResponse.json({ ok: true, replaced, file: meta.rows[0] }, { status: replaced ? 200 : 201 });
  } catch (e) {
    console.error("product html save failed", e);
    return NextResponse.json({ error: "تعذر حفظ الملف — حاول تاني" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return forbidden();
  const p = await params; if (!validIds(p)) return badId();
  const r = await query<{ file_name: string }>("DELETE FROM product_html_files WHERE product_id=$1 RETURNING file_name", [p.id]);
  if (!r.rowCount) return NextResponse.json({ error: "مفيش ملف HTML للمنتج ده" }, { status: 404 });
  await query("UPDATE products SET content_updated_at=now() WHERE id=$1", [p.id]);
  await query(`INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'html_delete','product',$2,$3)`,
    [u.id, p.id, r.rows[0].file_name]).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
