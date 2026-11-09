import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { riyadhToday } from "@/lib/riyadh-day";
import { adminKpis } from "@/lib/admin-priorities";

export const dynamic = "force-dynamic";
const P = new Set(["today", "week", "month", "quarter"]);
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const p = new URL(req.url).searchParams.get("period") || "month";
  return NextResponse.json(await adminKpis(P.has(p) ? p : "month", riyadhToday(), !!u.manager), { headers: { "cache-control": "private, no-store" } });
}
