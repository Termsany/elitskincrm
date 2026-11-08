import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { riyadhToday } from "@/lib/riyadh-day";
import { teamWeek } from "@/lib/plan-week";
import { currentWeekStart, weekday } from "@/lib/plan-week-core";

/** Admin: the whole team's week, what needs a decision, and smart suggestions. */
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const s = new URL(req.url).searchParams.get("start") || ""; const today = riyadhToday();
  const start = /^20\d\d-\d\d-\d\d$/.test(s) && weekday(s) === 0 ? s : currentWeekStart(today);
  return NextResponse.json(await teamWeek(start, today));
}
