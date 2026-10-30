import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE } from "@/lib/product-studio";

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null) as { ids?: string[]; productId?: string } | null;
  const ids = (body?.ids || []).filter(id => UUID_RE.test(id));
  if (!ids.length) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  // Reorder products, or the brochures of one product when productId is given.
  if (body?.productId && UUID_RE.test(body.productId))
    await query("UPDATE product_brochures b SET sort_order=x.i, updated_at=now() FROM unnest($1::uuid[]) WITH ORDINALITY x(id,i) WHERE b.id=x.id AND b.product_id=$2", [ids, body.productId]);
  else
    await query("UPDATE products p SET sort_order=x.i FROM unnest($1::uuid[]) WITH ORDINALITY x(id,i) WHERE p.id=x.id", [ids]);
  if (body?.productId) await (await import("@/lib/product-studio")).syncLegacyBrochure(body.productId);
  return NextResponse.json({ ok: true });
}
