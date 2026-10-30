import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { todayBoard } from "@/lib/visit-intel";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await todayBoard(), { headers: { "cache-control": "no-store" } });
}
