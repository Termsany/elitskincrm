import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { REPORT_ORDER, findReport } from "@/lib/report-extra";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ reports: REPORT_ORDER.map(findReport).filter(Boolean) });
}
