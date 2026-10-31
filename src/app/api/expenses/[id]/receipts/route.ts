import { NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { badId, validIds } from "@/lib/ids";
import { sniffUpload } from "@/lib/upload-sniff";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/elite-crm-uploads";
const MAX_BYTES = 10 * 1024 * 1024, MAX_FILES = 5;

/** Attach a receipt (photo or PDF) to one of the rep's own pending expenses. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validIds(await params)) return badId();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const e = await query("SELECT rep_id, status FROM expenses WHERE id=$1", [id]);
  if (!e.rows[0]) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  if (e.rows[0].rep_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (e.rows[0].status !== "pending") return NextResponse.json({ error: "المصروف اتراجع بالفعل" }, { status: 409 });
  const form = await req.formData().catch(() => null); const file = form?.get("file");
  if (!(file instanceof File) || file.size <= 0) return NextResponse.json({ error: "الملف مطلوب" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "الملف كبير (10MB max)" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer()); const kind = sniffUpload(buf);
  if (!kind) return NextResponse.json({ error: "المسموح: صور (JPG/PNG/HEIC/WEBP) أو PDF" }, { status: 415 });
  const n = await query("SELECT count(*)::int n FROM expense_receipts WHERE expense_id=$1", [id]);
  if ((n.rows[0]?.n ?? 0) >= MAX_FILES) return NextResponse.json({ error: `الحد الأقصى ${MAX_FILES} إيصالات` }, { status: 400 });
  const dir = path.join(UPLOAD_DIR, "expenses", id); await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${randomUUID()}.${kind.ext}`); await writeFile(filePath, buf);
  try {
    const name = (file.name || "receipt").replace(/[\\/\0\r\n]/g, "_").slice(0, 150);
    const r = await query("INSERT INTO expense_receipts(expense_id, file_name, file_path, mime_type, size_bytes) VALUES($1,$2,$3,$4,$5) RETURNING id", [id, name, filePath, kind.mime, buf.length]);
    return NextResponse.json({ id: r.rows[0].id }, { status: 201 });
  } catch (error) { await unlink(filePath).catch(() => undefined); throw error; }
}
