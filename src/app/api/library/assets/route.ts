import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await query(`SELECT id, kind, name, mime_type, is_default, created_at FROM document_assets WHERE owner_id=$1 AND active ORDER BY kind, is_default DESC, created_at DESC`, [u.id]);
  return NextResponse.json({ assets: r.rows, canStamp: u.role === "admin" });
}
/** Signature drawn on the pad (JSON data URL) or an uploaded PNG/JPG signature/stamp (multipart). */
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let kind = "", name = "", data: Buffer | null = null, mime = "", isDefault = false;
  if ((req.headers.get("content-type") || "").includes("application/json")) {
    const b = await req.json().catch(() => null) as { kind?: string; name?: string; dataUrl?: string; is_default?: boolean } | null;
    const m = String(b?.dataUrl || "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
    kind = String(b?.kind || "signature"); name = String(b?.name || "").trim(); isDefault = !!b?.is_default;
    if (m) { data = Buffer.from(m[1], "base64"); mime = "image/png"; }
  } else {
    const f = await req.formData().catch(() => null);
    const file = f?.get("file");
    kind = String(f?.get("kind") || ""); name = String(f?.get("name") || "").trim(); isDefault = f?.get("is_default") === "true";
    if (file instanceof File && file.size) { data = Buffer.from(await file.arrayBuffer()); mime = file.type; }
  }
  if (!["signature", "stamp"].includes(kind) || !data) return NextResponse.json({ error: "البيانات غير مكتملة" }, { status: 400 });
  if (kind === "stamp" && u.role !== "admin") return NextResponse.json({ error: "الختم متاح للإدارة فقط" }, { status: 403 });
  if (data.length > 2 * 1024 * 1024) return NextResponse.json({ error: "الحجم لازم يكون أقل من 2MB" }, { status: 400 });
  const png = data.subarray(0, 8).equals(PNG), jpg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (!png && !jpg) return NextResponse.json({ error: "استخدم صورة PNG أو JPG" }, { status: 400 });
  mime = png ? "image/png" : "image/jpeg";
  const existing = (await query(`SELECT count(*)::int n FROM document_assets WHERE owner_id=$1 AND kind=$2 AND active`, [u.id, kind])).rows[0].n as number;
  if (existing >= 12) return NextResponse.json({ error: "الحد 12 لكل نوع — احذف قديم الأول" }, { status: 400 });
  if (isDefault || existing === 0) { isDefault = true; await query(`UPDATE document_assets SET is_default=false WHERE owner_id=$1 AND kind=$2`, [u.id, kind]); }
  const r = await query(`INSERT INTO document_assets(owner_id,kind,name,mime_type,data,is_default) VALUES($1,$2,$3,$4,$5,$6) RETURNING id, kind, name, mime_type, is_default, created_at`,
    [u.id, kind, (name || (kind === "stamp" ? "ختم" : "توقيعي")).slice(0, 60), mime, data, isDefault]);
  return NextResponse.json({ asset: r.rows[0] }, { status: 201 });
}
