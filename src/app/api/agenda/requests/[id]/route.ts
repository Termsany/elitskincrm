import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { reviewChangeRequest, UUID_RE } from "@/lib/agenda";
import { cancelRequest } from "@/lib/plan-changes";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const b = await req.json().catch(() => null) as { status?: string; note?: string } | null;
  if (!UUID_RE.test(id) || !b || !["approved", "rejected"].includes(b.status || "")) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const r = await reviewChangeRequest(u, id, b.status === "approved", String(b.note || "").slice(0, 300));
  const { status, ...body } = r; return NextResponse.json(body, { status });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const r = await cancelRequest(u, id);
  const { status, ...body } = r; return NextResponse.json(body, { status });
}
