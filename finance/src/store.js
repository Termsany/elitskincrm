// تخزين بسيط في ملف JSON — بدون أي اعتماديات native عشان يشتغل على أي VPS.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT = {
  // الإعدادات تُدخل من داخل البرنامج (صفحة الإعدادات)
  settings: {
    daftraSubdomain: '',
    daftraApikey: '',
    daftraDomain: 'daftara.com',
    anthropicKey: '',
    currency: '',
    syncEveryMinutes: 60
  },
  goals: {},           // { '2026': { annual: 1200000, monthly: { '2026-01': 100000, ... } } }
  plans: {},           // { '2026-11': { items: [ {id,type,text,clientId,clientName,amount,done,base,src} ] } }
  cache: {             // آخر نسخة مسحوبة من دفترة
    clients: [],       // [{id,name,phone}]
    receivables: [],   // فواتير العملاء غير المسددة [{who,name,inv,amount,due,date}]
    sales: {},         // { 'YYYY-MM': total }
    salesCount: {},    // { 'YYYY-MM': عدد الفواتير }
    daily: {},         // { 'YYYY-MM-DD': total } لآخر ~70 يوم
    clientStats: [],   // [{id,name,phone,t12,cm,count,last,avg}]
    statsMonth: null,  // الشهر الذي حُسب عليه cm
    lastSync: null,
    lastError: null,
    sampleInvoice: null
  },
  seq: 1
};

let db = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (fs.existsSync(FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      db = Object.assign({}, JSON.parse(JSON.stringify(DEFAULT)), db);
      db.cache = Object.assign({}, DEFAULT.cache, db.cache);
      db.settings = Object.assign({}, DEFAULT.settings, db.settings);
      return db;
    } catch (e) {
      // لو الملف تالف، نحتفظ بنسخة ونبدأ من جديد
      try { fs.renameSync(FILE, FILE + '.corrupt-' + Date.now()); } catch (_) {}
    }
  }
  db = JSON.parse(JSON.stringify(DEFAULT));
  save();
  return db;
}

function save() {
  ensureDir();
  const tmp = FILE + '.tmp';       // كتابة ذرّية
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

function get() { if (!db) load(); return db; }
function nextId() { const d = get(); return d.seq++; }

module.exports = { load, save, get, nextId, FILE };
