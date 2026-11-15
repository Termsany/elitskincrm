import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

const DAY = /^20\d\d-\d\d-\d\d$/;
const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
const admin = async () => { const u = await getCurrentUser(); return u && u.role === "admin" && !u.manager ? u : null; };

export async function GET() {
  if (!(await admin())) return forbid();
  const r = await query("SELECT target_gross_margin::float8, target_net_margin::float8, books_start::text, cash_balance::float8, cash_as_of::text FROM fin_settings WHERE id=1");
  return NextResponse.json(r.rows[0] || {});
}

/** Any of: target margins (both together), books start (a date, or null for "count everything"). */
export async function PUT(req: Request) {
  const u = await admin(); if (!u) return forbid();
  const b = await req.json().catch(() => null) as { target_gross_margin?: unknown; target_net_margin?: unknown; books_start?: unknown } | null;
  if (!b) return NextResponse.json({ error: "طلب غير صحيح" }, { status: 400 });
  if (b.target_gross_margin !== undefined || b.target_net_margin !== undefined) {
    const g = Number(b.target_gross_margin), n = Number(b.target_net_margin);
    if (!(g >= 5 && g <= 90) || !(n >= 0 && n <= 60) || n >= g) return NextResponse.json({ error: "قيم غير منطقية (صافي الربح لازم يكون أقل من مجمل الربح)" }, { status: 400 });
    await query("UPDATE fin_settings SET target_gross_margin=$1, target_net_margin=$2, updated_at=now() WHERE id=1", [g, n]);
  }
  if (b.books_start !== undefined) {
    const v = b.books_start === null || b.books_start === "" ? null : String(b.books_start);
    if (v !== null && !DAY.test(v)) return NextResponse.json({ error: "تاريخ غير صحيح" }, { status: 400 });
    await query("UPDATE fin_settings SET books_start=$1, updated_at=now() WHERE id=1", [v]);
    await query("INSERT INTO audit_logs(actor_id, action, entity, entity_id) VALUES($1,'books_start_change','fin_settings',$1)", [u.id]).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
