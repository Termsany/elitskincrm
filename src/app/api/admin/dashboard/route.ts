import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { adminDashboard } from "@/lib/admin-dashboard";

export const dynamic = "force-dynamic";
export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await adminDashboard(u.name || ""), { headers: { "cache-control": "private, no-store" } });
}
