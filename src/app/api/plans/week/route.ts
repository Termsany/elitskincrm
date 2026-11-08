import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { riyadhToday } from "@/lib/riyadh-day";
import { repWeek } from "@/lib/plan-week";
import { currentWeekStart, weekday } from "@/lib/plan-week-core";
import { UUID_RE } from "@/lib/fmt";

const DAY_RE = /^20\d\d-\d\d-\d\d$/;

/** One rep's week (rep: own; admin: ?repId). ?start= a Sunday, defaults to the current week. */
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams; const today = riyadhToday();
  const rep = u.role === "admin" ? sp.get("repId") || "" : u.id;
  if (!UUID_RE.test(rep)) return NextResponse.json({ error: "اختار المندوب" }, { status: 400 });
  const s = sp.get("start") || ""; const start = DAY_RE.test(s) && weekday(s) === 0 ? s : currentWeekStart(today);
  return NextResponse.json(await repWeek(rep, start, today));
}
