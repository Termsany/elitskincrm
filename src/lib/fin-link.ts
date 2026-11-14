import { query } from "@/lib/db";
import { computeFinance, type Input } from "@/lib/finance";
import { scorecard } from "@/lib/fin-goals";
import { loadGoals } from "@/lib/fin-cfo";
import { cleanPlan, computePlan } from "@/lib/plan";

const r0 = (n: number) => Math.round(n);

/**
 * One picture that ties the four parts of the page together for the current month:
 * sales so far → the annual goal's target for this month → the saved month plan → what customers still owe.
 * (Always "now", independent of the period chosen on the page.)
 */
export async function financeLink(inp: Input, today: string) {
  const year = Number(today.slice(0, 4)), month = today.slice(0, 7);
  const day = Number(today.slice(8, 10)), days = new Date(Date.UTC(year, Number(today.slice(5, 7)), 0)).getUTCDate();
  const yFin = computeFinance(inp, `${year}-01-01`, `${year}-12-31`);
  const cur = yFin.monthly.find(m => String(m.m) === month);
  const sales = r0(Number(cur?.sales || 0)), collected = r0(Number(cur?.collected || 0));
  const projected = day > 0 ? r0(sales / day * days) : 0;

  const g = await loadGoals(year).catch(() => null);
  const sc = g ? scorecard(g, year, yFin, today) : null;
  const goals = sc ? {
    year_target: r0(sc.plan.months.reduce((s, m) => s + m.sales, 0)), year_actual: sc.year_actual, run_rate: sc.run_rate,
    month_target: sc.current?.target ?? 0, month_pct: sc.current?.target ? r0(sales / sc.current.target * 100) : null,
    projected_pct: sc.current?.pct ?? null, needed_per_day: sc.current?.needed_per_day ?? 0,
  } : null;

  const saved = (await query<{ data: unknown }>("SELECT data FROM fin_plans WHERE month=$1", [month]).catch(() => ({ rows: [] }))).rows[0];
  let plan = null as null | { revenue: number; profit: number; break_even: number | null; fixed: number; pieces: number; pct: number | null };
  if (saved) { const t = computePlan(cleanPlan(saved.data)).t; plan = { revenue: r0(t.plan_revenue), profit: r0(t.plan_profit), break_even: t.be_revenue === null ? null : r0(t.be_revenue), fixed: r0(t.fixed), pieces: r0(t.plan_pieces), pct: t.plan_revenue ? r0(sales / t.plan_revenue * 100) : null }; }

  const old60 = r0((yFin.ar.buckets["61-90"] || 0) + (yFin.ar.buckets["90+"] || 0));
  const month_net = r0(Number(cur?.net || 0));
  return {
    month, day, days, pace_pct: r0(day / days * 100),
    sales: { mtd: sales, projected, collected, net: month_net },
    goals, plan,
    ar: { total: r0(yFin.ar.total), overdue: r0(yFin.ar.overdue), old60, clients: yFin.ar.parties.filter(p => p.overdue > 0).length },
    // what collecting the overdue money would mean against this month's gap to target
    gap_to_target: goals && goals.month_target > sales ? goals.month_target - sales : 0,
  };
}
export type FinLink = Awaited<ReturnType<typeof financeLink>>;
