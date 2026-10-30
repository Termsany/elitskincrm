import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { visitDetail } from "@/lib/visit-intel";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const d = await visitDetail((await params).id);
  return d ? NextResponse.json(d) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
