import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { enrichedVisits, summarize, periodRange, planAdherence } from "@/lib/visit-intel";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const { from, to } = periodRange(sp.get("period") || "week", sp.get("from"), sp.get("to"));
  const f = { from, to, repId: sp.get("repId") || "", doctorId: sp.get("doctorId") || "", q: sp.get("q") || "", cls: sp.get("cls") || "", productId: sp.get("productId") || "", reaction: sp.get("reaction") || "", planned: sp.get("planned") || "", band: sp.get("band") || "", flag: sp.get("flag") || "", status: sp.get("status") || "" };
  const visits = await enrichedVisits(f);
  const all = Object.values({ ...f, from: "", to: "", repId: "" }).some(Boolean) ? await enrichedVisits({ from, to, repId: f.repId }) : visits;
  const adherence = await planAdherence(from, to, f.repId);
  return NextResponse.json({ from, to, visits, summary: summarize(visits), overall: summarize(all).kpi, adherence });
}
