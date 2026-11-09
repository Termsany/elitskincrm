import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { riyadhToday } from "@/lib/riyadh-day";
import { adminPriorities } from "@/lib/admin-priorities";

export const dynamic = "force-dynamic";
export async function GET() {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await adminPriorities(riyadhToday(), u.id, !!u.manager), { headers: { "cache-control": "private, no-store" } });
}
