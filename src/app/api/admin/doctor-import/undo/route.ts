import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { pool } from "@/lib/db";
import { UUID_RE } from "@/lib/fmt";
import { undoSnapshot, type Snapshot } from "@/lib/doctor-import-apply";

/** Undo the latest Excel doctor upload (only the latest one, and only once). Admin only. */
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin" || u.manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as { id?: string } | null;
  if (!b || !UUID_RE.test(b.id || "")) return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE doctors IN SHARE ROW EXCLUSIVE MODE");
    const last = (await client.query<{ id: string; snapshot: Snapshot; undone_at: string | null }>("SELECT id, snapshot, undone_at FROM doctor_imports ORDER BY created_at DESC LIMIT 1 FOR UPDATE")).rows[0];
    if (!last || last.id !== b.id) { await client.query("ROLLBACK"); return NextResponse.json({ error: "التراجع متاح لآخر رفع بس" }, { status: 409 }); }
    if (last.undone_at) { await client.query("ROLLBACK"); return NextResponse.json({ error: "الرفع ده اتراجع عنه قبل كده" }, { status: 409 }); }
    const result = await undoSnapshot(client, last.snapshot);
    await client.query("UPDATE doctor_imports SET undone_at=now(), undone_by=$2 WHERE id=$1", [last.id, u.id]);
    await client.query("INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'import_undo','doctors',$2,$3)", [u.id, last.id, JSON.stringify(result)]);
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("doctor import undo failed", e);
    return NextResponse.json({ error: "تعذر التراجع — مفيش حاجة اتغيرت" }, { status: 500 });
  } finally { client.release(); }
}
