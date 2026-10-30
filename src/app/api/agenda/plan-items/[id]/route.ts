import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { movePlanItem, DAY_RE, UUID_RE } from "@/lib/agenda";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => null) as { date?: string; note?: string } | null;
  if (!UUID_RE.test(id) || !b || !DAY_RE.test(b.date || "")) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const r = await movePlanItem(u, id, b.date!, String(b.note || "").slice(0, 300));
  const { status, ...body } = r; return NextResponse.json(body, { status });
}
