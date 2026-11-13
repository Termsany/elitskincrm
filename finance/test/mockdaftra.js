// سيرفر وهمي يحاكي دفترة لاختبار المزامنة محليًا.
const http = require('http');
const PORT = 4499;
function page(data, pageNo) { return { code: 200, result: 'successful', data, pagination: { page: pageNo, page_count: 1, total_results: data.length } }; }
const clients = [
  { Client: { id: 1, business_name: 'مركز الندى التجميلي', phone1: '01000000001' } },
  { Client: { id: 2, first_name: 'منى', last_name: 'عبد الرحمن', phone1: '01000000002' } },
  { Client: { id: 3, business_name: 'صيدلية الشفاء', phone1: '01000000003' } }
];
const suppliers = [
  { Supplier: { id: 10, supplier_business_name: 'شركة ديرما', phone1: '01100000001' } },
  { Supplier: { id: 11, supplier_business_name: 'مصنع كير', phone1: '01100000002' } }
];
const today = new Date();
const d = k => { const x = new Date(today); x.setDate(x.getDate() + k); return x.toISOString().slice(0, 10); };
const mAgo = k => { const x = new Date(today); x.setMonth(x.getMonth() - k); return x.toISOString().slice(0, 10); };
const invoices = [
  { Invoice: { id: 101, no: 'INV-1', client_id: 1, date: mAgo(0), due_date: d(-45), summary_total: 38500, summary_paid: 0, payment_status: 'unpaid' } },
  { Invoice: { id: 102, no: 'INV-2', client_id: 2, date: mAgo(0), due_date: d(-10), summary_total: 21200, summary_paid: 1200, payment_status: 'partial' } },
  { Invoice: { id: 103, no: 'INV-3', client_id: 3, date: mAgo(0), due_date: d(12), summary_total: 27500, summary_paid: 0, payment_status: 'unpaid' } },
  { Invoice: { id: 104, no: 'INV-4', client_id: 1, date: mAgo(1), due_date: d(-70), summary_total: 46000, summary_paid: 46000, payment_status: 'paid' } },
  { Invoice: { id: 105, no: 'INV-5', client_id: 2, date: mAgo(2), summary_total: 33000, summary_paid: 33000, payment_status: 'paid' } }
];
const purchases = [
  { PurchaseInvoice: { id: 201, no: 'PUR-1', supplier_id: 10, date: mAgo(0), due_date: d(-40), summary_total: 52000, summary_paid: 0, payment_status: 'unpaid' } },
  { PurchaseInvoice: { id: 202, no: 'PUR-2', supplier_id: 11, date: mAgo(0), due_date: d(20), summary_total: 64000, summary_paid: 0, payment_status: 'unpaid' } },
  { PurchaseInvoice: { id: 203, no: 'PUR-3', supplier_id: 10, date: mAgo(1), summary_total: 29800, summary_paid: 29800, payment_status: 'paid' } }
];
const routes = { '/api2/clients.json': clients, '/api2/suppliers.json': suppliers, '/api2/invoices.json': invoices, '/api2/purchase_invoices.json': purchases };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.headers['apikey'] !== 'TEST-KEY') { res.writeHead(401); return res.end('{"error":"bad key"}'); }
  const data = routes[u.pathname];
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(page(data || [], +u.searchParams.get('page') || 1)));
});
srv.listen(PORT, () => console.log('mock daftra on ' + PORT));
module.exports = srv;
