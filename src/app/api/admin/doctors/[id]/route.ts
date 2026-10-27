import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(()=>null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const allowed = ["name","clinic_name","city","specialty","classification","phone","status"] as const;
  const sets: string[]=[]; const vals: unknown[]=[]; let i=1;
  for (const k of allowed) if (body[k] !== undefined) { sets.push(`${k}=$${i++}`); vals.push(String(body[k] ?? "").trim()); }
  if (!sets.length) return NextResponse.json({ error: "لا تغييرات" }, { status: 400 });
  vals.push(id);
  await query(`UPDATE doctors SET ${sets.join(", ")} WHERE id=$${i}`, vals);
  return NextResponse.json({ ok: true });
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await query("DELETE FROM doctors WHERE id=$1", [id]);
  return NextResponse.json({ ok: true });
}
