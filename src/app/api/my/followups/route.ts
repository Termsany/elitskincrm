import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { UUID_RE } from "@/lib/fmt";
import { openFollowups, updateFollowup } from "@/lib/followups";

/** The rep's open follow-ups (all, or one doctor's). */
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const d = new URL(req.url).searchParams.get("doctorId") || "";
  if (d && !UUID_RE.test(d)) return NextResponse.json({ error: "طبيب غير صحيح" }, { status: 400 });
  return NextResponse.json({ followups: await openFollowups(u.id, d || undefined) });
}

/** Close or move one follow-up: { source: "visit"|"task", id, action: "done"|"snooze", date? }. */
export async function PATCH(req: Request) {
  const u = await getCurrentUser(); if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null) as { source?: string; id?: string; action?: string; date?: string } | null;
  const source = b?.source === "task" ? "task" : b?.source === "visit" ? "visit" : null, action = b?.action === "done" ? "done" : b?.action === "snooze" ? "snooze" : null;
  if (!source || !action || !UUID_RE.test(String(b?.id || ""))) return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
  if (action === "snooze" && !/^20\d\d-\d\d-\d\d$/.test(String(b?.date || ""))) return NextResponse.json({ error: "اختار تاريخ" }, { status: 400 });
  if (!(await updateFollowup(u.id, source, b!.id!, action, b?.date))) return NextResponse.json({ error: "المتابعة مش موجودة" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
