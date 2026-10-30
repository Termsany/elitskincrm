import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE } from "@/lib/product-studio";

// Brochure file for presenting. Admins may also preview inactive brochures/products.
export async function GET(_req: Request, { params }: { params: Promise<{ bid: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { bid } = await params;
  if (!UUID_RE.test(bid)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = u.role === "admin";
  const r = await query<{ data: Buffer; mime: string; file_name: string; updated_at: string }>(
    `SELECT b.data, b.mime, b.file_name, b.updated_at FROM product_brochures b JOIN products p ON p.id=b.product_id
     WHERE b.id=$1 ${admin ? "" : "AND b.active AND p.active"}`, [bid]);
  const b = r.rows[0];
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(b.data as unknown as BodyInit, {
    headers: {
      "content-type": b.mime, "content-length": String(b.data.length),
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(b.file_name)}`,
      "cache-control": "private, max-age=600",
      etag: `"${new Date(b.updated_at).getTime()}"`,
    },
  });
}
