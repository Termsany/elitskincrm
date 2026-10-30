import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { BROCHURE_MAX, BROCHURE_TYPES, UUID_RE, countPdfPages, syncLegacyBrochure } from "@/lib/product-studio";

// Upload a brochure (PDF or image). Client sends the page count it read with pdf.js.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "اختر ملف البروشور" }, { status: 400 });
  if (file.size > BROCHURE_MAX) return NextResponse.json({ error: "حجم الملف أكبر من 19 ميجابايت" }, { status: 400 });
  if (!BROCHURE_TYPES.includes(file.type)) return NextResponse.json({ error: "الصيغ المسموحة: PDF أو صورة JPG / PNG / WEBP" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (file.type === "application/pdf" && buf.subarray(0, 5).toString() !== "%PDF-") return NextResponse.json({ error: "الملف ليس PDF سليم" }, { status: 400 });
  const pages = file.type === "application/pdf" ? await countPdfPages(buf, Number(form?.get("pages"))) : 1;
  const title = String(form?.get("title") || file.name.replace(/\.[a-z0-9]+$/i, "")).trim().slice(0, 120);
  const p = await query("SELECT 1 FROM products WHERE id=$1", [id]);
  if (!p.rowCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = await query(`INSERT INTO product_brochures(product_id,title,file_name,mime,data,size_bytes,pages,sort_order)
    VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE((SELECT max(sort_order)+1 FROM product_brochures WHERE product_id=$1),0)) RETURNING id`,
    [id, title, file.name.slice(0, 200), file.type, buf, buf.length, pages]);
  await syncLegacyBrochure(id);
  return NextResponse.json({ id: r.rows[0].id }, { status: 201 });
}
