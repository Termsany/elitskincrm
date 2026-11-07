import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

const KINDS = new Set(["reorder", "promise"]);
const REASONS = new Set(["visited", "later", "not_mine"]);
/** Hide one suggestion for N days (1–90). */
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null) as { kind?: string; ref?: string; days?: number; reason?: string } | null;
  const days = Math.round(Number(b?.days));
  if (!b?.kind || !KINDS.has(b.kind) || !b.ref || String(b.ref).length > 80 || !(days >= 1 && days <= 90)) return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
  const reason = REASONS.has(String(b.reason)) ? String(b.reason) : "later";
  await query(`INSERT INTO smart_dismissals(user_id, kind, ref, until, reason) VALUES($1,$2,$3,(now() AT TIME ZONE 'Asia/Riyadh')::date + $4::int,$5)
    ON CONFLICT (user_id, kind, ref) DO UPDATE SET until=EXCLUDED.until, reason=EXCLUDED.reason, created_at=now()`, [u.id, b.kind, String(b.ref), days, reason]);
  return NextResponse.json({ ok: true });
}
/** Undo. */
export async function DELETE(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null) as { kind?: string; ref?: string } | null;
  if (!b?.kind || !b.ref) return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
  await query("DELETE FROM smart_dismissals WHERE user_id=$1 AND kind=$2 AND ref=$3", [u.id, b.kind, String(b.ref)]);
  return NextResponse.json({ ok: true });
}
