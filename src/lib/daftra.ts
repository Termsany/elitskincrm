import { pool, query } from "@/lib/db";

/**
 * Daftra API client — strictly READ-ONLY (GET requests only). Nothing in the CRM ever writes to Daftra.
 * Credentials come from the server environment, never from the browser.
 */
const SUB = () => (process.env.DAFTRA_SUBDOMAIN || "").trim();
const KEY = () => (process.env.DAFTRA_API_KEY || "").trim();
export const daftraConfigured = () => !!SUB() && !!KEY();
export const daftraInvoiceUrl = (id: number | string) => `https://${SUB()}.daftra.com/owner/invoices/view/${id}`;
export const PAYMENT_LABEL: Record<number, string> = { 0: "غير مدفوعة", 1: "مدفوعة جزئياً", 2: "مدفوعة", 3: "مرتجعة" };

type Json = Record<string, unknown>;
async function get(path: string): Promise<Json> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://${SUB()}.daftra.com/api2/${path}`, { method: "GET", headers: { APIKEY: KEY(), Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(30000) });
    if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 1500 * (attempt + 1))); continue; }
    const j = await r.json().catch(() => null) as Json | null;
    if (!r.ok || !j || j.result !== "successful") throw new Error(`Daftra ${path.split("?")[0]}: HTTP ${r.status} ${String(j?.message || "")}`.trim());
    return j;
  }
  throw new Error(`Daftra ${path.split("?")[0]}: retries exhausted`);
}
/** Reads every page of a list endpoint and returns the inner objects under `key`. */
async function listAll(endpoint: string, key: string): Promise<Json[]> {
  const out: Json[] = [];
  for (let page = 1; page < 500; page++) {
    const j = await get(`${endpoint}.json?limit=100&page=${page}`);
    for (const x of (j.data as Json[]) || []) if (x[key]) out.push(x[key] as Json);
    const pg = j.pagination as Json | undefined;
    if (!pg || !pg.next) break;
  }
  return out;
}
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Daftra returns ISO dates in lists but the account date format (dd/mm/yyyy) in details. */
export function isoDate(v: unknown) { const s = String(v || "").trim(); const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`; const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/); return dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : ""; }

/** Pure mapping of a sales invoice OR purchase invoice detail payload to our row + lines. Exported for tests. */
export function mapInvoice(inv: Json, kind: "sale" | "purchase" = "sale") {
  const P = kind === "sale" ? { items: "InvoiceItem", tax: "InvoiceTax", cf: "InvoiceCustomField", party: "client" } : { items: "PurchaseOrderItem", tax: "PurchaseOrderTax", cf: "PurchaseOrderCustomField", party: "supplier" };
  const items = (Array.isArray(inv[P.items]) ? inv[P.items] : []) as Json[];
  const taxes = Object.values((inv[P.tax] && typeof inv[P.tax] === "object" ? inv[P.tax] : {}) as Record<string, Json>);
  const cf = (Array.isArray(inv[P.cf]) ? inv[P.cf] : []) as Json[];
  const total = num(inv.summary_total);
  const tax = r2(taxes.reduce((s, t) => s + num(t.invoice_value), 0));
  const party = (inv[`${P.party}_business_name`] as string) || [inv[`${P.party}_first_name`], inv[`${P.party}_last_name`]].filter(Boolean).join(" ");
  return {
    row: {
      id: num(inv.id), no: String(inv.no || ""), invoice_date: isoDate(inv.date || inv.issue_date), due_days: num(inv.due_after),
      party_id: inv[`${P.party}_id`] ? num(inv[`${P.party}_id`]) : null, party_name: String(party || "").trim(), city: String(inv[`${P.party}_city`] || "").trim(),
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

/** Expense/income entry → net-of-VAT amount + VAT. */
export function mapCash(e: Json, kind: "expense" | "income") {
  const amount = num(e.amount), tax = r2(num(e.tax1_amount) + num(e.tax2_amount));
  const included = String(e.tax1_included) === "1" || String(e.tax2_included) === "1";
  return { id: num(e.id), kind, entry_date: isoDate(e.date), amount: r2(included ? amount - tax : amount), tax, account_id: e.journal_account_id ? num(e.journal_account_id) : null,
    vendor: String(e.vendor || "").trim(), note: String(e.note || "").trim(), modified: String(e.modified || "") };
}

let running: Promise<SyncResult> | null = null;
type SyncResult = { invoices: number; updated: number; purchases: number; products: number; payments: number; entries: number };
/** Incremental sync of everything the finance hub needs. */
export function syncDaftra() {
  if (!running) running = doSync().finally(() => { running = null; });
  return running;
}

async function syncDocs(kind: "sale" | "purchase") {
  const T = kind === "sale" ? { list: "invoices", key: "Invoice", table: "daftra_invoices", items: "daftra_invoice_items", fk: "invoice_id" }
    : { list: "purchase_invoices", key: "PurchaseOrder", table: "daftra_purchases", items: "daftra_purchase_items", fk: "purchase_id" };
  const listed = (await listAll(T.list, T.key)).filter(x => String(x.type) === "0" && String(x.draft) !== "1")
    .map(x => ({ id: num(x.id), modified: String(x.modified || ""), date: isoDate(x.date) }));
  const known = new Map((await query<{ id: string; modified: string }>(`SELECT id, modified FROM ${T.table}`)).rows.map(r => [Number(r.id), r.modified] as [number, string]));
  let updated = 0;
  for (const x of listed.filter(l => known.get(l.id) !== l.modified)) {
    const j = await get(`${T.list}/${x.id}.json`);
    const { row, lines } = mapInvoice(((j.data as Json)[T.key]) as Json, kind);
    if (x.date) row.invoice_date = x.date; row.modified = x.modified;   // list payload is authoritative (stable formats)
    if (!row.invoice_date) continue;
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      if (kind === "sale") await c.query(`INSERT INTO daftra_invoices(id,no,invoice_date,due_days,client_id,client_name,client_city,branch,payment_status,currency,net,tax,total,paid,unpaid,refund,modified,synced_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())
        ON CONFLICT(id) DO UPDATE SET no=$2,invoice_date=$3,due_days=$4,client_id=$5,client_name=$6,client_city=$7,branch=$8,payment_status=$9,currency=$10,net=$11,tax=$12,total=$13,paid=$14,unpaid=$15,refund=$16,modified=$17,synced_at=now()`,
        [row.id, row.no, row.invoice_date, row.due_days, row.party_id, row.party_name, row.city, row.branch, row.payment_status, row.currency, row.net, row.tax, row.total, row.paid, row.unpaid, row.refund, row.modified]);
      else await c.query(`INSERT INTO daftra_purchases(id,no,invoice_date,due_days,supplier_id,supplier_name,payment_status,net,tax,total,paid,unpaid,refund,modified,synced_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
        ON CONFLICT(id) DO UPDATE SET no=$2,invoice_date=$3,due_days=$4,supplier_id=$5,supplier_name=$6,payment_status=$7,net=$8,tax=$9,total=$10,paid=$11,unpaid=$12,refund=$13,modified=$14,synced_at=now()`,
        [row.id, row.no, row.invoice_date, row.due_days, row.party_id, row.party_name, row.payment_status, row.net, row.tax, row.total, row.paid, row.unpaid, row.refund, row.modified]);
      await c.query(`DELETE FROM ${T.items} WHERE ${T.fk}=$1`, [row.id]);
      for (const l of lines) await c.query(`INSERT INTO ${T.items}(${T.fk},line,product_id,item,quantity,unit_price,discount,net,tax) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [row.id, l.line, l.product_id, l.item, l.quantity, l.unit_price, l.discount, l.net, l.tax]);
      await c.query("COMMIT"); updated++;
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
  }
  await query(`DELETE FROM ${T.table} WHERE NOT (id = ANY($1::bigint[]))`, [listed.map(x => x.id)]);
  return { count: listed.length, updated };
}

async function replaceAll(table: string, cols: string[], rows: unknown[][], where = "") {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`DELETE FROM ${table} ${where}`);
    const ph = cols.map((_, i) => `$${i + 1}`).join(",");
    for (const r of rows) await c.query(`INSERT INTO ${table}(${cols.join(",")}) VALUES(${ph})`, r);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}

async function doSync(): Promise<SyncResult> {
  if (!daftraConfigured()) throw new Error("Daftra is not configured");
  await query("UPDATE daftra_sync SET started_at=now(), message='جارٍ المزامنة…' WHERE id=1");
  try {
    const sales = await syncDocs("sale");
    const purchases = await syncDocs("purchase");
    const products = await listAll("products", "Product");
    await replaceAll("daftra_products", ["id", "name", "code", "list_price", "buy_price", "average_cost", "min_price", "stock", "track_stock", "active"],
      products.map(p => [num(p.id), String(p.name || "").trim(), String(p.product_code || ""), num(p.unit_price), num(p.buy_price), num(p.average_price), p.minimum_price ? num(p.minimum_price) : null, num(p.stock_balance), String(p.track_stock) === "1", String(p.deactivate) !== "1"]));
    const payments = await listAll("client_payments", "ClientPayment");
    await replaceAll("daftra_client_payments", ["id", "pay_date", "amount", "client_id", "invoice_id", "method", "status"],
      payments.filter(p => isoDate(p.date) && String(p.status) === "1").map(p => [num(p.id), isoDate(p.date), num(p.amount), p.client_id ? num(p.client_id) : null, p.invoice_id ? num(p.invoice_id) : null, String(p.payment_method || ""), String(p.status || "")]));
    const accounts = await listAll("journal_accounts", "JournalAccount");
    await replaceAll("daftra_accounts", ["id", "code", "name", "cat_id"], accounts.map(a => [num(a.id), String(a.code || ""), String(a.name || "").trim(), a.journal_cat_id ? num(a.journal_cat_id) : null]));
    const exp = (await listAll("expenses", "Expense")).map(e => mapCash(e, "expense")), inc = (await listAll("incomes", "Income")).map(e => mapCash(e, "income"));
    const entries = [...exp, ...inc].filter(e => e.entry_date);
    await replaceAll("daftra_cash_entries", ["id", "kind", "entry_date", "amount", "tax", "account_id", "vendor", "note", "modified"],
      entries.map(e => [e.id, e.kind, e.entry_date, e.amount, e.tax, e.account_id, e.vendor, e.note, e.modified]));
    const result = { invoices: sales.count, updated: sales.updated + purchases.updated, purchases: purchases.count, products: products.length, payments: payments.length, entries: entries.length };
    await query("UPDATE daftra_sync SET finished_at=now(), ok=true, message=$1, invoices=$2 WHERE id=1",
      [`تمت المزامنة — ${sales.count} فاتورة بيع، ${purchases.count} فاتورة شراء، ${entries.length} مصروف/إيراد`, sales.count]);
    return result;
  } catch (e) {
    await query("UPDATE daftra_sync SET finished_at=now(), ok=false, message=$1 WHERE id=1", [String((e as Error).message).slice(0, 300)]).catch(() => {});
    throw e;
  }
}

/** Starts a background sync when the mirror is older than `maxAgeMin` (never blocks the page). */
export async function syncIfStale(maxAgeMin = 60) {
  if (!daftraConfigured() || running) return;
  const s = (await query("SELECT finished_at FROM daftra_sync WHERE id=1")).rows[0] as { finished_at: string | null } | undefined;
  const last = s?.finished_at ? new Date(s.finished_at).getTime() : 0;
  if (Date.now() - last > maxAgeMin * 60000) void syncDaftra().catch(e => console.error("daftra sync", e));
}
export const syncRunning = () => !!running;
