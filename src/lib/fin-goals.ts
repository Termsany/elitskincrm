import type { computeFinance } from "@/lib/finance";

/** Annual financial goals: suggestion, monthly split and actual-vs-target tracking. Pure. */
export type Goals = {
  sales: number;            // annual net sales (before VAT)
  gross_margin: number;     // % of sales
  opex_month: number;       // monthly operating-expense budget (salaries, rent, marketing…)
  collection_rate: number;  // % of invoiced (incl. VAT) collected
  dso_days: number;         // max average days to collect
  weights: number[];        // 12 monthly shares, sum = 1
};
type Fin = ReturnType<typeof computeFinance>;
const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
export const VAT = 0.15;

export function normWeights(w: unknown): number[] {
  const a = Array.isArray(w) && w.length === 12 ? w.map(Number).map(x => (Number.isFinite(x) && x > 0 ? x : 0)) : Array(12).fill(1);
  const s = a.reduce((x, y) => x + y, 0) || 12;
  return a.map(x => (s ? x / s : 1 / 12));
}

export function validateGoals(g: Partial<Goals>): string | null {
  if (!(Number(g.sales) > 0 && Number(g.sales) < 1e10)) return "اكتب هدف مبيعات سنوي صحيح";
  if (!(Number(g.gross_margin) > 0 && Number(g.gross_margin) < 95)) return "هامش مجمل الربح لازم يكون بين 1% و 95%";
  if (!(Number(g.opex_month) >= 0 && Number(g.opex_month) < 1e9)) return "ميزانية المصروفات الشهرية غير صحيحة";
  if (!(Number(g.collection_rate) > 0 && Number(g.collection_rate) <= 100)) return "نسبة التحصيل لازم تكون بين 1% و 100%";
  if (!(Number(g.dso_days) > 0 && Number(g.dso_days) <= 365)) return "مدة التحصيل لازم تكون بين 1 و 365 يوم";
  return null;
}

/** What the last 12 months say, and a realistic stretch target built on them. */
export function suggestGoals(last12: Fin, fixedMonthly: number, targetGross: number) {
  const months = last12.monthly.filter(m => Number(m.sales) > 0 || Number(m.opex) > 0).length || 1;
  const annual = last12.kpi.sales / months * 12;
  const gm = last12.kpi.sales > 0 ? last12.kpi.gross / last12.kpi.sales * 100 : 45;
  const opex = Math.max(fixedMonthly, last12.kpi.opex / months);
  const gmTarget = Math.min(Math.max(r0(gm), 40), Math.max(r0(targetGross), r0(gm)));
  const breakEvenAnnual = gmTarget > 0 ? opex * 12 / (gmTarget / 100) : 0;
  // grow 20%; reach for break-even + 10% when it's within a 40% jump — beyond that a sales target alone
  // isn't credible, and the plan says so (the gap has to come from costs or prices too)
  const sales = roundTo(Math.max(annual * 1.2, Math.min(breakEvenAnnual * 1.1, annual * 1.4)), 10000);
  const goals: Goals = { sales, gross_margin: gmTarget, opex_month: roundTo(opex, 1000), collection_rate: 85, dso_days: 60, weights: Array(12).fill(1 / 12) };
  return { goals, basis: { months, annual_sales: r0(annual), gross_margin: r1(gm), opex_month: r0(last12.kpi.opex / months), fixed_month: r0(fixedMonthly), net: r0(last12.kpi.net), break_even_annual: r0(breakEvenAnnual) } };
}

/** Seasonal weights from a past year's monthly sales (falls back to equal when the year is thin). */
export function seasonalWeights(monthly: Array<Record<string, number | string>>): number[] {
  const by = Array(12).fill(0);
  for (const m of monthly) by[Number(String(m.m).slice(5, 7)) - 1] += Math.max(0, Number(m.sales));
  const active = by.filter(v => v > 0).length;
  if (active < 9) return Array(12).fill(1 / 12);
  // blend 50/50 with equal so one huge month doesn't dominate the plan
  const s = by.reduce((a, b) => a + b, 0);
  return normWeights(by.map(v => 0.5 * (v / s) + 0.5 / 12));
}

export function planOf(g: Goals) {
  const w = normWeights(g.weights), gm = g.gross_margin / 100;
  const months = w.map((x, i) => { const sales = g.sales * x; return { i, sales: r0(sales), gross: r0(sales * gm), opex: r0(g.opex_month), net: r0(sales * gm - g.opex_month), collect: r0(sales * (1 + VAT) * g.collection_rate / 100) }; });
  const net = months.reduce((s, m) => s + m.net, 0);
  return { months, net: r0(net), net_margin: g.sales ? r1(net / g.sales * 100) : 0, break_even_month: gm > 0 ? r0(g.opex_month / gm) : null };
}

/** Actual vs target by month and year-to-date, with a projection for the current month. */
export function scorecard(g: Goals, year: number, fin: Fin, today: string) {
  const plan = planOf(g);
  const curY = Number(today.slice(0, 4)), curM = Number(today.slice(5, 7));
  const lastClosed = year < curY ? 12 : year > curY ? 0 : curM - 1;  // complete months in the year
  const byM = new Map(fin.monthly.map(m => [Number(String(m.m).slice(5, 7)), m]));
  const rows = plan.months.map((p, i) => {
    const a = byM.get(i + 1); const sales = Number(a?.sales || 0), gross = Number(a?.gross || 0), opex = Number(a?.opex || 0), net = Number(a?.net || 0), collected = Number(a?.collected || 0);
    const state = i + 1 <= lastClosed ? "closed" : year === curY && i + 1 === curM ? "current" : "future";
    return { month: i + 1, state, target: p, actual: { sales: r0(sales), gross: r0(gross), opex: r0(opex), net: r0(net), collected: r0(collected) }, pct: p.sales ? r1(sales / p.sales * 100) : null };
  });
  const sum = (k: "sales" | "gross" | "opex" | "net" | "collected", which: "actual" | "target", upto: number) => rows.filter(r => r.month <= upto).reduce((s, r) => s + Number(which === "actual" ? r.actual[k] : (r.target as Record<string, number>)[k === "collected" ? "collect" : k]), 0);
  const ytdTo = Math.max(lastClosed, 0);
  const ytd = { months: ytdTo,
    sales: { target: r0(sum("sales", "target", ytdTo)), actual: r0(sum("sales", "actual", ytdTo)) },
    gross: { target: r0(sum("gross", "target", ytdTo)), actual: r0(sum("gross", "actual", ytdTo)) },
    opex: { target: r0(sum("opex", "target", ytdTo)), actual: r0(sum("opex", "actual", ytdTo)) },
    net: { target: r0(sum("net", "target", ytdTo)), actual: r0(sum("net", "actual", ytdTo)) },
    collected: { target: r0(sum("collected", "target", ytdTo)), actual: r0(sum("collected", "actual", ytdTo)) } };
  let current = null as null | { month: number; day: number; days: number; sales: number; projected: number; target: number; pct: number | null; needed_per_day: number };
  if (year === curY) {
    const day = Number(today.slice(8, 10)), days = new Date(Date.UTC(curY, curM, 0)).getUTCDate(), r = rows[curM - 1];
    const projected = day > 0 ? r.actual.sales / day * days : 0;
    current = { month: curM, day, days, sales: r.actual.sales, projected: r0(projected), target: r.target.sales, pct: r.target.sales ? r1(projected / r.target.sales * 100) : null, needed_per_day: r0(Math.max(0, r.target.sales - r.actual.sales) / Math.max(1, days - day + 1)) };
  }
  const yearActual = r0(sum("sales", "actual", 12));
  const runRate = ytdTo > 0 ? r0(ytd.sales.actual / ytdTo * 12) : null;
  const gm = ytd.sales.actual > 0 ? r1(ytd.gross.actual / ytd.sales.actual * 100) : null;
  const dso = fin.baseline && fin.baseline.sales_gross > 0 ? r0(fin.kpi.ar / fin.baseline.sales_gross * 30) : null;
  return { plan, rows, ytd, current, year_actual: yearActual, run_rate: runRate, gross_margin_actual: gm, dso };
}

/** Profit levers on a monthly baseline: what 1% of each lever is worth. */
export function levers(B: { sales: number; cogs: number; opex: number; other: number } | null) {
  if (!B || B.sales <= 0) return null;
  const net = B.sales - B.cogs - B.opex + B.other;
  return { net: r0(net), price1: r0(B.sales * 0.01), volume1: r0((B.sales - B.cogs) * 0.01), cost1: r0(B.cogs * 0.01), opex1: r0(B.opex * 0.01) };
}
