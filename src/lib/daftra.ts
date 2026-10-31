import { pool, query } from "@/lib/db";

/** Daftra API client (read-only). Credentials come from the server environment, never from the browser. */
const SUB = () => (process.env.DAFTRA_SUBDOMAIN || "").trim();
const KEY = () => (process.env.DAFTRA_API_KEY || "").trim();
export const daftraConfigured = () => !!SUB() && !!KEY();
export const daftraInvoiceUrl = (id: number | string) => `https://${SUB()}.daftra.com/owner/invoices/view/${id}`;
export const PAYMENT_LABEL: Record<number, string> = { 0: "غير مدفوعة", 1: "مدفوعة جزئياً", 2: "مدفوعة", 3: "مرتجعة" };

type Json = Record<string, unknown>;
async function get(path: string): Promise<Json> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://${SUB()}.daftra.com/api2/${path}`, { headers: { APIKEY: KEY(), Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(30000) });
    if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 1500 * (attempt + 1))); continue; }
    const j = await r.json().catch(() => null) as Json | null;
    if (!r.ok || !j || j.result !== "successful") throw new Error(`Daftra ${path}: HTTP ${r.status} ${String(j?.message || "")}`.trim());
    return j;
  }
  throw new Error(`Daftra ${path}: retries exhausted`);
}
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Daftra returns ISO dates in lists but the account date format (dd/mm/yyyy) in details. */
export function isoDate(v: unknown) { const s = String(v || "").trim(); const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`; const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/); return dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : ""; }

/** Pure mapping of one Daftra invoice (detail payload) to our row + lines. Exported for tests. */
export function mapInvoice(inv: Json) {
  const items = (Array.isArray(inv.InvoiceItem) ? inv.InvoiceItem : []) as Json[];
  const taxes = Object.values((inv.InvoiceTax && typeof inv.InvoiceTax === "object" ? inv.InvoiceTax : {}) as Record<string, Json>);
  const cf = (Array.isArray(inv.InvoiceCustomField) ? inv.InvoiceCustomField : []) as Json[];
  const total = num(inv.summary_total);
  const tax = r2(taxes.reduce((s, t) => s + num(t.invoice_value), 0));
  const client = (inv.client_business_name as string) || [inv.client_first_name, inv.client_last_name].filter(Boolean).join(" ");
  return {
    row: {
      id: num(inv.id), no: String(inv.no || ""), invoice_date: isoDate(inv.date || inv.issue_date), due_days: num(inv.due_after),
      client_id: inv.client_id ? num(inv.client_id) : null, client_name: String(client || "").trim(), client_city: String(inv.client_city || "").trim(),
      branch: String(cf.find(f => String(f.label).toLowerCase() === "branch")?.value || "").trim().toLowerCase(),
      payment_status: num(inv.payment_status), currency: String(inv.currency_code || "SAR"),
      net: r2(total - tax), tax, total: r2(total), paid: r2(num(inv.summary_paid)), unpaid: r2(num(inv.summary_unpaid)), refund: r2(num(inv.summary_refund)),
      modified: String(inv.modified || ""),
    },
    lines: items.map((it, i) => {
      const lineTax = r2(num(it.summary_tax1) + num(it.summary_tax2));
      return { line: i + 1, product_id: it.product_id ? num(it.product_id) : null, item: String(it.item || "").trim(), quantity: num(it.quantity), unit_price: num(it.unit_price),
        discount: r2(num(it.calculated_discount)), net: r2(num(it.subtotal) - lineTax), tax: lineTax };
    }),
  };
}

let running: Promise<{ invoices: number; updated: number }> | null = null;
/** Incremental sync: lists all invoices, fetches details only for new/changed ones, removes deleted ones. */
export function syncDaftra() {
  if (!running) running = doSync().finally(() => { running = null; });
  return running;
}
async function doSync() {
  if (!daftraConfigured()) throw new Error("Daftra is not configured");
  await query("UPDATE daftra_sync SET started_at=now(), message='جارٍ المزامنة…' WHERE id=1");
  try {
    const listed: Array<{ id: number; modified: string; draft: boolean; date: string }> = [];
    for (let page = 1; page < 500; page++) {
      const j = await get(`invoices.json?limit=100&page=${page}`);
      for (const x of (j.data as Json[]) || []) { const inv = x.Invoice as Json; if (String(inv.type) === "0") listed.push({ id: num(inv.id), modified: String(inv.modified || ""), draft: String(inv.draft) === "1", date: isoDate(inv.date) }); }
      const pg = j.pagination as Json | undefined;
      if (!pg || !pg.next) break;
    }
    const known = new Map((await query<{ id: string; modified: string }>("SELECT id, modified FROM daftra_invoices")).rows.map(r => [Number(r.id), r.modified] as [number, string]));
    const live = listed.filter(x => !x.draft);
    const todo = live.filter(x => known.get(x.id) !== x.modified);
    let updated = 0;
    for (const x of todo) {
      const j = await get(`invoices/${x.id}.json`);
      const { row, lines } = mapInvoice(((j.data as Json).Invoice) as Json);
      // the list payload is authoritative for date/modified (stable formats → no needless refetch)
      if (x.date) row.invoice_date = x.date; row.modified = x.modified;
      if (!row.invoice_date) continue;
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query(`INSERT INTO daftra_invoices(id,no,invoice_date,due_days,client_id,client_name,client_city,branch,payment_status,currency,net,tax,total,paid,unpaid,refund,modified,synced_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())
          ON CONFLICT(id) DO UPDATE SET no=$2,invoice_date=$3,due_days=$4,client_id=$5,client_name=$6,client_city=$7,branch=$8,payment_status=$9,currency=$10,net=$11,tax=$12,total=$13,paid=$14,unpaid=$15,refund=$16,modified=$17,synced_at=now()`,
          [row.id, row.no, row.invoice_date, row.due_days, row.client_id, row.client_name, row.client_city, row.branch, row.payment_status, row.currency, row.net, row.tax, row.total, row.paid, row.unpaid, row.refund, row.modified]);
        await c.query("DELETE FROM daftra_invoice_items WHERE invoice_id=$1", [row.id]);
        for (const l of lines) await c.query("INSERT INTO daftra_invoice_items(invoice_id,line,product_id,item,quantity,unit_price,discount,net,tax) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [row.id, l.line, l.product_id, l.item, l.quantity, l.unit_price, l.discount, l.net, l.tax]);
        await c.query("COMMIT"); updated++;
      } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
    }
    const liveIds = live.map(x => x.id);
    await query("DELETE FROM daftra_invoices WHERE NOT (id = ANY($1::bigint[]))", [liveIds]);
    await query("UPDATE daftra_sync SET finished_at=now(), ok=true, message=$1, invoices=$2 WHERE id=1", [`تمت المزامنة — ${updated} فاتورة محدّثة`, live.length]);
    return { invoices: live.length, updated };
  } catch (e) {
    await query("UPDATE daftra_sync SET finished_at=now(), ok=false, message=$1 WHERE id=1", [String((e as Error).message).slice(0, 300)]).catch(() => {});
    throw e;
  }
}

/** Starts a background sync when the mirror is older than `maxAgeMin` (never blocks the page). */
export async function syncIfStale(maxAgeMin = 60) {
  if (!daftraConfigured() || running) return;
  const s = (await query("SELECT finished_at, started_at FROM daftra_sync WHERE id=1")).rows[0] as { finished_at: string | null; started_at: string | null } | undefined;
  const last = s?.finished_at ? new Date(s.finished_at).getTime() : 0;
  if (Date.now() - last > maxAgeMin * 60000) void syncDaftra().catch(e => console.error("daftra sync", e));
}

export async function daftraSummary(from: string, to: string, branch?: string) {
  const vals: unknown[] = [from, to]; let b = "";
  if (branch) { vals.push(branch); b = "AND i.branch=$3"; }
  // Revenue recognised net of VAT; fully refunded invoices count as zero, partial refunds pro-rated.
  const rev = "(i.net * CASE WHEN i.total > 0 THEN GREATEST(0, 1 - i.refund / i.total) ELSE 1 END)";
  const [k, monthly, products, clients, branches, aging, invoices, sync] = await Promise.all([
    query(`SELECT count(*)::int n, COALESCE(sum(${rev}),0)::float8 net, COALESCE(sum(i.tax),0)::float8 tax, COALESCE(sum(i.total),0)::float8 total, COALESCE(sum(i.paid),0)::float8 paid,
      COALESCE(sum(i.unpaid) FILTER (WHERE i.payment_status<>3),0)::float8 unpaid, COALESCE(sum(i.refund),0)::float8 refund, count(DISTINCT i.client_id)::int clients
      FROM daftra_invoices i WHERE i.invoice_date BETWEEN $1 AND $2 ${b}`, vals),
    query(`SELECT to_char(i.invoice_date,'YYYY-MM') m, sum(${rev})::float8 net, sum(i.paid)::float8 paid, count(*)::int n FROM daftra_invoices i WHERE i.invoice_date BETWEEN $1 AND $2 ${b} GROUP BY 1 ORDER BY 1`, vals),
    query(`SELECT it.item, sum(it.quantity)::float8 qty, sum(it.net * CASE WHEN i.total > 0 THEN GREATEST(0, 1 - i.refund / i.total) ELSE 1 END)::float8 net, count(DISTINCT i.id)::int n,
      CASE WHEN sum(it.quantity) > 0 THEN (sum(it.net) / sum(it.quantity))::float8 END avg_price
      FROM daftra_invoice_items it JOIN daftra_invoices i ON i.id=it.invoice_id WHERE i.invoice_date BETWEEN $1 AND $2 ${b} GROUP BY 1 ORDER BY 3 DESC NULLS LAST LIMIT 25`, vals),
    query(`SELECT i.client_name, max(i.client_city) city, sum(${rev})::float8 net, sum(i.unpaid) FILTER (WHERE i.payment_status<>3)::float8 unpaid, count(*)::int n, max(i.invoice_date)::text last
      FROM daftra_invoices i WHERE i.invoice_date BETWEEN $1 AND $2 ${b} GROUP BY 1 ORDER BY 3 DESC NULLS LAST LIMIT 25`, vals),
    query(`SELECT COALESCE(NULLIF(i.branch,''),'—') branch, sum(${rev})::float8 net, count(*)::int n FROM daftra_invoices i WHERE i.invoice_date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 2 DESC`, [from, to]),
    // receivables aging by days past due, across all time (collections don't depend on the sales period)
    query(`SELECT CASE WHEN d <= 0 THEN 'current' WHEN d <= 30 THEN '1-30' WHEN d <= 60 THEN '31-60' WHEN d <= 90 THEN '61-90' ELSE '90+' END bucket, sum(unpaid)::float8 v, count(*)::int n
      FROM (SELECT i.unpaid, (CURRENT_DATE - (i.invoice_date + i.due_days))::int d FROM daftra_invoices i WHERE i.unpaid > 0 AND i.payment_status IN (0,1) ${branch ? "AND i.branch=$1" : ""}) x GROUP BY 1`, branch ? [branch] : []),
    query(`SELECT i.id::text id, i.no, i.invoice_date::text date, i.client_name, i.branch, i.payment_status, ${rev}::float8 net, i.total::float8 total, i.unpaid::float8 unpaid,
      (CURRENT_DATE - (i.invoice_date + i.due_days))::int overdue_days FROM daftra_invoices i WHERE i.invoice_date BETWEEN $1 AND $2 ${b} ORDER BY i.invoice_date DESC, i.id DESC LIMIT 300`, vals),
    query("SELECT started_at, finished_at, ok, message, invoices FROM daftra_sync WHERE id=1"),
  ]);
  return { kpi: k.rows[0], monthly: monthly.rows, products: products.rows, clients: clients.rows, branches: branches.rows, aging: aging.rows, invoices: invoices.rows, sync: sync.rows[0] };
}
