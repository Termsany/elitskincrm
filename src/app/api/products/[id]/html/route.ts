import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { badId, validIds } from "@/lib/ids";
import { htmlServeHeaders } from "@/lib/product-html";

// Serves the product's HTML file in a locked-down sandbox (see htmlServeHeaders). ?download=1 → attachment.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await params; if (!validIds(p)) return badId();
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await query<{ data: Buffer; file_name: string }>(`SELECT h.data,h.file_name FROM product_html_files h JOIN products pr ON pr.id=h.product_id
      WHERE h.product_id=$1 AND (pr.active OR $2)`, [p.id, u.role === "admin"]);
  const row = r.rows[0];
  if (!row) return NextResponse.json({ error: "مفيش ملف HTML للمنتج ده" }, { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(row.data), { headers: htmlServeHeaders(row.file_name, download) });
}
