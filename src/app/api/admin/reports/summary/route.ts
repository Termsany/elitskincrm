import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getReportSummary, parseReportFilters } from "@/lib/report-extra";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const f = parseReportFilters(new URL(req.url).searchParams);
  return NextResponse.json(await getReportSummary(f));
}
