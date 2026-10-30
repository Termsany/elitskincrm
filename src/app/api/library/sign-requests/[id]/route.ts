import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { decideSignRequest } from "@/lib/sign-requests";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({})) as { action?: string; note?: string };
  const { status, ...body } = await decideSignRequest(u, (await params).id, String(b.action || ""), String(b.note || ""));
  return NextResponse.json(body, { status });
}
