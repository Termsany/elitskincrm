import { query } from "@/lib/db";
import { addDays } from "@/lib/fmt";
import { daftraConfigured } from "@/lib/daftra";
import { computeFinance, loadInput } from "@/lib/finance";
import { salesPace } from "@/lib/smart";
import { currentWeekStart, weekDays } from "@/lib/plan-week-core";
import { getRules, reviewRows, type ReviewIssue } from "@/lib/visit-review";

const RES_AR: Record<string, string> = { promise: "وعد بالدفع", extension: "طلب مهلة", no_answer: "مش بيرد", collected: "تم التحصيل" };

/** What needs the manager's decision now: flagged visits, plans waiting, overdue customers (full admin only), one visit to send back. */
export async function adminPriorities(today: string, userId: string, manager: boolean) {
  const rules = await getRules();
  const [rows, snooze, plans, fin] = await Promise.all([
    reviewRows(today, rules),
    query<{ kind: string; ref: string }>(`SELECT kind, ref FROM smart_dismissals WHERE user_id=$1 AND until > $2::date AND kind IN ('admin_review','admin_debt')`, [userId, today]),
    query<{ id: string; rep: string; ps: string; pe: string; period: string; visits: number; cities: string[]; a: number; days: string[]; dups: number; submitted: string }>(`SELECT p.id::text id, u.name rep, p.period_start::text ps, p.period_end::text pe, p.period::text period,
        (SELECT count(*)::int FROM plan_items pi WHERE pi.plan_id=p.id) visits,
        COALESCE((SELECT array_agg(DISTINCT d.city) FROM plan_items pi JOIN doctors d ON d.id=pi.doctor_id WHERE pi.plan_id=p.id AND COALESCE(d.city,'')<>''), '{}') cities,
        (SELECT count(*)::int FROM plan_items pi JOIN doctors d ON d.id=pi.doctor_id WHERE pi.plan_id=p.id AND upper(d.classification)='A') a,
        COALESCE((SELECT array_agg(DISTINCT pi.planned_date::text) FROM plan_items pi WHERE pi.plan_id=p.id), '{}') days,
        (SELECT count(*)::int FROM (SELECT 1 FROM plan_items pi WHERE pi.plan_id=p.id GROUP BY pi.doctor_id, pi.planned_date HAVING count(*) > 1) x) dups,
        p.created_at::text submitted
      FROM plans p JOIN users u ON u.id=p.user_id WHERE p.status='pending' ORDER BY p.created_at`),
    !manager && daftraConfigured() ? loadInput(today).then(inp => computeFinance(inp, addDays(today, -364), today)).catch(() => null) : Promise.resolve(null),
  ]);
  const snoozed = new Set(snooze.rows.map(s => `${s.kind}:${s.ref}`));
  const review = rows.filter(r => r.status === "review");
  const by = (k: ReviewIssue) => review.filter(r => r.issues.includes(k)).length;
  const fix = review.find(r => r.issues.includes("notes") && !r.issues.includes("burst")) || review[0] || null;

  let debts: null | { total: number; count: number; list: Array<{ party: string; unpaid: number; days: number; last: string | null }> } = null;
  if (fin) {
    const old = fin.ar.parties.filter(p => p.oldestDue > 60 && p.unpaid > 0 && !snoozed.has(`admin_debt:${p.name}`)).sort((a, b) => b.unpaid - a.unpaid);
    const last = old.length ? await query<{ party: string; result: string; promised_date: string | null; at: string }>(`SELECT DISTINCT ON (party) party, result, promised_date::text promised_date, created_at::text at FROM admin_collection_notes WHERE party = ANY($1::text[]) ORDER BY party, created_at DESC`, [old.map(p => p.name)]) : { rows: [] };
    const lm = new Map(last.rows.map(l => [l.party, `${RES_AR[l.result] || l.result}${l.promised_date ? ` ${l.promised_date.slice(8, 10)}/${l.promised_date.slice(5, 7)}` : ""}`]));
    debts = { total: Math.round(old.reduce((a, p) => a + p.unpaid, 0)), count: old.length, list: old.slice(0, 5).map(p => ({ party: p.name, unpaid: Math.round(p.unpaid), days: p.oldestDue, last: lm.get(p.name) || null })) };
  }
  return {
    rules,
    review: { count: review.length, snoozed: snoozed.has("admin_review:all"), gps: by("gps"), notes: by("notes"), far: by("far"), burst: by("burst") },
    fix: fix && { id: fix.id, doctor: fix.doctor, rep: fix.rep, day: fix.day, hm: fix.hm, notes: fix.notes, issues: fix.issues },
    plans: plans.rows.map(p => {
      const days = p.period === "daily" ? [p.ps] : weekDays(p.ps).filter(d => d <= p.pe);
      return { id: p.id, rep: p.rep, from: p.ps, to: p.pe, visits: p.visits, cities: p.cities, a: p.a, emptyDays: days.filter(d => !p.days.includes(d)).length, dups: p.dups, submitted: p.submitted };
    }),
    debts,
  };
}

type Range = { from: string; to: string; pFrom: string; pTo: string; label: string };
export function periodRange(period: string, today: string): Range {
  const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  let from = today, label = "النهارده";
  if (period === "week") { from = currentWeekStart(today) > today ? addDays(currentWeekStart(today), -7) : currentWeekStart(today); label = "الأسبوع ده"; }
  else if (period === "month") { from = `${today.slice(0, 7)}-01`; label = "الشهر ده"; }
  else if (period === "quarter") { const m = Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1; from = `${today.slice(0, 4)}-${String(m).padStart(2, "0")}-01`; label = "الربع ده"; }
  const n = days(from, today);
  if (period === "month" || period === "quarter") {
    const months = period === "month" ? 1 : 3, d = new Date(`${from}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - months);
    const pFrom = d.toISOString().slice(0, 10); return { from, to: today, pFrom, pTo: addDays(pFrom, n), label };
  }
  return { from, to: today, pFrom: addDays(from, -(n + 1) - (period === "week" ? 7 - (n + 1) : 0)), pTo: addDays(from, -1 - (period === "week" ? 7 - (n + 1) : 0)), label };
}

/** Headline numbers for a period, each with the same span of the previous period for comparison. */
export async function adminKpis(period: string, today: string, manager: boolean) {
  const r = periodRange(period, today);
  const visits = (from: string, to: string) => query<{ planned: number; done: number; total: number }>(`SELECT
      (SELECT count(*)::int FROM plan_items pi JOIN plans p ON p.id=pi.plan_id WHERE p.status='approved' AND pi.planned_date BETWEEN $1::date AND $2::date) planned,
      (SELECT count(*)::int FROM plan_items pi JOIN plans p ON p.id=pi.plan_id WHERE p.status='approved' AND pi.planned_date BETWEEN $1::date AND $2::date
        AND EXISTS (SELECT 1 FROM visits v WHERE v.doctor_id=pi.doctor_id AND v.sales_rep_id=p.user_id AND v.status::text IN ('completed','follow_up') AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=pi.planned_date)) done,
      (SELECT count(*)::int FROM visits v WHERE v.status::text IN ('completed','follow_up') AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $1::date AND $2::date) total`, [from, to]).then(x => x.rows[0]);
  const sales = (from: string, to: string) => query<{ v: number }>(`SELECT COALESCE(sum(value),0)::float8 v FROM daftra_sales_v WHERE invoice_date BETWEEN $1::date AND $2::date`, [from, to]).then(x => Math.round(x.rows[0]?.v || 0)).catch(() => null);
  const [vNow, vPrev, sNow, sPrev, pace, fin] = await Promise.all([
    visits(r.from, r.to), visits(r.pFrom, r.pTo),
    manager ? null : sales(r.from, r.to), manager ? null : sales(r.pFrom, r.pTo),
    salesPace(today).catch(() => []),
    !manager && daftraConfigured() ? loadInput(today).then(inp => ({ now: computeFinance(inp, r.from, r.to), prev: computeFinance(inp, r.pFrom, r.pTo) })).catch(() => null) : Promise.resolve(null),
  ]);
  const pct = (a: number | null | undefined, b: number | null | undefined) => a == null || !b ? null : Math.round((a - b) / b * 100);
  const withT = pace.filter(p => p.target > 0), monthTarget = Math.round(withT.reduce((a, p) => a + p.target, 0));
  return {
    period, label: r.label, from: r.from, to: r.to,
    sales: sNow === null ? null : { value: sNow, delta: pct(sNow, sPrev), target: period === "month" ? monthTarget : null },
    collection: fin ? { value: Math.round(fin.now.kpi.collected), delta: pct(fin.now.kpi.collected, fin.prev.kpi.collected), open: Math.round(fin.now.ar.total), overdue: Math.round(fin.now.ar.overdue) } : null,
    visits: { done: vNow.done, planned: vNow.planned, total: vNow.total, delta: pct(vNow.total, vPrev.total) },
    targets: { onTrack: withT.filter(p => p.pct !== null && p.pct >= 100).length, reps: withT.length, behind: withT.filter(p => p.behind).map(p => p.name) },
  };
}
