import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await query("DELETE FROM targets WHERE id=$1", [id]);
  return NextResponse.json({ ok: true });
}
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(()=>null) as Record<string, unknown>|null;
  if (!body) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const sets:string[]=[]; const vals:unknown[]=[]; let i=1;
  if (body.target_value !== undefined) { sets.push(`target_value=$${i++}`); vals.push(Number(body.target_value)); }
  if (body.period_start !== undefined) { sets.push(`period_start=$${i++}`); vals.push(String(body.period_start)); }
  if (body.period_end !== undefined) { sets.push(`period_end=$${i++}`); vals.push(String(body.period_end)); }
  if (!sets.length) return NextResponse.json({ error: "لا تغييرات" }, { status: 400 });
  vals.push(id);
  await query(`UPDATE targets SET ${sets.join(",")} WHERE id=$${i}`, vals);
  return NextResponse.json({ ok: true });
}
