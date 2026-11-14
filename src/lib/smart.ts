import { query } from "@/lib/db";
import { planTargets } from "@/lib/plan-link";
import { analyzeAccount, type AInv, type ALine } from "@/lib/clinic-account";
import { clinicsOfClientSql } from "@/lib/clinic-groups";
import { addDays } from "@/lib/fmt";

const DAY = 864e5;
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
const diff = (a: string, b: string) => Math.round((t(b) - t(a)) / DAY);

export type ReorderDue = { clinic_id: string; clinic_name: string; customer: string; next_expected: string; days_to: number; usual_gap: number; last: string;
  monthly_avg: number; top: string[]; status: string; doctors: Array<{ id: string; name: string; classification: string | null }>; branches?: string[] };

/**
 * Clinics whose next Daftra order is due within a week (or a little late, not yet "stopped"), from their own ordering rhythm.
 * For a rep: only clinics where that rep was credited with sales in the last 12 months (their products).
 */
export async function reorderDue(today: string, opts: { repId?: string; ahead?: number } = {}): Promise<ReorderDue[]> {
  const ahead = opts.ahead ?? 7;
  const links = (await query<{ client_id: string; clinic_id: string; clinic_name: string; customer: string }>(`SELECT l.client_id, l.clinic_id, c.name clinic_name,
      (SELECT max(client_name) FROM daftra_invoices i WHERE i.client_id=l.client_id) customer
    FROM daftra_client_links l JOIN clinics c ON c.id=l.clinic_id
    ${opts.repId ? "WHERE EXISTS (SELECT 1 FROM daftra_sales_v s WHERE s.clinic_id=l.clinic_id AND s.rep_id=$1 AND s.invoice_date >= now() - interval '365 days')" : ""}`, opts.repId ? [opts.repId] : [])).rows;
  if (!links.length) return [];
  const ids = links.map(l => Number(l.client_id));
  const inv = (await query<AInv>(`SELECT id, client_id, no, invoice_date::text date, due_days, payment_status status, net::float8, total::float8, unpaid::float8, refund::float8
    FROM daftra_invoices WHERE client_id = ANY($1::bigint[])`, [ids])).rows.map(i => ({ ...i, id: Number(i.id), client_id: Number(i.client_id) }));
  const lines = inv.length ? (await query<ALine>("SELECT invoice_id, item, quantity::float8, net::float8 FROM daftra_invoice_items WHERE invoice_id = ANY($1::bigint[])", [inv.map(i => i.id)])).rows.map(l => ({ ...l, invoice_id: Number(l.invoice_id) })) : [];
  // group customers by clinic (a clinic can have several Daftra customers)
  const byClinic = new Map<string, typeof links>();
  for (const l of links) byClinic.set(l.clinic_id, [...(byClinic.get(l.clinic_id) || []), l]);
  const out: ReorderDue[] = [];
  for (const [clinicId, ls] of byClinic) {
    const cids = new Set(ls.map(l => Number(l.client_id)));
    const mine = inv.filter(i => cids.has(i.client_id)), set = new Set(mine.map(i => i.id));
    const a = analyzeAccount(mine, lines.filter(x => set.has(x.invoice_id)), today);
    if (!a.orders.next_expected || !a.orders.usual_gap || a.status === "stopped" || a.orders.count < 2) continue;
    const d = diff(today, a.orders.next_expected);
    if (d > ahead || d < -Math.max(7, Math.round(a.orders.usual_gap / 2))) continue;
    out.push({ clinic_id: clinicId, clinic_name: ls[0].clinic_name, customer: ls[0].customer, next_expected: a.orders.next_expected, days_to: d, usual_gap: a.orders.usual_gap,
      last: a.orders.last!, monthly_avg: a.sales.monthly_avg, top: a.products.slice(0, 3).map(p => p.item), status: a.status, doctors: [] });
  }
  if (out.length) {
    const cl = (await query<{ clinic_id: string; client_id: string }>("SELECT clinic_id, client_id FROM daftra_client_links WHERE clinic_id = ANY($1::uuid[])", [out.map(o => o.clinic_id)])).rows;
    const docs = (await query<{ client_id: string; id: string; name: string; classification: string | null; branch: string }>(`SELECT x.client_id, d.id, d.name, d.classification, c.name branch
      FROM unnest($1::bigint[]) x(client_id) JOIN doctors d ON d.clinic_id IN ${clinicsOfClientSql("x.client_id")} JOIN clinics c ON c.id=d.clinic_id
      WHERE COALESCE(d.status,'active')='active' ORDER BY d.classification NULLS LAST, d.name`, [[...new Set(cl.map(c => Number(c.client_id)))]])).rows;
    for (const o of out) { const ks = new Set(cl.filter(c => c.clinic_id === o.clinic_id).map(c => String(c.client_id)));
      const ds = docs.filter(x => ks.has(String(x.client_id)));
      o.doctors = [...new Map(ds.map(x => [x.id, { id: x.id, name: x.name, classification: x.classification }])).values()];
      const br = [...new Set(ds.map(x => x.branch))]; if (br.length > 1 || (br[0] && br[0] !== o.clinic_name)) o.branches = br; }
  }
  return out.sort((x, y) => x.days_to - y.days_to || y.monthly_avg - x.monthly_avg);
}

export type Pace = { rep_id: string; name: string; target: number; mtd: number; projected: number; pct: number | null; behind: boolean; day: number; days: number };

/** Month-to-date Daftra sales per rep projected to month end at the current pace, against the month target. */
export async function salesPace(today: string, repId?: string): Promise<Pace[]> {
  const month = today.slice(0, 7), m1 = `${month}-01`;
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate(), day = Number(today.slice(8, 10));
  const rows = (await query<{ id: string; name: string; target: number; mtd: number; ovr: boolean }>(`SELECT u.id, u.name,
      EXISTS (SELECT 1 FROM rep_target_overrides o WHERE o.rep_id=u.id AND o.month=$1::date) ovr,
      COALESCE((SELECT o.amount FROM rep_target_overrides o WHERE o.rep_id=u.id AND o.month=$1::date),
        (SELECT tm.amount FROM rep_target_versions v JOIN rep_target_months tm ON tm.version_id=v.id WHERE v.rep_id=u.id AND v.year=EXTRACT(year FROM $1::date)::int AND v.level='annual' AND v.status='approved' AND tm.month=$1::date ORDER BY v.version DESC LIMIT 1),
        (SELECT y.annual_amount / 12.0 FROM rep_target_years y WHERE y.rep_id=u.id AND y.year=EXTRACT(year FROM $1::date)::int), 0)::float8 target,
      COALESCE((SELECT sum(s.value) FROM daftra_sales_v s WHERE s.rep_id=u.id AND s.invoice_date >= $1::date AND s.invoice_date <= $2::date), 0)::float8 mtd
    FROM users u WHERE u.role='sales_rep' AND u.active ${repId ? "AND u.id=$3" : ""} ORDER BY u.name`, repId ? [m1, today, repId] : [m1, today])).rows;
  const share = (await planTargets([month])).get(month);
  return rows.map(r => {
    if (share?.has(r.id) && !r.ovr) r.target = share.get(r.id)!; // the rep's part of the month plan is their month target
    const projected = day > 0 ? r.mtd / day * days : 0, pct = r.target > 0 ? Math.round(projected / r.target * 100) : null;
    return { rep_id: r.id, name: r.name, target: r.target, mtd: r.mtd, projected: Math.round(projected), pct, behind: pct !== null && day >= 7 && pct < 85, day, days };
  });
}

export type DiscountLine = { invoice_id: number; invoice_no: string; date: string; customer: string; item: string; quantity: number; unit_price: number; discount_pct: number; lost: number; reps: string | null };

/** Daftra invoice lines sold above the allowed discount (fin_settings.max_discount_pct), most money lost first. */
export async function discountAlerts(sinceDays = 60) {
  const max = Number((await query<{ m: number }>("SELECT max_discount_pct::float8 m FROM fin_settings LIMIT 1").catch(() => ({ rows: [{ m: 15 }] }))).rows[0]?.m ?? 15);
  const rows = (await query<DiscountLine>(`SELECT * FROM (
      SELECT ii.invoice_id, i.no invoice_no, i.invoice_date::text date, i.client_name customer, ii.item, ii.quantity::float8 quantity, ii.unit_price::float8 unit_price,
        round(((1 - ii.net / NULLIF(ii.unit_price * ii.quantity, 0)) * 100)::numeric, 1)::float8 discount_pct,
        round((ii.unit_price * ii.quantity - ii.net)::numeric, 2)::float8 lost,
        (SELECT string_agg(DISTINCT u.name, '، ') FROM daftra_sales_v s JOIN users u ON u.id=s.rep_id WHERE s.invoice_id=ii.invoice_id AND lower(btrim(s.item))=lower(btrim(ii.item))) reps
      FROM daftra_invoice_items ii JOIN daftra_invoices i ON i.id=ii.invoice_id
      WHERE i.invoice_date >= (now() AT TIME ZONE 'Asia/Riyadh')::date - $1::int AND ii.unit_price > 0 AND ii.quantity > 0 AND i.payment_status <> 3) x
    WHERE discount_pct > $2 ORDER BY lost DESC LIMIT 60`, [sinceDays, max]).catch(e => { console.error("discount alerts", e); return { rows: [] as DiscountLine[] }; })).rows;
  return { max, lines: rows, lost: Math.round(rows.reduce((s, r) => s + r.lost, 0)) };
}

export type BrokenPromise = { client_id: number; customer: string; clinic_name: string | null; rep_id: string; rep_name: string; promise_date: string; amount: number | null; days_late: number; unpaid: number };

/** "Will pay on …" promises whose date passed with no later follow-up while the customer still owes money. */
export async function brokenPromises(today: string, repId?: string): Promise<BrokenPromise[]> {
  return (await query<BrokenPromise>(`SELECT f.client_id::int client_id, (SELECT max(client_name) FROM daftra_invoices i WHERE i.client_id=f.client_id) customer, c.name clinic_name,
      f.rep_id, u.name rep_name, f.promise_date::text promise_date, f.amount::float8 amount, ($1::date - f.promise_date)::int days_late,
      (SELECT COALESCE(sum(unpaid),0)::float8 FROM daftra_invoices i WHERE i.client_id=f.client_id AND i.unpaid > 0 AND i.payment_status <> 3) unpaid
    FROM collection_followups f JOIN users u ON u.id=f.rep_id
    LEFT JOIN daftra_client_links l ON l.client_id=f.client_id LEFT JOIN clinics c ON c.id=l.clinic_id
    WHERE f.result='promised' AND f.promise_date < $1::date ${repId ? "AND f.rep_id=$2" : ""}
      AND NOT EXISTS (SELECT 1 FROM collection_followups g WHERE g.client_id=f.client_id AND g.created_at > f.created_at)
    ORDER BY days_late DESC`, repId ? [today, repId] : [today]).catch(() => ({ rows: [] as BrokenPromise[] }))).rows.filter(r => r.unpaid > 0);
}

/** Collection priority: overdue money weighted by how late it is (a 60-day debt counts three times a fresh one). */
export const collectionPriority = (overdue: number, oldestDays: number) => Math.round(overdue * (1 + Math.max(0, oldestDays) / 30));
export { addDays };
