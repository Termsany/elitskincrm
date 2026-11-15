import { query } from "@/lib/db";
import { clampRange, computeFinance, type Input } from "@/lib/finance";
import { auditScore, runAudit, type Check, type DiscountLine } from "@/lib/fin-audit";
import { normWeights, type Goals } from "@/lib/fin-goals";

/** Server helpers for the accounts pack (audit reviews, goals storage). */
export async function loadDiscounts(): Promise<DiscountLine[]> {
  const r = await query<{ invoice_id: string; item: string; discount: number; net: number }>("SELECT invoice_id, item, discount::float8, net::float8 FROM daftra_invoice_items WHERE discount > 0");
  return r.rows.map(x => ({ invoice_id: Number(x.invoice_id), item: x.item, discount: x.discount, net: x.net }));
}

export async function auditWithReviews(inp: Input, fin: ReturnType<typeof computeFinance>, from0: string, to0: string) {
  const [from, to] = clampRange(inp, from0, to0);
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
