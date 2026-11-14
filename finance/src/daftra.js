// عميل دفترة — يسحب العملاء وفواتير البيع فقط (قراءة فقط).
// مبني على Daftra API v2: https://{subdomain}.{domain}/api2
// التوثيق: https://docs.daftara.dev

// الإعدادات تُقرأ أولًا من صفحة الإعدادات داخل البرنامج، ثم من متغيرات البيئة كاحتياطي.
const store = require('./store');
const sget = k => { try { return (store.get().settings || {})[k]; } catch (e) { return undefined; } };
const SUB = () => sget('daftraSubdomain') || process.env.DAFTRA_SUBDOMAIN;
const DOMAIN = () => sget('daftraDomain') || process.env.DAFTRA_DOMAIN || 'daftara.com';
const KEY = () => sget('daftraApikey') || process.env.DAFTRA_APIKEY || process.env.DAFTRA_API_KEY;

function configured() { return !!((SUB() || process.env.DAFTRA_BASE_URL) && KEY()); }
// DAFTRA_BASE_URL يُستخدم للاختبار المحلي فقط؛ في الإنتاج يُبنى العنوان من الساب دومين.
function base() { return process.env.DAFTRA_BASE_URL || `https://${SUB()}.${DOMAIN()}/api2`; }

async function call(endpoint, params = {}) {
  if (!configured()) throw new Error('DAFTRA_NOT_CONFIGURED');
  const url = new URL(base() + endpoint);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    headers: {
      'apikey': KEY(),
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });
  const text = await res.text();
  if (!res.ok) {
    const snippet = text.slice(0, 200);
    throw new Error(`DAFTRA_HTTP_${res.status}: ${snippet}`);
  }
  let json;
  try { json = JSON.parse(text); }
  catch (e) { throw new Error('DAFTRA_BAD_JSON: ' + text.slice(0, 160)); }
  return json;
}

// يجيب كل الصفحات لنقطة نهاية معينة
async function fetchAll(endpoint, params = {}, max = 50) {
  const out = [];
  let page = 1;
  while (page <= max) {
    const json = await call(endpoint, Object.assign({ page, limit: 100 }, params));
    const data = Array.isArray(json.data) ? json.data : [];
    for (const row of data) out.push(unwrap(row));
    const pc = json.pagination && (json.pagination.page_count || json.pagination.pages);
    if (!pc || page >= pc || data.length === 0) break;
    page++;
  }
  return out;
}

// دفترة بترجع كل عنصر داخل مفتاح باسم الكيان: {Invoice:{...}} أو {Client:{...}}
function unwrap(row) {
  if (row && typeof row === 'object' && !Array.isArray(row)) {
    const keys = Object.keys(row);
    if (keys.length === 1 && row[keys[0]] && typeof row[keys[0]] === 'object') {
      return row[keys[0]];
    }
  }
  return row;
}

// ===== أدوات تطبيع =====
const pick = (o, keys, def = null) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return def;
};
const num = v => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};
const ymd = v => {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const fullName = (o, prefix = '') => {
  const biz = pick(o, [prefix + 'business_name', prefix + 'name', 'business_name', 'name']);
  if (biz) return String(biz);
  const f = pick(o, [prefix + 'first_name', 'first_name'], '');
  const l = pick(o, [prefix + 'last_name', 'last_name'], '');
  const n = (f + ' ' + l).trim();
  return n || null;
};

function normClient(c) {
  return {
    id: pick(c, ['id', 'client_id']),
    name: fullName(c) || ('عميل #' + pick(c, ['id'], '')),
    phone: pick(c, ['phone1', 'phone2', 'mobile', 'phone'], '')
  };
}
// فاتورة بيع -> رصيد مستحق على العميل
function normInvoice(inv) {
  const total = num(pick(inv, ['summary_total', 'total', 'grand_total', 'net_total', 'amount']));
  const paid = num(pick(inv, ['summary_paid', 'paid', 'payment_total', 'total_paid', 'deposit']));
  const outstandingField = pick(inv, ['summary_unpaid', 'unpaid', 'remaining', 'balance', 'due_amount'], null);
  const outstanding = outstandingField !== null ? num(outstandingField) : Math.max(0, total - paid);
  const date = ymd(pick(inv, ['date', 'created', 'invoice_date']));
  const due = ymd(pick(inv, ['due_date', 'payment_due_date', 'date_due'])) || date;
  const status = String(pick(inv, ['payment_status', 'status'], '') || '').toLowerCase();
  return {
    id: pick(inv, ['id']),
    no: pick(inv, ['no', 'invoice_no', 'number'], ''),
    clientId: pick(inv, ['client_id', 'contact_id']),
    clientName: fullName(inv, 'client_') || null,
    date, due, total, paid, outstanding, status,
    draft: !!pick(inv, ['draft'], false)
  };
}

const unpaid = r => !r.draft && r.outstanding > 0.5 &&
  !['paid', 'refunded', 'canceled', 'cancelled'].includes(r.status);

// ===== السحب الكامل وبناء البيانات (المبيعات ومديونيات العملاء فقط) =====
const pad = n => String(n).padStart(2, '0');
const localYmd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

async function pullAll(now = new Date()) {
  const [clientsRaw, invoicesRaw] = await Promise.all([
    fetchAll('/clients.json', {}, 200),
    fetchAll('/invoices.json', {}, 300)
  ]);

  const clients = clientsRaw.map(normClient).filter(c => c.id != null);
  const invoices = invoicesRaw.map(normInvoice).filter(i => i.id != null && !i.draft);
  const byId = new Map(clients.map(c => [String(c.id), c]));
  const nameOf = i => i.clientName || (byId.get(String(i.clientId)) || {}).name || ('عميل #' + i.clientId);

  const receivables = invoices.filter(unpaid).map(i => ({
    who: i.clientId, name: nameOf(i), inv: i.no || ('#' + i.id),
    amount: i.outstanding, due: i.due || i.date, date: i.date
  })).filter(r => r.due);

  const today = localYmd(now), curMonth = today.slice(0, 7);
  const from12 = localYmd(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
  const from70 = localYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 70));

  const sales = {}, salesCount = {}, daily = {}, stats = new Map();
  for (const i of invoices) {
    if (!i.date) continue;
    const m = i.date.slice(0, 7);
    sales[m] = (sales[m] || 0) + i.total;
    salesCount[m] = (salesCount[m] || 0) + 1;
    if (i.date >= from70) daily[i.date] = (daily[i.date] || 0) + i.total;
    if (i.clientId == null) continue;
    const k = String(i.clientId);
    let st = stats.get(k);
    if (!st) { st = { id: i.clientId, name: nameOf(i), phone: (byId.get(k) || {}).phone || '', t12: 0, cm: 0, count: 0, last: null, all: 0 }; stats.set(k, st); }
    st.count++; st.all += i.total;
    if (i.date >= from12) st.t12 += i.total;
    if (m === curMonth) st.cm += i.total;
    if (!st.last || i.date > st.last) st.last = i.date;
  }
  const clientStats = [...stats.values()].map(s => ({
    id: s.id, name: s.name, phone: s.phone, t12: Math.round(s.t12), cm: Math.round(s.cm),
    count: s.count, last: s.last, avg: Math.round(s.all / s.count)
  }));

  return {
    clients, receivables, sales, salesCount, daily, clientStats, statsMonth: curMonth,
    sampleInvoice: invoicesRaw[0] || null,
    counts: { clients: clients.length, invoices: invoices.length, open: receivables.length }
  };
}

module.exports = { configured, pullAll, call, fetchAll, base };
