import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { riyadhToday } from "@/lib/riyadh-day";

/** Cards hidden with "بعدين" today (Riyadh day); they come back tomorrow. */
export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const s = (await query<{ s: { date?: string; ids?: string[] } }>("SELECT dash_snooze s FROM users WHERE id=$1", [u.id])).rows[0]?.s;
  return NextResponse.json({ ids: s?.date === riyadhToday() && Array.isArray(s.ids) ? s.ids : [] }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null) as { ids?: unknown } | null;
  const ids = Array.isArray(b?.ids) ? b!.ids.filter((x): x is string => typeof x === "string" && /^[a-z0-9_-]{1,30}$/i.test(x)).slice(0, 20) : [];
  await query("UPDATE users SET dash_snooze=$2 WHERE id=$1", [u.id, JSON.stringify({ date: riyadhToday(), ids })]);
  return NextResponse.json({ ok: true });
}
