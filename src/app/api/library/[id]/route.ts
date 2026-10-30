import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE, cleanName, cleanFolder } from "@/lib/library";
import { deleteItems } from "@/lib/library-trash";

async function own(id: string, uid: string, admin: boolean) {
  if (!UUID_RE.test(id)) return null;
  const r = (await query(`SELECT id, owner_id::text owner_id, signed FROM library_files WHERE id=$1 AND deleted_at IS NULL`, [id])).rows[0];
  return r && (admin || r.owner_id === uid) ? r : null;
}
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = (await query(`SELECT l.id, l.name, l.folder, l.description, l.mime, l.size_bytes, l.sha256, l.visibility, l.signed, l.source_kind, l.source_id, l.sign_meta, l.created_at, l.owner_id::text owner_id, u.name owner_name
    FROM library_files l JOIN users u ON u.id=l.owner_id WHERE l.id=$1 AND l.deleted_at IS NULL AND ($2::boolean OR l.visibility='team' OR l.owner_id=$3::uuid OR l.shared_with=$3::uuid)`, [id, u.role === "admin", u.id])).rows[0];
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const signed = (await query(`SELECT id, name, created_at, sign_meta->>'ref' ref, sign_meta->>'signer' signer FROM library_files WHERE source_kind='lib' AND source_id=$1 AND deleted_at IS NULL AND ($2::boolean OR visibility='team' OR owner_id=$3::uuid OR shared_with=$3::uuid) ORDER BY created_at DESC`, [id, u.role === "admin", u.id])).rows;
  return NextResponse.json({ file: r, signedCopies: signed });
}
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await own(id, u.id, u.role === "admin"))) return NextResponse.json({ error: "مسموح لصاحب الملف أو المدير فقط" }, { status: 403 });
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const sets: string[] = []; const vals: unknown[] = [];
  if (typeof b.name === "string" && b.name.trim()) { vals.push(cleanName(b.name)); sets.push(`name=$${vals.length}`); }
  if (typeof b.folder === "string") { vals.push(cleanFolder(b.folder)); sets.push(`folder=$${vals.length}`); }
  if (typeof b.description === "string") { vals.push(b.description.trim().slice(0, 300)); sets.push(`description=$${vals.length}`); }
  if (b.visibility === "team" || b.visibility === "private") { vals.push(b.visibility); sets.push(`visibility=$${vals.length}`); }
  if (!sets.length) return NextResponse.json({ error: "مفيش تغيير" }, { status: 400 });
  vals.push(id);
  await query(`UPDATE library_files SET ${sets.join(",")}, updated_at=now() WHERE id=$${vals.length}`, vals);
  return NextResponse.json({ ok: true });
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await deleteItems(u, [{ src: "lib", id }]);
  return r.deleted.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "مسموح لصاحب الملف أو المدير فقط" }, { status: 403 });
}
