// المزامنة: تسحب من دفترة وتخزّن في الكاش المحلي.
const store = require('./store');
const daftra = require('./daftra');

let running = false;

async function runSync() {
  if (running) return { ok: false, error: 'SYNC_IN_PROGRESS' };
  running = true;
  const db = store.get();
  try {
    if (!daftra.configured()) {
      db.cache.lastError = 'دفترة غير مربوطة: افتح الإعدادات وأضف الساب دومين ومفتاح دفترة';
      store.save();
      return { ok: false, error: db.cache.lastError };
    }
    const pulled = await daftra.pullAll();
    db.cache.clients = pulled.clients;
    db.cache.suppliers = pulled.suppliers;
    db.cache.receivables = pulled.receivables;
    db.cache.payables = pulled.payables;
    db.cache.sales = pulled.sales;
    db.cache.purchases = pulled.purchases;
    db.cache.sampleInvoice = pulled.sampleInvoice;
    db.cache.samplePurchase = pulled.samplePurchase;
    db.cache.lastSync = new Date().toISOString();
    db.cache.lastError = null;
    store.save();
    return { ok: true, counts: pulled.counts, at: db.cache.lastSync };
  } catch (e) {
    db.cache.lastError = String(e.message || e);
    db.cache.lastSync = db.cache.lastSync || null;
    store.save();
    return { ok: false, error: db.cache.lastError };
  } finally {
    running = false;
  }
}

module.exports = { runSync };
