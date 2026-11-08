import { query } from "@/lib/db";
import { brokenPromises, salesPace } from "@/lib/smart";
import { addDays } from "@/lib/fmt";


export type Morning = {
  date: string; yesterday: string;
  visits: { total: number; reps: Array<{ name: string; n: number }>; idle: string[] };
  pending: number; overdue: { amount: number; invoices: number }; onLeave: string[]; followupsToday: number; salesYesterday: number;
  promises?: number; behind?: string[];
};

/** What a manager should know first thing: yesterday's visits, idle reps, decisions waiting, overdue money, who is away, follow-ups due. */
export async function morningSummary(today: string, pending: number, opts: { manager?: boolean } = {}): Promise<Morning> {
  const y = addDays(today, -1);
  const q = async <T extends Record<string, unknown>>(sql: string, v: unknown[] = []) => (await query<T>(sql, v)).rows;
  const [reps, leave, overdue, fu, sales] = await Promise.all([
    q<{ id: string; name: string; n: number }>(`SELECT u.id, u.name, count(v.id) FILTER (WHERE v.status::text='completed')::int n FROM users u
      LEFT JOIN visits v ON v.sales_rep_id=u.id AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date = $1::date
      WHERE u.role='sales_rep' AND u.active GROUP BY u.id, u.name ORDER BY n DESC, u.name`, [y]),
    q<{ requester_id: string; name: string; s: string; e: string }>(`SELECT r.requester_id, u.name, r.start_date::text s, r.end_date::text e FROM service_requests r JOIN users u ON u.id=r.requester_id
      WHERE r.kind='leave' AND r.status IN ('approved','completed','closed') AND r.start_date <= $1::date AND r.end_date >= $2::date`, [today, y]).catch(() => []),
    opts.manager ? Promise.resolve([{ amount: 0, n: 0 }]) : q<{ amount: number; n: number }>(`SELECT COALESCE(sum(unpaid),0)::float8 amount, count(*)::int n FROM daftra_invoices
      WHERE unpaid > 0 AND payment_status IN (0,1) AND invoice_date + COALESCE(due_days,0) < $1::date`, [today]).catch(() => [{ amount: 0, n: 0 }]),
    q<{ n: number }>(`SELECT count(*)::int n FROM visits v WHERE v.follow_up_at::date = $1::date AND v.status::text<>'cancelled'`, [today]).catch(() => [{ n: 0 }]),
    opts.manager ? Promise.resolve([{ v: 0 }]) : q<{ v: number }>(`SELECT COALESCE(sum(value),0)::float8 v FROM daftra_sales_v WHERE invoice_date = $1::date`, [y]).catch(() => [{ v: 0 }]),
  ]);
  const [prom, pace] = await Promise.all([opts.manager ? Promise.resolve([]) : brokenPromises(today).catch(() => []), salesPace(today).catch(() => [])]);
  const awayIds = new Set(leave.filter(l => l.s <= y && l.e >= y).map(l => l.requester_id));
  const fri = new Date(`${y}T12:00:00Z`).getUTCDay() === 5; // Friday off: nobody counts as idle
  return {
    date: today, yesterday: y,
    visits: { total: reps.reduce((s, r) => s + r.n, 0), reps: reps.filter(r => r.n > 0).map(r => ({ name: r.name, n: r.n })), idle: fri ? [] : reps.filter(r => !r.n && !awayIds.has(r.id)).map(r => r.name) },
    pending, overdue: { amount: overdue[0]?.amount || 0, invoices: overdue[0]?.n || 0 },
    onLeave: [...new Set(leave.filter(l => l.s <= today && l.e >= today).map(l => l.name))], followupsToday: fu[0]?.n || 0, salesYesterday: sales[0]?.v || 0,
    promises: prom.length, behind: pace.filter(p => p.behind).map(p => p.name),
  };
}

export function morningText(m: Morning) {
  const k = (n: number) => Math.round(n).toLocaleString("en-US");
  return [
    `☀️ إمبارح ${m.visits.total} زيارة`,
    m.visits.idle.length ? `${m.visits.idle.length} من غير زيارات` : null,
    m.salesYesterday ? `مبيعات ${k(m.salesYesterday)} ر.س` : null,
    m.pending ? `${m.pending} مستني قرارك` : null,
    m.overdue.amount ? `متأخرات ${k(m.overdue.amount)} ر.س` : null,
    m.promises ? `${m.promises} وعد سداد اتكسر` : null,
    m.behind?.length ? `متأخر عن الهدف: ${m.behind.join("، ")}` : null,
    m.onLeave.length ? `في إجازة: ${m.onLeave.join("، ")}` : null,
  ].filter(Boolean).join(" · ");
}
