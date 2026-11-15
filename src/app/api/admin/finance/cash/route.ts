import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { cashForecast } from "@/lib/fin-cash";

const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const today = riyadhToday(); const inp = await loadInput(today);
  const fin = computeFinance(inp, `${today.slice(0, 7)}-01`, today);
  const s = (await query<{ cash_balance: number | null; cash_as_of: string | null }>("SELECT cash_balance::float8, cash_as_of::text FROM fin_settings WHERE id=1")).rows[0];
  const includeNew = new URL(req.url).searchParams.get("new") === "1";
  return NextResponse.json({ today, cash_balance: s?.cash_balance ?? null, cash_as_of: s?.cash_as_of ?? null, vat_period: fin.kpi.vat_payable,
    forecast: cashForecast(fin, inp, s?.cash_balance ?? 0, { includeNew }) });
}

/** Opening cash (bank + treasury) entered by the admin — Daftra balances aren't mirrored. */
export async function PUT(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const b = await req.json().catch(() => null) as { cash_balance?: unknown } | null;
  const v = Number(b?.cash_balance);
  if (!Number.isFinite(v) || Math.abs(v) > 1e10) return NextResponse.json({ error: "اكتب رصيد صحيح" }, { status: 400 });
  await query("UPDATE fin_settings SET cash_balance=$1, cash_as_of=(now() AT TIME ZONE 'Asia/Riyadh')::date, updated_at=now() WHERE id=1", [v]);
  return NextResponse.json({ ok: true });
}
