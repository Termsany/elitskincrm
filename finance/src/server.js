require('dotenv').config();
const path = require('path');
const express = require('express');
const cron = require('node-cron');
const store = require('./store');
const daftra = require('./daftra');
const { runSync } = require('./sync');
const ai = require('./ai');
const auth = require('./auth');
const fin = require('./finance');

const CURRENCY = () => store.get().settings.currency || process.env.CURRENCY || 'ج.م';
const MONTH = /^\d{4}-\d{2}$/, YEAR = /^\d{4}$/;

store.load();
const app = express();
app.disable('x-powered-by');
// خلف nginx: نثق في X-Forwarded-Proto/For عشان الكوكي Secure و IP الصحيح
app.set('trust proxy', 'loopback, uniquelocal');
app.use(express.json({ limit: '1mb' }));

const PUB = path.join(__dirname, '..', 'public');

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

// كل البيانات + المقاييس المحسوبة (نفس الأرقام اللي بيشوفها الـ AI)
app.get('/api/data', requireAuth, (req, res) => {
  const db = store.get(), c = db.cache;
  const M = fin.metrics(db);
  res.json(Object.assign(M, {
    currency: CURRENCY(),
    receivables: c.receivables,
    clientsList: c.clients.map(x => ({ id: x.id, name: x.name, phone: x.phone })),
    goalsYear: fin.yearPlan(db, M.today.slice(0, 4)),
    lastSync: c.lastSync, lastError: c.lastError,
    daftraConfigured: daftra.configured(),
    aiConfigured: !!(db.settings.anthropicKey || process.env.ANTHROPIC_API_KEY)
  }));
});

// ===== الأهداف =====
app.get('/api/goals/:year', requireAuth, (req, res) => {
  if (!YEAR.test(req.params.year)) return res.status(400).json({ error: 'سنة غير صالحة' });
  res.json(fin.yearPlan(store.get(), req.params.year));
});
app.post('/api/goals/:year', requireAuth, (req, res) => {
  const y = req.params.year, b = req.body || {};
  if (!YEAR.test(y)) return res.status(400).json({ error: 'سنة غير صالحة' });
  const db = store.get();
  const g = db.goals[y] || (db.goals[y] = { annual: 0, monthly: {} });
  if (b.annual !== undefined) {
    const a = parseFloat(b.annual);
    if (!(a >= 0)) return res.status(400).json({ error: 'الهدف السنوي غير صالح' });
    g.annual = a;
  }
  if (b.monthly && typeof b.monthly === 'object') {
    for (const [m, v] of Object.entries(b.monthly)) {
      if (!MONTH.test(m) || m.slice(0, 4) !== y) continue;
      const n = parseFloat(v);
      if (n > 0) g.monthly[m] = n; else delete g.monthly[m];   // فاضي = يرجع تلقائي
    }
  }
  if (b.resetMonthly) g.monthly = {};
  store.save();
  res.json(fin.yearPlan(db, y));
});

// ===== خطة الشهر =====
const planOf = (db, m) => db.plans[m] || (db.plans[m] = { items: [] });

app.get('/api/plan/:month', requireAuth, (req, res) => {
  if (!MONTH.test(req.params.month)) return res.status(400).json({ error: 'شهر غير صالح' });
  res.json(fin.planProgress(store.get(), req.params.month, fin.ymd(new Date())));
});

// إنشاء بند خطة من مدخلات (العميل والمبالغ بتتأكد من دفترة على السيرفر)
function makeItem(db, b, m) {
  const type = ['collect', 'sell', 'task'].includes(b.type) ? b.type : 'task';
  const it = { id: store.nextId(), type, text: String(b.text || '').trim().slice(0, 200), amount: Math.max(0, Math.round(parseFloat(b.amount) || 0)), done: false, src: b.src || 'manual', created: new Date().toISOString() };
  if (b.clientId != null && b.clientId !== '') {
    const c = db.cache.clients.find(x => String(x.id) === String(b.clientId));
    if (!c) throw new Error('العميل غير موجود');
    it.clientId = c.id; it.clientName = c.name;
    const owed = db.cache.receivables.filter(d => String(d.who) === String(c.id)).reduce((s, d) => s + d.amount, 0);
    const st = db.cache.clientStats.find(x => String(x.id) === String(c.id));
    it.base = type === 'collect' ? Math.round(owed) : (st && db.cache.statsMonth === m ? st.cm : 0);
    if (type === 'collect' && !it.amount) it.amount = Math.round(owed);
    if (!it.text) it.text = (type === 'collect' ? 'تحصيل ' : type === 'sell' ? 'بيع لـ ' : '') + c.name;
  } else if (type !== 'task') throw new Error('اختار العميل');
  if (!it.text) throw new Error('اكتب وصف البند');
  if (b.why) it.why = String(b.why).slice(0, 300);
  if (b.how) it.how = String(b.how).slice(0, 300);
  return it;
}
const curMonth = () => fin.ymd(new Date()).slice(0, 7);

// اقتراح خطة ذكية: من البيانات (قواعد) ثم يحسّنها الـ AI لو مفعّل. المستخدم يختار وبعدين /apply.
app.post('/api/plan/suggest', requireAuth, async (req, res) => {
  const db = store.get();
  const draft = fin.suggestPlan(db);
  const out = await ai.refinePlan({ draft, db, currency: CURRENCY() });
  res.json({ source: out.source, strategy: out.strategy, items: out.items, note: out.note });
});

app.post('/api/plan/apply', requireAuth, (req, res) => {
  const db = store.get(), b = req.body || {}, m = curMonth();
  const list = Array.isArray(b.items) ? b.items.slice(0, 40) : [];
  const p = planOf(db, m), have = new Set(p.items.map(i => i.type + ':' + i.clientId));
  const added = [];
  try {
    for (const x of list) {
      const it = makeItem(db, Object.assign({}, x, { src: b.source === 'ai' ? 'ai' : 'rules' }), m);
      const k = it.type + ':' + it.clientId;
      if (it.clientId != null && have.has(k)) continue;
      have.add(k); added.push(it);
    }
  } catch (e) { return res.status(400).json({ error: e.message }); }
  p.items.push(...added);
  if (typeof b.strategy === 'string' && b.strategy.trim()) { p.strategy = b.strategy.trim().slice(0, 1500); p.strategySource = b.source === 'ai' ? 'ai' : 'rules'; }
  store.save();
  res.json({ ok: true, added: added.length });
});

app.post('/api/plan/items', requireAuth, (req, res) => {
  const db = store.get(), b = req.body || {};
  const m = MONTH.test(b.month || '') ? b.month : curMonth();
  let it;
  try { it = makeItem(db, Object.assign({}, b, { src: 'manual' }), m); } catch (e) { return res.status(400).json({ error: e.message }); }
  planOf(db, m).items.push(it);
  store.save();
  res.json({ ok: true, item: it });
});

app.patch('/api/plan/items/:id', requireAuth, (req, res) => {
  const db = store.get(), b = req.body || {};
  for (const p of Object.values(db.plans)) {
    const it = p.items.find(x => x.id === +req.params.id);
    if (!it) continue;
    if (typeof b.done === 'boolean') it.done = b.done;
    if (b.note !== undefined) it.note = String(b.note).slice(0, 300);
    if (b.amount !== undefined) it.amount = Math.max(0, parseFloat(b.amount) || 0);
    store.save();
    return res.json({ ok: true, item: it });
  }
  res.status(404).json({ error: 'غير موجود' });
});

app.delete('/api/plan/items/:id', requireAuth, (req, res) => {
  const db = store.get();
  for (const p of Object.values(db.plans)) p.items = p.items.filter(x => x.id !== +req.params.id);
  store.save(); res.json({ ok: true });
});

// ===== الإعدادات =====
app.get('/api/settings', requireAuth, (req, res) => {
  const s = store.get().settings;
  res.json({
    daftraSubdomain: s.daftraSubdomain || '',
    daftraDomain: s.daftraDomain || 'daftara.com',
    daftraApikeySet: !!s.daftraApikey,
    anthropicKeySet: !!s.anthropicKey,
    currency: CURRENCY(),
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
  if (typeof b.daftraApikey === 'string' && b.daftraApikey.trim()) s.daftraApikey = b.daftraApikey.trim();
  if (typeof b.anthropicKey === 'string' && b.anthropicKey.trim()) s.anthropicKey = b.anthropicKey.trim();
  if (typeof b.currency === 'string' && b.currency.trim()) s.currency = b.currency.trim().slice(0, 10);
  if (b.clearDaftraKey) s.daftraApikey = '';
  if (b.clearAnthropicKey) s.anthropicKey = '';
  if (b.syncEveryMinutes) s.syncEveryMinutes = Math.max(5, parseInt(b.syncEveryMinutes, 10) || 60);
  store.save();
  let sync = null;
  if (b.daftraApikey || b.daftraSubdomain !== undefined) { if (daftra.configured()) sync = await runSync(); }
  res.json({ ok: true, sync });
});

app.post('/api/daftra/test', requireAuth, async (req, res) => {
  if (!daftra.configured()) return res.json({ ok: false, error: 'اكتب الساب دومين والمفتاح واحفظ أولًا.' });
  try {
    const sample = await daftra.fetchAll('/clients.json', {}, 1);
    res.json({ ok: true, message: 'الاتصال ناجح. تم العثور على ' + sample.length + ' عميل في أول صفحة.' });
  } catch (e) {
    res.json({ ok: false, error: String(e.message || e) });
  }
});

app.post('/api/sync', requireAuth, async (req, res) => { res.json(await runSync()); });

// عيّنة خام من دفترة (لمعايرة الحقول بعد الربط)
app.get('/api/daftra/sample', requireAuth, (req, res) => res.json({ invoice: store.get().cache.sampleInvoice }));

app.post('/api/ai', requireAuth, async (req, res) => {
  const b = req.body || {};
  res.json(await ai.analyze({ scope: b.scope, question: String(b.question || '').slice(0, 500), db: store.get(), currency: CURRENCY() }));
});

// ملفات الواجهة
app.use(express.static(PUB, { index: false, extensions: ['html'] }));
app.get('*', (req, res) => res.sendFile(path.join(PUB, 'index.html')));

// المزامنة التلقائية — تتخطى لو دفترة غير مربوطة.
try {
  cron.schedule('*/10 * * * *', () => {
    const s = store.get().settings;
    if (!daftra.configured()) return;
    const mins = s.syncEveryMinutes || 60;
    const last = store.get().cache.lastSync ? new Date(store.get().cache.lastSync).getTime() : 0;
    if (Date.now() - last >= (mins - 1) * 60000) runSync().then(r => console.log('[sync]', r.ok ? 'ok' : r.error));
  });
} catch (e) { console.log('[cron] تعذّر الجدولة:', e.message); }

if (daftra.configured()) runSync().then(r => console.log('[sync initial]', r.ok ? ('ok ' + JSON.stringify(r.counts)) : r.error));
else console.log('[daftra] غير مربوط — افتح البرنامج > الإعدادات وأضف الساب دومين والمفتاح');
if (!auth.passwordConfigured()) console.log('[auth] تحذير: APP_PASSWORD غير مضبوطة — الدخول مقفول لحد ما تضبطها في .env');

const PORT = parseInt(process.env.PORT || '3200', 10);
app.listen(PORT, () => console.log('المتابعة المالية تعمل على المنفذ ' + PORT));
