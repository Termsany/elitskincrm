import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { badId, validIds } from "@/lib/ids";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; receiptId: string }> }) {
  if (!validIds(await params)) return badId();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, receiptId } = await params;
  const r = await query("SELECT r.file_name, r.file_path, r.mime_type, e.rep_id FROM expense_receipts r JOIN expenses e ON e.id=r.expense_id WHERE r.id=$1 AND r.expense_id=$2", [receiptId, id]);
  const f = r.rows[0];
  if (!f) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  if (user.role !== "admin" && f.rep_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const bytes = await readFile(String(f.file_path));
    return new NextResponse(new Uint8Array(bytes), { headers: { "content-type": String(f.mime_type), "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(String(f.file_name))}`, "x-content-type-options": "nosniff", "cache-control": "private, max-age=300" } });
  } catch { return NextResponse.json({ error: "الملف غير متاح على الخادم" }, { status: 410 }); }
}
