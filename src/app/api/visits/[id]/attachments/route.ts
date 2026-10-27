import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { sniffUpload } from "@/lib/upload-sniff";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/elite-crm-uploads";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_VISIT = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }){
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const visit = await query("SELECT sales_rep_id FROM visits WHERE id=$1", [id]);
  if (!visit.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "admin" && visit.rows[0].sales_rep_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const r = await query("SELECT id, file_name, mime_type, size_bytes, created_at FROM visit_attachments WHERE visit_id=$1 ORDER BY created_at", [id]);
  return NextResponse.json({ attachments: r.rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }){
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const v = await query("SELECT sales_rep_id FROM visits WHERE id=$1", [id]);
  if (!v.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "admin" && v.rows[0].sales_rep_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData().catch(()=>null);
  if (!form) return NextResponse.json({ error: "Invalid form" }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "الملف مطلوب" }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ error: "الملف فارغ" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "الملف كبير (10MB max)" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffUpload(buf);
  if (!kind) return NextResponse.json({ error: "نوع الملف غير مدعوم. المسموح: صور (JPG/PNG/HEIC/WEBP) أو PDF" }, { status: 415 });

  const count = await query("SELECT count(*)::int n FROM visit_attachments WHERE visit_id=$1", [id]);
  if ((count.rows[0]?.n ?? 0) >= MAX_FILES_PER_VISIT) return NextResponse.json({ error: "تم الوصول إلى الحد الأقصى للمرفقات لهذه الزيارة" }, { status: 400 });

  const displayName = (file.name || "attachment").replace(/[\\/\0\r\n]/g, "_").slice(0, 150);
  const dir = path.join(UPLOAD_DIR, id);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${randomUUID()}.${kind.ext}`);
  await writeFile(filePath, buf);
  try {
    const inserted = await query("INSERT INTO visit_attachments(visit_id, file_name, file_path, mime_type, size_bytes) VALUES($1,$2,$3,$4,$5) RETURNING id", [id, displayName, filePath, kind.mime, buf.length]);
    return NextResponse.json({ ok: true, id: inserted.rows[0].id }, { status: 201 });
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    throw error;
  }
}
