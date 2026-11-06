import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { levers, normWeights, scorecard, seasonalWeights, suggestGoals, validateGoals, type Goals } from "@/lib/fin-goals";
import { loadGoals } from "@/lib/fin-cfo";

const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const today = riyadhToday();
  const year = Number(new URL(req.url).searchParams.get("year") || today.slice(0, 4));
  if (!(year >= 2024 && year <= 2100)) return NextResponse.json({ error: "سنة غير صحيحة" }, { status: 400 });
  const inp = await loadInput(today);
  const fixedMonthly = inp.fixed.reduce((s, f) => s + f.monthly_amount, 0);
  const last12From = `${addDays(`${today.slice(0, 7)}-01`, -365).slice(0, 7)}-01`, last12To = addDays(`${today.slice(0, 7)}-01`, -1);
  const last12 = computeFinance(inp, last12From, last12To);
  const prevYear = computeFinance(inp, `${year - 1}-01-01`, `${year - 1}-12-31`);
  const sug = suggestGoals(last12, fixedMonthly, inp.settings.target_gross_margin);
  const goals = await loadGoals(year);
  const yFin = computeFinance(inp, `${year}-01-01`, `${year}-12-31`);
  const meta = await query<{ updated_at: string }>("SELECT updated_at::text FROM fin_goals WHERE year=$1", [year]);
  return NextResponse.json({ year, today, goals, updated_at: meta.rows[0]?.updated_at || null, suggestion: sug.goals, basis: sug.basis,
    seasonal: seasonalWeights(prevYear.monthly), scorecard: goals ? scorecard(goals, year, yFin, today) : null, preview: scorecard(goals || sug.goals, year, yFin, today),
    levers: levers(yFin.baseline), baseline: yFin.baseline, years: (await query<{ year: number }>("SELECT year FROM fin_goals ORDER BY year")).rows.map(r => r.year) });
}

export async function PUT(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const b = await req.json().catch(() => null) as { year?: unknown; goals?: Partial<Goals> } | null;
  const year = Number(b?.year); if (!(year >= 2024 && year <= 2100) || !b?.goals) return NextResponse.json({ error: "طلب غير صحيح" }, { status: 400 });
  const err = validateGoals(b.goals); if (err) return NextResponse.json({ error: err }, { status: 400 });
  const g: Goals = { sales: Number(b.goals.sales), gross_margin: Number(b.goals.gross_margin), opex_month: Number(b.goals.opex_month), collection_rate: Number(b.goals.collection_rate), dso_days: Number(b.goals.dso_days), weights: normWeights(b.goals.weights) };
  await query(`INSERT INTO fin_goals(year, data, updated_by) VALUES($1,$2,$3) ON CONFLICT (year) DO UPDATE SET data=EXCLUDED.data, updated_by=EXCLUDED.updated_by, updated_at=now()`, [year, JSON.stringify(g), u.id]);
  await query("INSERT INTO audit_logs(actor_id, action, entity, entity_id, details) VALUES($1,'update','fin_goals',$2,$3)", [u.id, String(year), JSON.stringify(g)]).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
