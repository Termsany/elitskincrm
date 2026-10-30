import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listChangeRequests } from "@/lib/agenda";

export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ requests: await listChangeRequests(u) });
}
