import { query } from "@/lib/db";
import { computeFinance, type Input } from "@/lib/finance";
import { auditScore, runAudit, type Check, type DiscountLine } from "@/lib/fin-audit";
import { normWeights, scorecard, type Goals } from "@/lib/fin-goals";

/** Server helpers for the CFO pack (audit reviews, goals storage). */
export async function loadDiscounts(): Promise<DiscountLine[]> {
  const r = await query<{ invoice_id: string; item: string; discount: number; net: number }>("SELECT invoice_id, item, discount::float8, net::float8 FROM daftra_invoice_items WHERE discount > 0");
  return r.rows.map(x => ({ invoice_id: Number(x.invoice_id), item: x.item, discount: x.discount, net: x.net }));
}

export async function auditWithReviews(inp: Input, fin: ReturnType<typeof computeFinance>, from: string, to: string) {
  const [disc, rev] = await Promise.all([loadDiscounts(), query<{ key: string; status: string; note: string; reviewed_at: string }>("SELECT key, status, note, reviewed_at::text FROM fin_audit_reviews")]);
  const reviews = new Map(rev.rows.map(r => [r.key, r]));
  const checks: Check[] = runAudit(inp, fin, disc, from, to).map(c => ({ ...c, findings: c.findings.map(f => { const r = reviews.get(f.key); return { ...f, review: r ? { status: r.status, note: r.note, at: r.reviewed_at } : null }; }) }));
  const open = (sev?: string) => checks.filter(c => !sev || c.severity === sev).reduce((s, c) => s + c.findings.filter(f => !f.review).length, 0);
  return { checks, score: auditScore(checks), open: open(), open_high: open("high") };
}

export async function loadGoals(year: number): Promise<Goals | null> {
  const r = await query<{ data: Goals }>("SELECT data FROM fin_goals WHERE year=$1", [year]);
  const g = r.rows[0]?.data; return g ? { ...g, weights: normWeights(g.weights) } : null;
}

/** Short advice lines for the advisor tab, from the audit and this year's goals. */
export async function cfoAdvice(inp: Input, fin: ReturnType<typeof computeFinance>, from: string, to: string) {
  const out: Array<{ level: "danger" | "warn" | "good" | "info"; title: string; text: string; tab?: string }> = [];
  const a = await auditWithReviews(inp, fin, from, to);
  if (a.open_high) out.push({ level: "danger", title: `مراجعة الحسابات: ${a.open_high} ملاحظة مهمة محتاجة مراجعة`, text: `درجة سلامة الحسابات ${a.score}/100. افتح تبويب مراجعة الحسابات وعلّم كل ملاحظة بعد ما تراجعها.`, tab: "audit" });
  else if (a.open) out.push({ level: "info", title: `مراجعة الحسابات: ${a.open} ملاحظة للمراجعة`, text: `درجة سلامة الحسابات ${a.score}/100.`, tab: "audit" });
  const year = Number(inp.today.slice(0, 4));
  const g = await loadGoals(year);
  if (!g) out.push({ level: "info", title: `لسه ما حطيتش أهداف ${year}`, text: "من تبويب الأهداف السنوية هقترح عليك أهداف واقعية مبنية على آخر 12 شهر، وأتابعها معاك شهر بشهر.", tab: "goals" });
  else {
    const yFin = computeFinance(inp, `${year}-01-01`, `${year}-12-31`);
    const sc = scorecard(g, year, yFin, inp.today);
    if (sc.ytd.months > 0 && sc.ytd.sales.target > 0) {
      const p = sc.ytd.sales.actual / sc.ytd.sales.target * 100;
      out.push({ level: p >= 95 ? "good" : p >= 80 ? "warn" : "danger", title: `أهداف ${year}: المبيعات ${Math.round(p)}% من المستهدف لحد دلوقتي`, text: `المستهدف ${sc.ytd.sales.target.toLocaleString("en-US")} ر.س والمحقق ${sc.ytd.sales.actual.toLocaleString("en-US")} ر.س. صافي الربح ${sc.ytd.net.actual.toLocaleString("en-US")} من ${sc.ytd.net.target.toLocaleString("en-US")} ر.س.`, tab: "goals" });
    }
  }
  return { advice: out, audit: { score: a.score, open: a.open, open_high: a.open_high } };
}
