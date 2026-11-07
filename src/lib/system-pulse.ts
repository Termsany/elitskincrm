import { query } from "@/lib/db";
import { overdueDoctorsAll, staleDoctors, alertCount } from "@/lib/my-alerts";

/** One-screen health of the whole system for a period: sales (Daftra) vs target, visits, doctor coverage,
 *  plan compliance, collections and rep expenses — overall and per rep. Read-only. */
export type Tone = "good" | "warn" | "bad" | "info";
const DAY = 864e5;
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (n: number) => new Date(n).toISOString().slice(0, 10);
const r0 = (n: number) => Math.round(n);
export const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
export const toneOf = (p: number | null, good: number, warn: number): Tone => (p === null ? "info" : p >= good ? "good" : p >= warn ? "warn" : "bad");

/** The period to compare with: whole calendar months → the same number of months before; otherwise the same number of days before. Pure. */
export function previousRange(from: string, to: string) {
  const f = new Date(t(from)), e = new Date(t(to) + DAY);
  if (f.getUTCDate() === 1 && e.getUTCDate() === 1) {
    const n = (e.getUTCFullYear() - f.getUTCFullYear()) * 12 + e.getUTCMonth() - f.getUTCMonth();
    return { pFrom: iso(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() - n, 1)), pTo: iso(t(from) - DAY) };
  }
  const len = (t(to) - t(from)) / DAY + 1;
  return { pFrom: iso(t(from) - len * DAY), pTo: iso(t(from) - DAY) };
}

/** Prorated target of a month list over [from,to]: target × overlapping days ÷ days in month. Pure. */
export function proratedTarget(months: Array<{ month: string; amount: number }>, from: string, to: string) {
  let s = 0;
  for (const m of months) {
    const a = t(`${m.month}-01`), dim = new Date(Date.UTC(Number(m.month.slice(0, 4)), Number(m.month.slice(5, 7)), 0)).getUTCDate(), b = a + (dim - 1) * DAY;
    const lo = Math.max(a, t(from)), hi = Math.min(b, t(to));
    if (hi >= lo) s += m.amount * (((hi - lo) / DAY + 1) / dim);
  }
  return s;
}

export async function systemPulse(from: string, to: string, repId: string | null, today: string) {
  const { pFrom, pTo } = previousRange(from, to);
  const repsQ = await query<{ id: string; name: string; product: string | null }>(`SELECT u.id, u.name, p.name product FROM users u LEFT JOIN products p ON p.id=u.assigned_product_id
    WHERE u.role='sales_rep' AND u.active ${repId ? "AND u.id=$1" : ""} ORDER BY u.name`, repId ? [repId] : []);
  const reps = repsQ.rows, ids = reps.map(r => r.id);
  const [sales, salesPrev, unassigned, targets, visits, plan, exp, coll, docs] = await Promise.all([
    query<{ rep_id: string; v: number }>("SELECT rep_id, sum(value)::float8 v FROM daftra_sales_v WHERE invoice_date BETWEEN $1 AND $2 AND rep_id = ANY($3::uuid[]) GROUP BY 1", [from, to, ids]),
    query<{ v: number }>("SELECT COALESCE(sum(value),0)::float8 v FROM daftra_sales_v WHERE invoice_date BETWEEN $1 AND $2 AND rep_id = ANY($3::uuid[])", [pFrom, pTo, ids]),
    repId ? Promise.resolve({ rows: [{ v: 0 }] }) : query<{ v: number }>("SELECT COALESCE(sum(value),0)::float8 v FROM daftra_sales_v WHERE invoice_date BETWEEN $1 AND $2 AND rep_id IS NULL", [from, to]),
    // monthly target per rep: month override → approved distribution → annual ÷ 12
    query<{ rep_id: string; month: string; amount: number }>(`WITH m AS (SELECT to_char(g, 'YYYY-MM') AS ym, g::date AS d FROM generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month') g)
      SELECT r.id rep_id, m.ym AS month, COALESCE(o.amount, dm.amount, y.annual_amount / 12.0, 0)::float8 amount
      FROM unnest($3::uuid[]) r(id) CROSS JOIN m
      LEFT JOIN rep_target_years y ON y.rep_id=r.id AND y.year=EXTRACT(year FROM m.d)::int
      LEFT JOIN rep_target_overrides o ON o.rep_id=r.id AND o.month=m.d
      LEFT JOIN LATERAL (SELECT tm.amount FROM rep_target_versions v JOIN rep_target_months tm ON tm.version_id=v.id
        WHERE v.rep_id=r.id AND v.year=EXTRACT(year FROM m.d)::int AND v.level='annual' AND v.status='approved' AND tm.month=m.d ORDER BY v.version DESC LIMIT 1) dm ON true`, [from, to, ids]),
    query<{ rep_id: string; done: number; prev: number }>(`SELECT sales_rep_id rep_id,
        count(*) FILTER (WHERE status='completed' AND (visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $1 AND $2)::int done,
        count(*) FILTER (WHERE status='completed' AND (visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $3 AND $4)::int prev
      FROM visits WHERE sales_rep_id = ANY($5::uuid[]) GROUP BY 1`, [from, to, pFrom, pTo, ids]),
    query<{ rep_id: string; planned: number; done: number }>(`SELECT pl.user_id rep_id, count(pi.id)::int planned,
        count(pi.id) FILTER (WHERE EXISTS (SELECT 1 FROM visits v WHERE v.doctor_id=pi.doctor_id AND v.sales_rep_id=pl.user_id AND v.status='completed' AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=pi.planned_date))::int done
      FROM plans pl JOIN plan_items pi ON pi.plan_id=pl.id WHERE pl.status='approved' AND pi.planned_date BETWEEN $1 AND LEAST($2::date, $3::date) AND pl.user_id = ANY($4::uuid[]) GROUP BY 1`, [from, to, today, ids]),
    query<{ rep_id: string; ok: number; pending: number; pn: number }>(`SELECT rep_id, COALESCE(sum(amount) FILTER (WHERE status IN ('approved','reimbursed')),0)::float8 ok,
        COALESCE(sum(amount) FILTER (WHERE status='pending'),0)::float8 pending, count(*) FILTER (WHERE status='pending')::int pn
      FROM expenses WHERE expense_date BETWEEN $1 AND $2 AND rep_id = ANY($3::uuid[]) GROUP BY 1`, [from, to, ids]),
    query<{ total: number; overdue: number; old: number; n: number }>(`SELECT COALESCE(sum(unpaid),0)::float8 total,
        COALESCE(sum(unpaid) FILTER (WHERE invoice_date + COALESCE(due_days,0) < $1::date),0)::float8 overdue,
        COALESCE(sum(unpaid) FILTER (WHERE $1::date - (invoice_date + COALESCE(due_days,0)) > 60),0)::float8 old, count(*)::int n
      FROM daftra_invoices WHERE unpaid > 0 AND payment_status IN (0,1)`, [today]),
    query<{ n: number }>("SELECT count(*)::int n FROM doctors WHERE COALESCE(status,'active')='active'"),
  ]);
  const od = await overdueDoctorsAll(1000);
  const repOverdue = await Promise.all(reps.map(r => staleDoctors(r.id).then(alertCount).catch(() => 0)));
  const by = <T extends { rep_id: string }>(rows: T[]) => new Map(rows.map(x => [x.rep_id, x]));
  const S = by(sales.rows), V = by(visits.rows), P = by(plan.rows), E = by(exp.rows);
  const team = reps.map((r, i) => {
    const tgt = proratedTarget(targets.rows.filter(x => x.rep_id === r.id), from, to), act = S.get(r.id)?.v ?? 0;
    const pl = P.get(r.id), v = V.get(r.id), e = E.get(r.id);
    const sp = pctOf(act, tgt), cp = pl ? pctOf(pl.done, pl.planned) : null;
    return { id: r.id, name: r.name, product: r.product, sales: r0(act), target: r0(tgt), sales_pct: sp, sales_tone: toneOf(sp, 95, 75),
      visits: v?.done ?? 0, visits_prev: v?.prev ?? 0, planned: pl?.planned ?? 0, plan_done: pl?.done ?? 0, plan_pct: cp, plan_tone: toneOf(cp, 85, 65),
      overdue: repOverdue[i], expenses: r0(e?.ok ?? 0), expenses_pending: r0(e?.pending ?? 0) };
  });
  const sum = (k: "sales" | "target" | "visits" | "visits_prev" | "planned" | "plan_done" | "expenses" | "expenses_pending") => team.reduce((s, x) => s + x[k], 0);
  const salesPct = pctOf(sum("sales"), sum("target")), planPct = pctOf(sum("plan_done"), sum("planned"));
  const active = docs.rows[0]?.n ?? 0, overdue = od.overdue.length, never = od.never;
  const covered = Math.max(0, active - overdue - never), covPct = pctOf(covered, active);
  const c = coll.rows[0] ?? { total: 0, overdue: 0, old: 0, n: 0 }, overShare = pctOf(c.overdue, c.total);
  const vDelta = sum("visits_prev") ? Math.round((sum("visits") - sum("visits_prev")) / sum("visits_prev") * 100) : null;
  const pending = exp.rows.reduce((s, x) => s + x.pn, 0);
  return {
    range: { from, to, prevFrom: pFrom, prevTo: pTo },
    cards: {
      sales: { value: sum("sales"), target: sum("target"), pct: salesPct, prev: r0(salesPrev.rows[0]?.v ?? 0), unassigned: r0(unassigned.rows[0]?.v ?? 0), tone: toneOf(salesPct, 95, 75) },
      visits: { value: sum("visits"), prev: sum("visits_prev"), delta: vDelta, tone: (vDelta === null ? "info" : vDelta >= -10 ? "good" : vDelta >= -30 ? "warn" : "bad") as Tone },
      coverage: { pct: covPct, active, overdue, never, tone: toneOf(covPct, 80, 60) },
      plan: { pct: planPct, planned: sum("planned"), done: sum("plan_done"), tone: toneOf(planPct, 85, 65) },
      collections: { total: r0(c.total), overdue: r0(c.overdue), old: r0(c.old), invoices: c.n, share: overShare, tone: (overShare === null ? "info" : overShare < 30 ? "good" : overShare < 60 ? "warn" : "bad") as Tone },
      expenses: { value: sum("expenses"), pending: sum("expenses_pending"), pending_n: pending, tone: (pending ? "warn" : "info") as Tone },
    },
    team,
  };
}
