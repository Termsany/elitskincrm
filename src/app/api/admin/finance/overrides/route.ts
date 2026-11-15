import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

/** PUT { account_id, treatment: "opex"|"cogs"|"exclude"|null } — how a Daftra account counts in the CRM P&L only. */
export async function PUT(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as { account_id?: unknown; treatment?: unknown } | null;
  const id = Number(b?.account_id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "حساب غير صحيح" }, { status: 400 });
  if (b?.treatment === null) { await query("DELETE FROM fin_account_overrides WHERE account_id=$1", [id]); return NextResponse.json({ ok: true }); }
  if (!["opex", "cogs", "exclude"].includes(String(b?.treatment))) return NextResponse.json({ error: "تصنيف غير صحيح" }, { status: 400 });
  await query("INSERT INTO fin_account_overrides(account_id, treatment, updated_by) VALUES($1,$2,$3) ON CONFLICT(account_id) DO UPDATE SET treatment=$2, updated_by=$3, updated_at=now()", [id, b!.treatment, u.id]);
  return NextResponse.json({ ok: true });
}
