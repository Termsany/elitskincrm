import { query } from "@/lib/db";
import { clinicsOfClientSql } from "@/lib/clinic-groups";
import { addDays } from "@/lib/fmt";

/**
 * A clinic's account from Daftra (read-only mirror): what it buys, how often, whether it is slowing down,
 * and its open balance. Linking is CRM-side (daftra_client_links). Purchase prices and suppliers never
 * appear here, so it is safe to show to the rep who visits the clinic.
 */
export type AInv = { id: number; client_id: number; no: string; date: string; due_days: number | null; status: number; net: number; total: number; unpaid: number; refund: number };
export type ALine = { invoice_id: number; item: string; quantity: number; net: number };
export const STOP_DAYS = 45;      // no order for this long (and longer than 1.5× the usual gap) = stopped
export const DROP = 0.3;          // last 90 days at least 30% below the 90 before = declining

const DAY = 864e5;
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
const days = (a: string, b: string) => Math.round((t(b) - t(a)) / DAY);
const r2 = (n: number) => Math.round(n * 100) / 100;
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Pure: buying pattern + balance for a set of invoices (one clinic, possibly several Daftra customers). */
export function analyzeAccount(invoices: AInv[], lines: ALine[], today: string) {
  const live = invoices.filter(i => i.status !== 3 && !(i.total > 0 && i.refund >= i.total) && i.date <= today);
  const share = (i: AInv) => i.total > 0 ? Math.max(0, 1 - i.refund / i.total) : 1;
  const orderDays = [...new Set(live.map(i => i.date))].sort();
  const gaps = orderDays.slice(1).map((d, k) => days(orderDays[k], d)).filter(g => g > 0);
  const usual = median(gaps);
  const last = orderDays.at(-1) || null, since = last ? days(last, today) : null;
  const sum = (from: string, to: string) => r2(live.filter(i => i.date > from && i.date <= to).reduce((s, i) => s + i.net * share(i), 0));
  const d90 = addDays(today, -90), d180 = addDays(today, -180), d365 = addDays(today, -365);
  const last90 = sum(d90, today), prev90 = sum(d180, d90), year = sum(d365, today);
  const change = prev90 > 0 ? r2((last90 - prev90) / prev90 * 100) : null;
  // stopped: long silence relative to its own rhythm (a monthly buyer silent 45 days counts, a quarterly one doesn't)
  const stopped = since !== null && orderDays.length >= 2 && since >= STOP_DAYS && since > (usual ?? 0) * 1.5;
  const declining = !stopped && prev90 > 0 && last90 < prev90 * (1 - DROP);
  const ids = new Map(live.map(i => [i.id, i]));
  const P = new Map<string, { item: string; qty: number; net: number; last: string; orders: number }>();
  for (const l of lines) {
    const inv = ids.get(l.invoice_id); if (!inv || inv.date <= d365 || !(l.quantity > 0)) continue;
    const k = l.item.trim().toLowerCase(), f = share(inv);
    const p = P.get(k) || { item: l.item.trim(), qty: 0, net: 0, last: "", orders: 0 };
    p.qty += l.quantity * f; p.net += l.net * f; p.orders++; if (inv.date > p.last) p.last = inv.date; P.set(k, p);
  }
  const open = invoices.filter(i => i.unpaid > 0 && (i.status === 0 || i.status === 1)).map(i => { const due = addDays(i.date, i.due_days || 0); return { id: i.id, no: i.no, date: i.date, due, unpaid: r2(i.unpaid), days: days(due, today) }; }).sort((a, b) => b.days - a.days);
  return {
    orders: { count: orderDays.length, first: orderDays[0] || null, last, days_since: since, usual_gap: usual === null ? null : Math.round(usual), next_expected: last && usual ? addDays(last, Math.round(usual)) : null },
    sales: { last90, prev90, change, year, monthly_avg: r2(year / 12) },
    status: (stopped ? "stopped" : declining ? "declining" : !orderDays.length ? "none" : "ok") as "stopped" | "declining" | "ok" | "none",
    products: [...P.values()].map(p => ({ ...p, qty: r2(p.qty), net: r2(p.net) })).sort((a, b) => b.net - a.net).slice(0, 10),
    balance: { unpaid: r2(open.reduce((s, o) => s + o.unpaid, 0)), overdue: r2(open.filter(o => o.days > 0).reduce((s, o) => s + o.unpaid, 0)), oldest: open[0]?.days ?? null, open: open.slice(0, 8), open_count: open.length },
  };
}
export type Account = ReturnType<typeof analyzeAccount>;

async function load(clientIds: number[]) {
  if (!clientIds.length) return { inv: [] as AInv[], lines: [] as ALine[] };
  const inv = await query<AInv>(`SELECT id, client_id, no, invoice_date::text date, due_days, payment_status status, net::float8, total::float8, unpaid::float8, refund::float8
    FROM daftra_invoices WHERE client_id = ANY($1::bigint[])`, [clientIds]);
  const rows = inv.rows.map(i => ({ ...i, id: Number(i.id), client_id: Number(i.client_id) }));
  const lines = rows.length ? await query<ALine>("SELECT invoice_id, item, quantity::float8, net::float8 FROM daftra_invoice_items WHERE invoice_id = ANY($1::bigint[])", [rows.map(r => r.id)]) : { rows: [] };
  return { inv: rows, lines: lines.rows.map(l => ({ ...l, invoice_id: Number(l.invoice_id) })) };
}

/** The clinic a doctor belongs to (by id, or by exact clinic name when the doctor has no clinic id yet). */
export async function doctorClinic(doctorId: string) {
  const r = await query<{ id: string; name: string }>(`SELECT c.id, c.name FROM doctors d JOIN clinics c ON c.id = d.clinic_id OR (d.clinic_id IS NULL AND lower(btrim(c.name)) = lower(btrim(d.clinic_name)) AND btrim(d.clinic_name) <> '')
    WHERE d.id = $1 ORDER BY (c.id = d.clinic_id) DESC LIMIT 1`, [doctorId]);
  return r.rows[0] || null;
}

/** Account for one clinic, or null when no Daftra customer is linked to it. */
export async function clinicAccount(clinicId: string, today: string) {
  // the clinic's Daftra customer(s): a branch mapping, a direct link, or the clinic created from Daftra
  const ids = (await query<{ client_id: string; name: string }>(`SELECT k.client_id, (SELECT max(client_name) FROM daftra_invoices i WHERE i.client_id=k.client_id) name FROM (
      SELECT b.client_id FROM daftra_client_branches b WHERE b.clinic_id=$1 UNION SELECT l.client_id FROM daftra_client_links l WHERE l.clinic_id=$1
      UNION SELECT c.daftra_client_id FROM clinics c WHERE c.id=$1 AND c.daftra_client_id IS NOT NULL) k`, [clinicId])).rows;
  if (!ids.length) return null;
  const { inv, lines } = await load(ids.map(i => Number(i.client_id)));
  // other branches sharing the same Daftra account (sales and balance are per customer, not per branch)
  const branches = (await query<{ name: string }>(`SELECT DISTINCT c.name FROM unnest($1::bigint[]) x(k) JOIN clinics c ON c.id IN ${clinicsOfClientSql("x.k")}
    WHERE c.id <> $2 AND EXISTS (SELECT 1 FROM doctors d WHERE d.clinic_id=c.id) ORDER BY c.name`, [ids.map(i => Number(i.client_id)), clinicId])).rows.map(r => r.name);
  return { customers: ids.map(i => i.name || `#${i.client_id}`), branches, ...analyzeAccount(inv, lines, today) };
}

export type Decline = { client_id: number; name: string; doctor_id: string | null; clinic_id: string | null; clinic_name: string | null; rep_id: string | null; rep_name: string | null; status: "stopped" | "declining";
  days_since: number | null; usual_gap: number | null; last90: number; prev90: number; change: number | null; monthly_avg: number; last: string | null; top: string[] };

/** Linked customers that stopped ordering or are buying clearly less — for one rep, or everyone (repId null). */
export async function decliningClients(repId: string | null, today: string): Promise<Decline[]> {
  const links = (await query<{ client_id: string; name: string | null; rep_id: string | null; rep_name: string | null; clinic_id: string | null; clinic_name: string | null; doctor_id: string | null }>(`SELECT l.client_id, (SELECT max(client_name) FROM daftra_invoices i WHERE i.client_id = l.client_id) name, l.rep_id, u.name rep_name, l.clinic_id, c.name clinic_name,
      (SELECT d.id FROM doctors d LEFT JOIN visits v ON v.doctor_id = d.id AND v.sales_rep_id = l.rep_id WHERE d.clinic_id IN ${clinicsOfClientSql("l.client_id")} GROUP BY d.id ORDER BY count(v.id) DESC, d.id LIMIT 1) doctor_id
    FROM daftra_client_links l LEFT JOIN users u ON u.id = l.rep_id LEFT JOIN clinics c ON c.id = l.clinic_id ${repId ? "WHERE l.rep_id = $1" : ""}`, repId ? [repId] : [])).rows;
  if (!links.length) return [];
  const { inv, lines } = await load(links.map(l => Number(l.client_id)));
  const out: Decline[] = [];
  for (const l of links) {
    const cid = Number(l.client_id), mine = inv.filter(i => i.client_id === cid);
    const set = new Set(mine.map(i => i.id)), a = analyzeAccount(mine, lines.filter(x => set.has(x.invoice_id)), today);
    if (a.status !== "stopped" && a.status !== "declining") continue;
    out.push({ client_id: cid, name: l.name || `#${cid}`, doctor_id: l.doctor_id, clinic_id: l.clinic_id, clinic_name: l.clinic_name, rep_id: l.rep_id, rep_name: l.rep_name, status: a.status,
      days_since: a.orders.days_since, usual_gap: a.orders.usual_gap, last90: a.sales.last90, prev90: a.sales.prev90, change: a.sales.change, monthly_avg: a.sales.monthly_avg, last: a.orders.last, top: a.products.slice(0, 3).map(p => p.item) });
  }
  // biggest money at risk first
  return out.sort((x, y) => (y.monthly_avg - x.monthly_avg));
}
