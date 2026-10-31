import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { syncIfStale } from "@/lib/daftra";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { cleanPlan, type CatalogRow, type PlanCost } from "@/lib/plan";

/** Monthly sales planner (admin only). Plans live in the CRM only — Daftra is read, never written. */
const MONTH = /^20\d\d-(0[1-9]|1[0-2])$/;
const lastDay = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const shift = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const r2 = (n: number) => Math.round(n * 100) / 100;
async function admin() { const u = await getCurrentUser(); return u && u.role === "admin" ? u : null; }

export async function GET(req: Request) {
  if (!await admin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const month = new URL(req.url).searchParams.get("month") || "";
  if (!MONTH.test(month)) return NextResponse.json({ error: "شهر غير صحيح" }, { status: 400 });
  await syncIfStale(60);
  const today = riyadhToday(), cur = today.slice(0, 7);
  const inp = await loadInput(today);
  // history = last 6 complete months before the current month
  const baseFrom = `${shift(cur, -6)}-01`, baseTo = lastDay(shift(cur, -1));
  const H = computeFinance(inp, baseFrom, baseTo);
  const M = month <= cur ? computeFinance(inp, `${month}-01`, month === cur ? today : lastDay(month)) : null;
  const mm = new Map((M?.pricing || []).map(p => [p.key, p]));
  const catalog: CatalogRow[] = H.pricing.map(p => ({ key: p.key, name: p.name, avg_cost: p.avg_cost, last_cost: p.last_cost, price: p.realized_price, list_price: p.list_price,
    hist_qty: r2(p.qty_sold / 6), stock: p.stock, d_qty: mm.get(p.key)?.qty_sold || 0, d_price: mm.get(p.key)?.realized_price ?? null }));
  // Daftra 6-month average spend per operating-expense account — a starting point for the cost list
  const daftraCosts: PlanCost[] = H.expensesByAccount.filter(a => a.treatment === "opex" && a.amount / 6 >= 50).map(a => ({
    id: `d${a.account_id ?? "x"}`, name: a.name, kind: /رواتب|أجور|اجور|تأمينات|تامينات/.test(a.name) ? "salary" as const : "expense" as const, planned: Math.round(a.amount / 6), actual: null }));
  const fixed: PlanCost[] = inp.fixed.filter(f => `${month}-01` >= f.start_month.slice(0, 10) && (!f.end_month || `${month}-01` <= f.end_month.slice(0, 10)))
    .map(f => ({ id: `f${f.id}`, name: f.name, kind: f.category === "salaries" ? "salary" as const : "expense" as const, planned: f.monthly_amount, actual: null }));
  const [saved, list] = await Promise.all([query("SELECT data, updated_at FROM fin_plans WHERE month=$1", [month]), query("SELECT month FROM fin_plans ORDER BY month DESC LIMIT 36")]);
  return NextResponse.json({ month, today, plan: saved.rows[0]?.data ?? null, updated_at: saved.rows[0]?.updated_at ?? null, catalog, fixed, daftraCosts,
    saved_months: list.rows.map(r => r.month), history: { from: baseFrom, to: baseTo }, target_net_margin: inp.settings.target_net_margin, has_daftra_month: !!M });
}

export async function PUT(req: Request) {
  const u = await admin(); if (!u) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as { month?: string; data?: unknown } | null;
  if (!b || !MONTH.test(String(b.month || ""))) return NextResponse.json({ error: "شهر غير صحيح" }, { status: 400 });
  const data = cleanPlan(b.data);
  await query("INSERT INTO fin_plans(month, data, updated_by, updated_at) VALUES($1,$2,$3,now()) ON CONFLICT (month) DO UPDATE SET data=EXCLUDED.data, updated_by=EXCLUDED.updated_by, updated_at=now()", [b.month, JSON.stringify(data), u.id]);
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: Request) {
  if (!await admin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const month = new URL(req.url).searchParams.get("month") || "";
  if (!MONTH.test(month)) return NextResponse.json({ error: "شهر غير صحيح" }, { status: 400 });
  await query("DELETE FROM fin_plans WHERE month=$1", [month]);
  return NextResponse.json({ ok: true });
}
