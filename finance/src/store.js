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
    syncEveryMinutes: 60
  },
  expenses: [],        // المصاريف (محلية — مش في دفترة)
  cache: {             // آخر نسخة مسحوبة من دفترة
    clients: [],
    suppliers: [],
    receivables: [],   // فواتير العملاء غير المسددة
    payables: [],      // فواتير الموردين غير المسددة
    sales: {},         // { 'YYYY-MM': total }
    purchases: {},     // { 'YYYY-MM': total }
    lastSync: null,
    lastError: null,
    sampleInvoice: null,
    samplePurchase: null
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
      // ضمان وجود كل المفاتيح
      db = Object.assign({}, DEFAULT, db);
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

let saveTimer = null;
function save() {
  ensureDir();
  // كتابة ذرّية
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

function get() { if (!db) load(); return db; }
function nextId() { const d = get(); return d.seq++; }

module.exports = { load, save, saveSoon, get, nextId, FILE };
