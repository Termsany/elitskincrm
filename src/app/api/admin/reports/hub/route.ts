import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { riyadhToday } from "@/lib/riyadh-day";
import { parseHub, reportHub, VIEWS, type View } from "@/lib/report-hub";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams, view = (VIEWS.includes(sp.get("view") as View) ? sp.get("view") : "summary") as View;
  const today = riyadhToday();
  try { return NextResponse.json({ view, filters: parseHub(sp, today), data: await reportHub(view, parseHub(sp, today), today, !!u.manager) }); }
  catch (e) { console.error("report hub", view, e); return NextResponse.json({ error: "تعذر تحميل التقرير" }, { status: 500 }); }
}
