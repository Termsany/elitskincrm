import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { riyadhToday } from "@/lib/riyadh-day";
import { UUID_RE } from "@/lib/fmt";
import { rankedDoctors } from "@/lib/doctor-suggest";

/** After a visit with no planned visit left today: the doctor who most needs a visit, preferring the same city. */
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const after = new URL(req.url).searchParams.get("after") || "";
  const ranked = (await rankedDoctors(u.id, riyadhToday()).catch(() => [])).filter(d => !d.paused && d.id !== after && d.days_since !== 0 && d.prio.score >= 20);
  const here = UUID_RE.test(after) ? ranked.find(d => d.id === after) : undefined;
  const city = (await import("@/lib/db")).query<{ city: string | null }>("SELECT city FROM doctors WHERE id=$1", [UUID_RE.test(after) ? after : "00000000-0000-0000-0000-000000000000"]);
  const c = here?.city ?? (await city).rows[0]?.city ?? null;
  const pick = ranked.find(d => c && (d.city || "").trim().toLowerCase() === c.trim().toLowerCase()) || ranked[0];
  return NextResponse.json({ next: pick ? { doctor_id: pick.id, doctor_name: pick.name, clinic_name: pick.clinic_name || "", reason: pick.prio.reason, product_id: null } : null });
}
