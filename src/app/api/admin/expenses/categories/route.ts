import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE } from "@/lib/ids";
import { categories } from "@/lib/expenses";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ categories: await categories(true) });
}

/** PATCH { id, monthly_cap: number|null, receipt_required_above: number, active: boolean } */
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b.id !== "string" || !UUID_RE.test(b.id)) return NextResponse.json({ error: "بند غير صحيح" }, { status: 400 });
  const cap = b.monthly_cap === null || b.monthly_cap === "" ? null : Number(b.monthly_cap);
  const rec = Number(b.receipt_required_above ?? 0);
  if ((cap !== null && (!Number.isFinite(cap) || cap < 0)) || !Number.isFinite(rec) || rec < 0 || typeof b.active !== "boolean") return NextResponse.json({ error: "قيم غير صحيحة" }, { status: 400 });
  await query("UPDATE expense_categories SET monthly_cap=$2, receipt_required_above=$3, active=$4 WHERE id=$1", [b.id, cap, rec, b.active]);
  await query("INSERT INTO audit_logs(actor_id, action, entity, entity_id, details) VALUES($1,'update','expense_category',$2,$3)", [user.id, b.id, JSON.stringify({ cap, rec, active: b.active })]);
  return NextResponse.json({ ok: true });
}
