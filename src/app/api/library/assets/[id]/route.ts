import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE } from "@/lib/library";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = (await query(`SELECT mime_type, data FROM document_assets WHERE id=$1 AND owner_id=$2`, [id, u.id])).rows[0];
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(r.data), { headers: { "content-type": r.mime_type, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
}
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => ({})) as { is_default?: boolean; name?: string };
  const a = UUID_RE.test(id) ? (await query(`SELECT kind FROM document_assets WHERE id=$1 AND owner_id=$2 AND active`, [id, u.id])).rows[0] : null;
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (b.is_default) { await query(`UPDATE document_assets SET is_default=(id=$1) WHERE owner_id=$2 AND kind=$3`, [id, u.id, a.kind]); }
  if (typeof b.name === "string" && b.name.trim()) await query(`UPDATE document_assets SET name=$1 WHERE id=$2`, [b.name.trim().slice(0, 60), id]);
  return NextResponse.json({ ok: true });
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = await query(`UPDATE document_assets SET active=false, is_default=false WHERE id=$1 AND owner_id=$2 RETURNING kind`, [id, u.id]);
  if (!r.rowCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await query(`UPDATE document_assets SET is_default=true WHERE id=(SELECT id FROM document_assets WHERE owner_id=$1 AND kind=$2 AND active ORDER BY created_at DESC LIMIT 1) AND NOT EXISTS(SELECT 1 FROM document_assets WHERE owner_id=$1 AND kind=$2 AND active AND is_default)`, [u.id, r.rows[0].kind]);
  return NextResponse.json({ ok: true });
}
