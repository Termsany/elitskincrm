import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getReportRows, parseReportFilters } from "@/lib/report-extra";
import { UUID_RE } from "@/lib/agenda";

// Doctors who are due a visit (by A/B/C frequency) — dragged onto a day to plan them.
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const repId = u.role === "admin" ? (new URL(req.url).searchParams.get("repId") || "") : u.id;
  const f = parseReportFilters(new URLSearchParams(UUID_RE.test(repId) ? { repId } : {}));
  const rows = await getReportRows("overdue", f);
  return NextResponse.json({ doctors: rows.slice(0, 60) });
}
