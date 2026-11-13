require('dotenv').config();
const path = require('path');
const express = require('express');
const cron = require('node-cron');
const store = require('./store');
const daftra = require('./daftra');
const { runSync } = require('./sync');
const ai = require('./ai');
const auth = require('./auth');
const finance = require('./finance');

const CATS = ['إيجار', 'مرتبات', 'تسويق', 'مرافق', 'أقساط', 'صيانة', 'اشتراكات', 'أخرى'];
const TYPES = ['fixed', 'temp', 'once'];
const CURRENCY = () => process.env.CURRENCY || 'ج.م';

store.load();
const app = express();
app.disable('x-powered-by');
// خلف nginx: نثق في X-Forwarded-Proto/For عشان الكوكي Secure و IP الصحيح
app.set('trust proxy', 'loopback, uniquelocal');
app.use(express.json({ limit: '1mb' }));

const PUB = path.join(__dirname, '..', 'public');

// حماية: كل شيء يتطلب دخول ما عدا صفحة ومسار الدخول وملفات الواجهة
function requireAuth(req, res, next) {
  if (auth.isAuthed(req)) return next();
  return res.status(401).json({ error: 'UNAUTHORIZED' });
}

// فحص صحة الخدمة (يُستخدم في النشر التلقائي)
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/login', (req, res) => {
  const ip = req.ip;
  if (!auth.passwordConfigured()) return res.status(503).json({ ok: false, error: 'لم تُضبط كلمة المرور على السيرفر (APP_PASSWORD في .env).' });
  if (auth.tooManyAttempts(ip)) return res.status(429).json({ ok: false, error: 'محاولات كثيرة خاطئة. حاول بعد ربع ساعة.' });
  if (auth.checkPassword((req.body || {}).password)) { auth.clearFails(ip); auth.setSession(req, res); return res.json({ ok: true }); }
  auth.recordFail(ip);
  res.status(401).json({ ok: false, error: 'كلمة المرور غير صحيحة' });
});
app.post('/api/logout', (req, res) => { auth.clearSession(req, res); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json({ authed: auth.isAuthed(req) }));

// بيانات التطبيق
app.get('/api/data', requireAuth, (req, res) => {
  const db = store.get(), c = db.cache;
  res.json({
    currency: CURRENCY(),
    cats: CATS,
    expenses: db.expenses,
    clients: c.clients, suppliers: c.suppliers,
    receivables: c.receivables, payables: c.payables,
    sales: c.sales, purchases: c.purchases,
    lastSync: c.lastSync, lastError: c.lastError,
    daftraConfigured: daftra.configured(),
    aiConfigured: !!(db.settings.anthropicKey || process.env.ANTHROPIC_API_KEY),
    today: new Date().toISOString().slice(0, 10)
  });
});

// ===== الإعدادات (إدخال مفتاح دفترة من داخل البرنامج) =====
app.get('/api/settings', requireAuth, (req, res) => {
  const s = store.get().settings;
  res.json({
    daftraSubdomain: s.daftraSubdomain || '',
    daftraDomain: s.daftraDomain || 'daftara.com',
    daftraApikeySet: !!s.daftraApikey,
    anthropicKeySet: !!s.anthropicKey,
    syncEveryMinutes: s.syncEveryMinutes || 60,
    envDaftra: !!(process.env.DAFTRA_APIKEY || process.env.DAFTRA_API_KEY),
    envAnthropic: !!process.env.ANTHROPIC_API_KEY
  });
});

app.post('/api/settings', requireAuth, async (req, res) => {
  const b = req.body || {};
  const s = store.get().settings;
  if (typeof b.daftraSubdomain === 'string') s.daftraSubdomain = b.daftraSubdomain.trim().replace(/^https?:\/\//, '').split('.')[0];
  if (typeof b.daftraDomain === 'string' && b.daftraDomain.trim()) s.daftraDomain = b.daftraDomain.trim();
  // المفاتيح تُحدّث فقط لو أُرسلت قيمة جديدة غير فارغة (الفراغ = إبقاء القديم)
  if (typeof b.daftraApikey === 'string' && b.daftraApikey.trim()) s.daftraApikey = b.daftraApikey.trim();
  if (typeof b.anthropicKey === 'string' && b.anthropicKey.trim()) s.anthropicKey = b.anthropicKey.trim();
  if (b.clearDaftraKey) s.daftraApikey = '';
  if (b.clearAnthropicKey) s.anthropicKey = '';
  if (b.syncEveryMinutes) s.syncEveryMinutes = Math.max(5, parseInt(b.syncEveryMinutes, 10) || 60);
  store.save();
  // مزامنة فورية بعد الحفظ لو دفترة مضبوطة
  let sync = null;
  if (daftra.configured()) sync = await runSync();
  res.json({ ok: true, sync });
});

// اختبار الاتصال بدفترة بالمفتاح المحفوظ
app.post('/api/daftra/test', requireAuth, async (req, res) => {
  if (!daftra.configured()) return res.json({ ok: false, error: 'اكتب الساب دومين والمفتاح واحفظ أولًا.' });
  try {
    const sample = await daftra.fetchAll('/clients.json', {}, 1);
    res.json({ ok: true, message: 'الاتصال ناجح. تم العثور على ' + sample.length + ' عميل في أول صفحة.' });
  } catch (e) {
    res.json({ ok: false, error: String(e.message || e) });
  }
});

// مصاريف: إضافة
app.post('/api/expenses', requireAuth, (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const amount = parseFloat(b.amount);
  const cat = CATS.includes(b.cat) ? b.cat : 'أخرى';
  const type = TYPES.includes(b.type) ? b.type : 'once';
  if (!name) return res.status(400).json({ error: 'اسم البند مطلوب' });
  if (!(amount > 0)) return res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' });
  const e = { id: store.nextId(), name, cat, amount, type };
  const mo = /^\d{4}-\d{2}$/, d = /^\d{4}-\d{2}-\d{2}$/;
  if (type === 'once') {
    if (!d.test(b.date || '')) return res.status(400).json({ error: 'تاريخ غير صالح' });
    e.date = b.date;
  } else {
    if (!mo.test(b.start || '')) return res.status(400).json({ error: 'شهر البداية غير صالح' });
    e.start = b.start;
    if (type === 'temp') {
      if (!mo.test(b.end || '') || b.end < b.start) return res.status(400).json({ error: 'آخر شهر غير صالح' });
      e.end = b.end;
    }
  }
  store.get().expenses.push(e);
  store.save();
  res.json({ ok: true, expense: e });
});

// مصاريف: إيقاف متكرر اعتبارًا من شهر
app.post('/api/expenses/:id/stop', requireAuth, (req, res) => {
  const e = store.get().expenses.find(x => x.id === +req.params.id);
  if (!e) return res.status(404).json({ error: 'غير موجود' });
  const stop = String((req.body || {}).from || '');
  if (!/^\d{4}-\d{2}$/.test(stop)) return res.status(400).json({ error: 'شهر غير صالح' });
  e.stop = stop; store.save(); res.json({ ok: true });
});

// مصاريف: حذف
app.delete('/api/expenses/:id', requireAuth, (req, res) => {
  const db = store.get();
  db.expenses = db.expenses.filter(x => x.id !== +req.params.id);
  store.save(); res.json({ ok: true });
});

// مزامنة يدوية
app.post('/api/sync', requireAuth, async (req, res) => { res.json(await runSync()); });

// عيّنة خام من دفترة (لمعايرة الحقول بعد الربط)
app.get('/api/daftra/sample', requireAuth, (req, res) => {
  const c = store.get().cache;
  res.json({ invoice: c.sampleInvoice, purchase: c.samplePurchase });
});

// تحليل AI
app.post('/api/ai', requireAuth, async (req, res) => {
  const b = req.body || {};
  const out = await ai.analyze({ scope: b.scope, question: b.question, db: store.get(), currency: CURRENCY() });
  res.json(out);
});

// ملفات الواجهة
app.use(express.static(PUB, { index: false, extensions: ['html'] }));
app.get('*', (req, res) => res.sendFile(path.join(PUB, 'index.html')));

// الجدولة التلقائية — تعمل دائمًا؛ تتخطى التنفيذ لو دفترة غير مربوطة.
// بكده بمجرد حفظ المفتاح من صفحة الإعدادات تبدأ المزامنة دون إعادة تشغيل.
try {
  cron.schedule('*/10 * * * *', () => {
    const s = store.get().settings;
    if (!daftra.configured()) return;
    const mins = s.syncEveryMinutes || 60;
    const last = store.get().cache.lastSync ? new Date(store.get().cache.lastSync).getTime() : 0;
    if (Date.now() - last >= (mins - 1) * 60000) {
      runSync().then(r => console.log('[sync]', r.ok ? 'ok' : r.error));
    }
  });
  console.log('[cron] المزامنة التلقائية مفعّلة');
} catch (e) { console.log('[cron] تعذّر الجدولة:', e.message); }

if (daftra.configured()) {
  runSync().then(r => console.log('[sync initial]', r.ok ? ('ok ' + JSON.stringify(r.counts)) : r.error));
} else {
  console.log('[daftra] غير مربوط — افتح البرنامج > الإعدادات وأضف الساب دومين والمفتاح');
}

if (!auth.passwordConfigured()) console.log('[auth] تحذير: APP_PASSWORD غير مضبوطة — الدخول مقفول لحد ما تضبطها في .env');

const PORT = parseInt(process.env.PORT || '3200', 10);
app.listen(PORT, () => console.log('المتابعة المالية تعمل على المنفذ ' + PORT));
