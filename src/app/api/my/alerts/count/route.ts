import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { alertCount, staleDoctors } from "@/lib/my-alerts";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role === "admin") return NextResponse.json({ count: 0 });
  return NextResponse.json({ count: alertCount(await staleDoctors(user.id)) });
}
