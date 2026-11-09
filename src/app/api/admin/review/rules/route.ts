import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { getRules } from "@/lib/visit-review";

export const dynamic = "force-dynamic";
export async function GET() {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getRules());
}
/** Change when a visit counts as needing review. Full admin only. */
export async function PUT(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin" || u.manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const n = (k: string, lo: number, hi: number) => { const x = Math.round(Number(b?.[k])); return x >= lo && x <= hi ? x : null; };
  const min_notes = n("min_notes", 0, 200), far_m = n("far_m", 50, 20000), days = n("days", 1, 60);
  if (min_notes === null) return NextResponse.json({ error: "طول الملاحظات من 0 لـ 200 حرف", field: "min_notes" }, { status: 400 });
  if (far_m === null) return NextResponse.json({ error: "المسافة من 50 متر لـ 20 كم", field: "far_m" }, { status: 400 });
  if (days === null) return NextResponse.json({ error: "الفترة من يوم لـ 60 يوم", field: "days" }, { status: 400 });
  await query(`UPDATE review_rules SET min_notes=$1, far_m=$2, days=$3 WHERE id=1`, [min_notes, far_m, days]);
  return NextResponse.json({ min_notes, far_m, days });
}
