import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { BROCHURE_MAX, BROCHURE_TYPES, UUID_RE, countPdfPages, syncLegacyBrochure } from "@/lib/product-studio";

async function guard(params: Promise<{ bid: string }>) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const { bid } = await params;
  if (!UUID_RE.test(bid)) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const r = await query<{ product_id: string }>("SELECT product_id FROM product_brochures WHERE id=$1", [bid]);
  if (!r.rows[0]) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { bid, productId: r.rows[0].product_id };
}

// Rename / show-hide a brochure, or replace its file (multipart).
export async function PATCH(req: Request, { params }: { params: Promise<{ bid: string }> }) {
  const g = await guard(params); if ("error" in g) return g.error;
  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "اختر الملف" }, { status: 400 });
    if (file.size > BROCHURE_MAX) return NextResponse.json({ error: "حجم الملف أكبر من 19 ميجابايت" }, { status: 400 });
    if (!BROCHURE_TYPES.includes(file.type)) return NextResponse.json({ error: "الصيغ المسموحة: PDF أو صورة" }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const pages = file.type === "application/pdf" ? await countPdfPages(buf, Number(form.get("pages"))) : 1;
    await query("UPDATE product_brochures SET data=$2, mime=$3, file_name=$4, size_bytes=$5, pages=$6, updated_at=now() WHERE id=$1",
      [g.bid, buf, file.type, file.name.slice(0, 200), buf.length, pages]);
  } else {
    const body = await req.json().catch(() => null) as { title?: string; active?: boolean } | null;
    if (!body) return NextResponse.json({ error: "Invalid" }, { status: 400 });
    const sets: string[] = [], vals: unknown[] = [g.bid];
    if (typeof body.title === "string") { vals.push(body.title.trim().slice(0, 120)); sets.push(`title=$${vals.length}`); }
    if (typeof body.active === "boolean") { vals.push(body.active); sets.push(`active=$${vals.length}`); }
    if (!sets.length) return NextResponse.json({ error: "لا تغييرات" }, { status: 400 });
    await query(`UPDATE product_brochures SET ${sets.join(",")}, updated_at=now() WHERE id=$1`, vals);
  }
  await query("UPDATE products SET content_updated_at=now() WHERE id=$1", [g.productId]);
  await syncLegacyBrochure(g.productId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ bid: string }> }) {
  const g = await guard(params); if ("error" in g) return g.error;
  await query("DELETE FROM product_brochures WHERE id=$1", [g.bid]);
  await syncLegacyBrochure(g.productId);
  return NextResponse.json({ ok: true });
}
