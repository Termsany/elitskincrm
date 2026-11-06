import type { computeFinance, Input } from "@/lib/finance";

/** 13-week cash-flow forecast. Conservative: only what is already invoiced, plus (optionally) a share of new sales. Pure. */
type Fin = ReturnType<typeof computeFinance>;
const r0 = (n: number) => Math.round(n);
const DAY = 864e5;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const t0 = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** Chance an overdue invoice is actually collected in the next few weeks (industry rule of thumb). */
export function collectChance(daysLate: number) { return daysLate <= 0 ? 0.95 : daysLate <= 30 ? 0.8 : daysLate <= 60 ? 0.6 : daysLate <= 90 ? 0.4 : 0.2; }

export function cashForecast(fin: Fin, inp: Pick<Input, "fixed" | "today">, opening: number, opts: { includeNew: boolean; weeks?: number } = { includeNew: false }) {
  const W = opts.weeks || 13;
  // weeks start Sunday (Saudi work week)
  const today = t0(inp.today), dow = new Date(today).getUTCDay(), start = today - dow * DAY;
  const weeks = Array.from({ length: W }, (_, i) => ({ i, from: iso(start + i * 7 * DAY), to: iso(start + (i * 7 + 6) * DAY), in_ar: 0, in_new: 0, out_ap: 0, out_fixed: 0, out_var: 0, items: [] as Array<{ kind: "in" | "out"; label: string; amount: number }> }));
  const weekOf = (d: string) => { const k = Math.floor((t0(d) - start) / (7 * DAY)); return k >= 0 && k < W ? k : null; };
  const spread = (amount: number, n: number, put: (w: number, v: number) => void) => { for (let k = 0; k < n; k++) put(k, amount / n); };

  // receivables
  for (const o of fin.ar.open) {
    const p = collectChance(o.days), v = o.unpaid * p;
    if (o.days > 0) spread(v, 4, (w, x) => { weeks[w].in_ar += x; });
    else { const w = weekOf(o.due); if (w !== null) weeks[w].in_ar += v; }
    if (v >= 1000) { const w = o.days > 0 ? 0 : weekOf(o.due); if (w !== null) weeks[w].items.push({ kind: "in", label: `${o.party} · ${o.no}${o.days > 0 ? ` (متأخر ${o.days} يوم — محسوب ${Math.round(p * 100)}%${o.days > 0 ? " على 4 أسابيع" : ""})` : ""}`, amount: r0(v) }); }
  }
  // payables (you owe the full amount)
  for (const o of fin.ap.open) {
    if (o.days > 0) spread(o.unpaid, 4, (w, x) => { weeks[w].out_ap += x; });
    else { const w = weekOf(o.due); if (w !== null) weeks[w].out_ap += o.unpaid; }
    if (o.unpaid >= 1000) { const w = o.days > 0 ? 0 : weekOf(o.due); if (w !== null) weeks[w].items.push({ kind: "out", label: `${o.party} · ${o.no}${o.days > 0 ? ` (متأخر ${o.days} يوم — موزع على 4 أسابيع)` : ""}`, amount: r0(o.unpaid) }); }
  }
  // fixed monthly costs, paid on the 27th
  const fixedMonthly = inp.fixed.reduce((s, f) => s + f.monthly_amount, 0);
  const B = fin.baseline;
  const fixedUse = fixedMonthly > 0 ? fixedMonthly : B?.opex || 0;
  for (let k = 0; k < W * 7; k++) {
    const d = iso(start + k * DAY);
    if (d < inp.today || d.slice(8, 10) !== "27") continue;
    const w = weekOf(d)!; weeks[w].out_fixed += fixedUse; weeks[w].items.push({ kind: "out", label: fixedMonthly > 0 ? `مصاريف ثابتة (${inp.fixed.map(f => f.name).join("، ")})` : "متوسط المصروفات الشهرية", amount: r0(fixedUse) });
  }
  // variable running costs (marketing, travel, government…) beyond the fixed list
  const variableMonthly = Math.max(0, (B?.opex || 0) - fixedMonthly);
  if (fixedMonthly > 0 && variableMonthly > 0) for (const w of weeks) w.out_var += variableMonthly / 4.33;
  // new sales (optional): baseline monthly invoiced incl. VAT, collected from week 5 at 80%
  if (opts.includeNew && B) for (const w of weeks) if (w.i >= 4) w.in_new += B.sales_gross / 4.33 * 0.8;

  let bal = opening, low = { balance: opening, week: -1 }, firstNeg: number | null = null;
  const rows = weeks.map(w => {
    const inn = w.in_ar + w.in_new, out = w.out_ap + w.out_fixed + w.out_var; bal += inn - out;
    if (bal < low.balance) low = { balance: bal, week: w.i };
    if (bal < 0 && firstNeg === null) firstNeg = w.i;
    return { ...w, in_ar: r0(w.in_ar), in_new: r0(w.in_new), out_ap: r0(w.out_ap), out_fixed: r0(w.out_fixed), out_var: r0(w.out_var), net: r0(inn - out), balance: r0(bal), items: w.items.sort((a, b) => b.amount - a.amount).slice(0, 8) };
  });
  const tot = rows.reduce((s, r) => ({ in: s.in + r.in_ar + r.in_new, out: s.out + r.out_ap + r.out_fixed + r.out_var }), { in: 0, out: 0 });
  return { opening: r0(opening), rows, total_in: r0(tot.in), total_out: r0(tot.out), closing: r0(bal), lowest: { balance: r0(low.balance), week: low.week }, first_negative_week: firstNeg,
    assumptions: { fixed_monthly: r0(fixedUse), fixed_source: fixedMonthly > 0 ? "list" : "average", variable_monthly: r0(fixedMonthly > 0 ? variableMonthly : 0), include_new: opts.includeNew, new_weekly: B ? r0(B.sales_gross / 4.33 * 0.8) : 0 } };
}
