import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getReportRows, parseReportFilters } from "@/lib/report-extra";
import { UUID_RE, riyadhToday } from "@/lib/fmt";
import { rankedDoctors } from "@/lib/doctor-suggest";

// Doctors to drag onto a day, ranked like the doctors page (follow-ups, overdue, opportunities). Admin without a rep: the team's overdue list.
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const repId = u.role === "admin" ? (new URL(req.url).searchParams.get("repId") || "") : u.id;
  if (!UUID_RE.test(repId)) {
    const rows = await getReportRows("overdue", parseReportFilters(new URLSearchParams()));
    return NextResponse.json({ doctors: rows.slice(0, 60) });
  }
  const ranked = (await rankedDoctors(repId, riyadhToday())).filter(d => !d.paused && d.prio.score >= 10).slice(0, 60);
  return NextResponse.json({ doctors: ranked.map(d => ({ doctor_id: d.id, doctor_name: d.name, classification: d.classification || "", clinic_name: d.clinic_name, city: d.city,
    days_since: d.days_since, gap_days: d.gap_days || 0, reason: d.prio.reason, icon: d.prio.icon })) });
}
