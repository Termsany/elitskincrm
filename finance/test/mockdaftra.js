// سيرفر وهمي يحاكي دفترة لاختبار المزامنة محليًا (بيانات ثابتة قابلة للتكرار).
const http = require('http');
const PORT = +process.env.MOCK_PORT || 4499;
function page(all, pageNo, limit) {
  const data = all.slice((pageNo - 1) * limit, pageNo * limit);
  return { code: 200, result: 'successful', data, pagination: { page: pageNo, page_count: Math.max(1, Math.ceil(all.length / limit)), total_results: all.length } };
}
const names = ['مركز الندى التجميلي', 'صيدلية الشفاء', 'عيادة د. منى عبد الرحمن', 'مستشفى السلام', 'عيادات لمسة', 'صيدلية النهدي فرع العليا', 'مركز ديرما كير', 'عيادة د. سارة', 'صيدلية الدواء', 'مجمع بلسم الطبي', 'عيادة نضارة', 'مركز روزا'];
const clients = names.map((n, i) => ({ Client: { id: i + 1, business_name: n, phone1: '05' + String(50000000 + i * 1111).padStart(8, '0') } }));

// فواتير 14 شهر: عملاء 1-8 نشطين، 9-12 "نايمين" (آخر شراء من 3-5 شهور)
const now = new Date();
const dt = (mAgo, day) => { const d = new Date(now.getFullYear(), now.getMonth() - mAgo, Math.min(day, 28)); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const addDays = (s, k) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + k); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const invoices = []; let id = 100, seed = 7;
const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
for (let mAgo = 13; mAgo >= 0; mAgo--) {
  for (let c = 1; c <= 12; c++) {
    if (c >= 9 && mAgo < 3 + (c - 9) % 3) continue;          // نايمين
    if (mAgo === 0 && (c === 5 || c === 7 || c === 8)) continue; // نشطين ما اشتروش الشهر ده
    const day = mAgo === 0 ? Math.max(1, Math.min(now.getDate() - 1, 1 + Math.floor(rnd() * 12))) : 1 + Math.floor(rnd() * 27);
    const date = dt(mAgo, day);
    const total = Math.round((30000 - c * 1800) * (0.7 + rnd() * 0.6) * (1 + (mAgo % 12 === 2 ? 0.3 : 0)));
    let paid = total;
    if (mAgo <= 2 && c % 3 === 1) paid = 0;                   // مديونيات
    if (mAgo === 1 && c === 2) paid = Math.round(total / 2);
    invoices.push({ Invoice: { id: ++id, no: 'INV-' + id, client_id: c, date, due_date: addDays(date, 30), summary_total: total, summary_paid: paid, payment_status: paid >= total ? 'paid' : paid ? 'partial' : 'unpaid' } });
  }
}
invoices.push({ Invoice: { id: ++id, no: 'INV-DRAFT', client_id: 1, date: dt(0, 1), summary_total: 99999, summary_paid: 0, draft: 1, payment_status: 'unpaid' } });

const routes = { '/api2/clients.json': clients, '/api2/invoices.json': invoices };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.headers['apikey'] !== 'TEST-KEY') { res.writeHead(401); return res.end('{"error":"bad key"}'); }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(page(routes[u.pathname] || [], +u.searchParams.get('page') || 1, +u.searchParams.get('limit') || 20)));
});
srv.listen(PORT, () => console.log('mock daftra on ' + PORT));
module.exports = srv;
module.exports.invoices = invoices;
