/** Compact Daftra picture for the admin dashboard (read-only mirror; nothing is written to Daftra). */
import { query } from "@/lib/db";
import { daftraConfigured, syncIfStale, syncRunning } from "@/lib/daftra";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { cleanPlan, computePlan } from "@/lib/plan";

const r2 = (n: number) => Math.round(n * 100) / 100;
const shift = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
const lastDay = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };

export async function daftraPulse() {
  if (!daftraConfigured()) return { configured: false as const };
  void syncIfStale(60); // background refresh only — the dashboard never waits on Daftra
  const today = riyadhToday(), m = today.slice(0, 7), day = Number(today.slice(8, 10));
  const pm = shift(m, -1), pmDay = `${pm}-${String(Math.min(day, Number(lastDay(pm).slice(8, 10)))).padStart(2, "0")}`;
  const [inp, sync, plan] = await Promise.all([loadInput(today), query("SELECT finished_at, ok FROM daftra_sync WHERE id=1"), query("SELECT data FROM fin_plans WHERE month=$1", [m])]);
  const Y = computeFinance(inp, `${shift(m, -11)}-01`, today);
  const M = computeFinance(inp, `${m}-01`, today);
  const P = computeFinance(inp, `${pm}-01`, pmDay);
  const old = (Y.ar.buckets["61-90"] || 0) + (Y.ar.buckets["90+"] || 0);
  const pl = plan.rows[0] ? computePlan(cleanPlan(plan.rows[0].data)).t : null;
  const daysIn = Number(lastDay(m).slice(8, 10));
  return {
    configured: true as const, today, month: m, day, days_in_month: daysIn,
    sync: { at: sync.rows[0]?.finished_at ?? null, ok: sync.rows[0]?.ok ?? null, running: syncRunning() },
    mtd: { sales: M.kpi.sales, gross: M.kpi.gross, margin: M.kpi.gross_margin, invoices: M.kpi.invoices, clients: M.kpi.clients, collected: M.kpi.collected },
    prev: { sales: P.kpi.sales, gross: P.kpi.gross, invoices: P.kpi.invoices },
    run_rate: day ? r2(M.kpi.sales / day * daysIn) : 0,
    series: Y.monthly.map(x => ({ m: String(x.m), sales: Number(x.sales), gross: Number(x.gross), net: Number(x.net), collected: Number(x.collected) })),
    year: { sales: Y.kpi.sales, gross: Y.kpi.gross, margin: Y.kpi.gross_margin, net: Y.kpi.net },
    ar: { total: Y.ar.total, overdue: Y.ar.overdue, old60: r2(old), top: Y.ar.parties.slice(0, 3).map(p => ({ name: p.name, unpaid: p.unpaid, days: p.oldestDue })) },
    ap: { total: Y.ap.total, overdue: Y.ap.overdue },
    top_products: M.salesByProduct.slice(0, 5).map(p => ({ name: p.name, qty: p.qty, net: p.net, margin: p.margin })),
    top_clients: M.salesByClient.slice(0, 3).map(c => ({ name: c.name, net: c.net })),
    plan: pl && { target_revenue: pl.target_revenue, target_profit: pl.target_profit, be_revenue: pl.be_revenue },
    alert: Y.advice.find(a => a.level === "danger") || null,
  };
}
export type DaftraPulse = Awaited<ReturnType<typeof daftraPulse>>;
