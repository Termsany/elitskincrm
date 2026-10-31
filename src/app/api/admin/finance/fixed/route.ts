import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE } from "@/lib/ids";

/** CRM-only planned fixed monthly costs. Never sent to Daftra. */
const MONTH = /^20\d\d-(0[1-9]|1[0-2])$/;
const CATS = ["rent", "salaries", "insurance", "subscriptions", "marketing", "transport", "government", "utilities", "other"];
function parse(b: Record<string, unknown> | null) {
  if (!b) throw new Error("بيانات غير صحيحة");
  const name = String(b.name || "").trim().slice(0, 80); if (name.length < 2) throw new Error("اكتب اسم المصروف");
  const amount = Number(String(b.monthly_amount ?? "").replace(/,/g, "")); if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) throw new Error("المبلغ غير صحيح");
  const category = CATS.includes(String(b.category)) ? String(b.category) : "other";
  const start = String(b.start_month || ""); if (!MONTH.test(start)) throw new Error("شهر البداية غير صحيح");
  const end = b.end_month ? String(b.end_month) : ""; if (end && (!MONTH.test(end) || end < start)) throw new Error("شهر النهاية غير صحيح");
  return { name, amount: Math.round(amount * 100) / 100, category, start: `${start}-01`, end: end ? `${end}-01` : null, notes: String(b.notes || "").slice(0, 300) };
}
async function guard() { const u = await getCurrentUser(); return u && u.role === "admin" ? u : null; }
const bad = (e: unknown) => NextResponse.json({ error: (e as Error).message || "خطأ" }, { status: 400 });

export async function POST(req: Request) {
  const u = await guard(); if (!u) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { const x = parse(await req.json().catch(() => null));
    const r = await query("INSERT INTO fin_fixed_expenses(name, category, monthly_amount, start_month, end_month, notes, created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [x.name, x.category, x.amount, x.start, x.end, x.notes, u.id]);
    return NextResponse.json({ id: r.rows[0].id }, { status: 201 });
  } catch (e) { return bad(e); }
}
export async function PATCH(req: Request) {
  const u = await guard(); if (!u) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b.id !== "string" || !UUID_RE.test(b.id)) return NextResponse.json({ error: "غير موجود" }, { status: 400 });
  try { const x = parse(b);
    await query("UPDATE fin_fixed_expenses SET name=$2, category=$3, monthly_amount=$4, start_month=$5, end_month=$6, notes=$7, updated_at=now() WHERE id=$1", [b.id, x.name, x.category, x.amount, x.start, x.end, x.notes]);
    return NextResponse.json({ ok: true });
  } catch (e) { return bad(e); }
}
export async function DELETE(req: Request) {
  const u = await guard(); if (!u) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "غير موجود" }, { status: 400 });
  await query("DELETE FROM fin_fixed_expenses WHERE id=$1", [id]);
  return NextResponse.json({ ok: true });
}
