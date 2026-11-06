import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { alertCount, staleDoctors } from "@/lib/my-alerts";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "admin") return NextResponse.json({ stale: [], count: 0 });
  const stale = await staleDoctors(user.id);
  return NextResponse.json({ stale, count: alertCount(stale) });
}
