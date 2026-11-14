import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { riyadhToday } from "@/lib/riyadh-day";
import { MONEY_VIEWS, parseHub, reportHub, VIEWS, type View } from "@/lib/report-hub";

export const dynamic = "force-dynamic";

/** One decision report (summary, sales, reps, market, money) on the shared filters. Company money is admin-only (not the sales manager). */
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams, view = (VIEWS.includes(sp.get("view") as View) ? sp.get("view") : "summary") as View;
  if (u.manager && MONEY_VIEWS.includes(view)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const today = riyadhToday();
  try { return NextResponse.json({ view, filters: parseHub(sp, today), data: await reportHub(view, parseHub(sp, today), today, !!u.manager) }); }
  catch (e) { console.error("report hub", view, e); return NextResponse.json({ error: "تعذر تحميل التقرير" }, { status: 500 }); }
}
