import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { findReport, getReportRows, parseReportFilters } from "@/lib/report-extra";

const UI_LIMIT = 1000;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const report = findReport(sp.get("type") || "reps");
  if (!report) return NextResponse.json({ error: "Unknown report" }, { status: 400 });
  const f = parseReportFilters(sp);
  const rows = await getReportRows(report.id, f);
  return NextResponse.json({ report, filters: f, total: rows.length, limited: rows.length > UI_LIMIT, rows: rows.slice(0, UI_LIMIT) });
}
