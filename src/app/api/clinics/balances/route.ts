import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { riyadhToday } from "@/lib/riyadh-day";
import { clinicBalances } from "@/lib/clinic-balances";

/** Open Daftra balance per linked clinic for the clinic cards (same data the doctor page shows; no costs or suppliers). */
export async function GET() {
  const u = await getCurrentUser(); if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ clinics: await clinicBalances(riyadhToday(), u.role === "admin" ? null : u.id).catch(() => []) });
}
