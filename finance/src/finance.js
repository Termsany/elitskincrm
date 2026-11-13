// حسابات مالية مشتركة (تُستخدم لبناء ملخص الـ AI).
const addM = (m, k) => { const d = new Date(+m.slice(0, 4), +m.slice(5) - 1 + k, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const curMonth = () => new Date().toISOString().slice(0, 7);

function expActive(e, m) {
  if (e.type === 'fixed') return e.start <= m && (!e.stop || m < e.stop);
  if (e.type === 'temp') return e.start <= m && m <= e.end;
  if (e.type === 'once') return (e.date || '').slice(0, 7) === m;
  return false;
}
const expTotal = (expenses, m) => expenses.filter(e => expActive(e, m)).reduce((s, e) => s + (+e.amount || 0), 0);
const catTotal = (expenses, m, c) => expenses.filter(e => expActive(e, m) && e.cat === c).reduce((s, e) => s + (+e.amount || 0), 0);

function daysLate(due, today = new Date()) {
  return Math.floor((today - new Date(due)) / 86400000);
}
function bucket(due, today) {
  const l = daysLate(due, today);
  return l > 30 ? 'r' : l > 0 ? 'y' : 'g';
}
function totalsByBucket(list, today = new Date()) {
  const o = { r: 0, y: 0, g: 0, all: 0 };
  for (const d of list) { o[bucket(d.due, today)] += d.amount; o.all += d.amount; }
  return o;
}

// ملخص مضغوط يتبعت للـ AI
function buildSummary(db, currency) {
  const c = db.cache, exp = db.expenses, m = curMonth(), today = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(addM(m, -i));
  const CATS = [...new Set(exp.map(e => e.cat))];
  const monthly = months.map(mm => ({
    month: mm,
    sales: Math.round(c.sales[mm] || 0),
    purchases: Math.round(c.purchases[mm] || 0),
    expenses: Math.round(expTotal(exp, mm)),
    profit: Math.round((c.sales[mm] || 0) - (c.purchases[mm] || 0) - expTotal(exp, mm))
  }));
  const expByCat = CATS.map(cat => ({
    cat,
    current: Math.round(catTotal(exp, m, cat)),
    avg3: Math.round([1, 2, 3].reduce((s, k) => s + catTotal(exp, addM(m, -k), cat), 0) / 3)
  })).filter(x => x.current || x.avg3);
  const rec = totalsByBucket(c.receivables, today), pay = totalsByBucket(c.payables, today);
  const topLate = [...c.receivables].filter(d => bucket(d.due, today) === 'r')
    .sort((a, b) => b.amount - a.amount).slice(0, 5)
    .map(d => ({ name: d.name, amount: Math.round(d.amount), daysLate: daysLate(d.due, today) }));
  const upcomingExp = exp.filter(e => e.type === 'temp' && expActive(e, m))
    .map(e => ({ name: e.name, amount: +e.amount, endsMonth: e.end }));
  return {
    currency, currentMonth: m,
    monthly, expensesByCategory: expByCat,
    receivables: { overdue30plus: Math.round(rec.r), overdueUnder30: Math.round(rec.y), onTime: Math.round(rec.g), total: Math.round(rec.all), topLate },
    payables: { overdue30plus: Math.round(pay.r), overdueUnder30: Math.round(pay.y), onTime: Math.round(pay.g), total: Math.round(pay.all) },
    endingTempExpenses: upcomingExp,
    counts: { clients: c.clients.length, suppliers: c.suppliers.length, openReceivables: c.receivables.length, openPayables: c.payables.length }
  };
}

module.exports = { addM, curMonth, expActive, expTotal, catTotal, daysLate, bucket, totalsByBucket, buildSummary };
