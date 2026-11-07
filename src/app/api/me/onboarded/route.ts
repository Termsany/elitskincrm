import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

/** The rep finished (or skipped) the first-login tour; DELETE shows it again. */
export async function POST() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await query("UPDATE users SET onboarded_at=COALESCE(onboarded_at, now()) WHERE id=$1", [u.id]);
  return NextResponse.json({ ok: true });
}
export async function DELETE() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await query("UPDATE users SET onboarded_at=NULL WHERE id=$1", [u.id]);
  return NextResponse.json({ ok: true });
}
