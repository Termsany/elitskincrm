import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { UUID_RE } from "@/lib/fmt";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const newPassword = () => Array.from({ length: 12 }, () => CHARS[randomInt(CHARS.length)]).join("");

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const r = await query(`SELECT r.id, r.requested_at, u.name, u.email, u.role::text role FROM password_reset_requests r JOIN users u ON u.id=r.user_id WHERE r.handled_at IS NULL ORDER BY r.requested_at`);
  return NextResponse.json({ requests: r.rows });
}

/** { id, action: "reset" } sets a fresh password (returned once) and ends that user's sessions; { id, action: "dismiss" } just closes the request. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null) as { id?: string; action?: string } | null;
  const id = String(body?.id || "");
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const r = await query<{ user_id: string }>("SELECT user_id FROM password_reset_requests WHERE id=$1 AND handled_at IS NULL", [id]);
  const row = r.rows[0];
  if (!row) return NextResponse.json({ error: "الطلب اتقفل قبل كده" }, { status: 404 });
  if (body?.action === "dismiss") {
    await query("UPDATE password_reset_requests SET handled_at=now(), handled_by=$2, outcome='dismissed' WHERE id=$1", [id, user.id]);
    return NextResponse.json({ ok: true });
  }
  if (body?.action !== "reset") return NextResponse.json({ error: "bad action" }, { status: 400 });
  const password = newPassword();
  const hash = await hashPassword(password);
  await query("UPDATE users SET password_hash=$1 WHERE id=$2", [hash, row.user_id]);
  await query("DELETE FROM sessions WHERE user_id=$1", [row.user_id]);
  await query("UPDATE password_reset_requests SET handled_at=now(), handled_by=$2, outcome='reset' WHERE id=$1", [id, user.id]);
  return NextResponse.json({ ok: true, password });
}
