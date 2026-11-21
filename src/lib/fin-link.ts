import { computeFinance, type Input } from "@/lib/finance";
import { salesPace } from "@/lib/smart";

const r0 = (n: number) => Math.round(n);

/**
 * Sales-focused picture for the current month:
 * sales so far → rep pace → what customers still owe.
 * Goals and profit planning now live in المالية.
 */
export async function financeLink(inp: Input, today: string) {
  const year = Number(today.slice(0, 4)), month = today.slice(0, 7);
  const day = Number(today.slice(8, 10)), days = new Date(Date.UTC(year, Number(today.slice(5, 7)), 0)).getUTCDate();
  const yFin = computeFinance(inp, `${year}-01-01`, `${year}-12-31`);
  const cur = yFin.monthly.find(m => String(m.m) === month);
  const sales = r0(Number(cur?.sales || 0)), collected = r0(Number(cur?.collected || 0));
  const projected = day > 0 ? r0(sales / day * days) : 0;

  const pace = (await salesPace(today).catch(() => [])).filter(p => p.target > 0);
  const team = { total: pace.length, on_track: pace.filter(p => (p.pct ?? 0) >= 90).length,
    behind: pace.filter(p => (p.pct ?? 0) < 90).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)).slice(0, 5).map(p => ({ name: p.name, pct: p.pct ?? 0, target: r0(p.target), mtd: r0(p.mtd) })) };
  const old60 = r0((yFin.ar.buckets["61-90"] || 0) + (yFin.ar.buckets["90+"] || 0));
  const month_net = r0(Number(cur?.net || 0));
  return {
    month, day, days, pace_pct: r0(day / days * 100),
    sales: { mtd: sales, projected, collected, net: month_net },
    team,
    ar: { total: r0(yFin.ar.total), overdue: r0(yFin.ar.overdue), old60, clients: yFin.ar.parties.filter(p => p.overdue > 0).length },
  };
}
export type FinLink = Awaited<ReturnType<typeof financeLink>>;
