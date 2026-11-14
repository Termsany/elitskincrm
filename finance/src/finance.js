// المحرك المالي: يربط المبيعات + المديونيات + الأهداف + خطة الشهر في أرقام واحدة
// يستخدمها كل من الواجهة والذكاء الاصطناعي (عشان الاتنين يشوفوا نفس الحقيقة).

const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const addM = (m, k) => { const d = new Date(+m.slice(0, 4), +m.slice(5) - 1 + k, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
const daysIn = m => new Date(+m.slice(0, 4), +m.slice(5), 0).getDate();
const daysBetween = (a, b) => Math.floor((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
const R = n => Math.round(n || 0);
const F = n => R(n).toLocaleString('en-US');   // أرقام مقروءة داخل النصوص

// ===== الأهداف =====
// هدف الشهر: المكتوب يدويًا، وإلا نصيبه من الهدف السنوي حسب موسمية السنة اللي فاتت (أو بالتساوي).
function monthTarget(db, m) {
  const y = m.slice(0, 4), g = (db.goals || {})[y];
  if (!g) return 0;
  if (g.monthly && +g.monthly[m] > 0) return +g.monthly[m];
  if (!(+g.annual > 0)) return 0;
  const w = seasonWeights(db, y);
  // الجزء من السنوي اللي ما اتوزعش يدويًا يتوزع على باقي الشهور حسب الموسمية
  let fixed = 0, freeW = 0;
  for (let i = 1; i <= 12; i++) {
    const mm = y + '-' + pad(i);
    if (g.monthly && +g.monthly[mm] > 0) fixed += +g.monthly[mm]; else freeW += w[i - 1];
  }
  const rest = Math.max(0, +g.annual - fixed);
  return freeW ? rest * w[+m.slice(5) - 1] / freeW : 0;
}
function seasonWeights(db, y) {
  const prev = String(+y - 1), s = db.cache.sales || {};
  const v = []; for (let i = 1; i <= 12; i++) v.push(s[prev + '-' + pad(i)] || 0);
  const tot = v.reduce((a, b) => a + b, 0);
  const active = v.filter(x => x > 0).length;
  if (tot <= 0 || active < 6) return new Array(12).fill(1 / 12);   // بيانات غير كافية → بالتساوي
  const avg = tot / 12;
  return v.map(x => (x > 0 ? x : avg) / (tot + avg * (12 - active)));
}
function yearPlan(db, y) {
  const g = (db.goals || {})[y] || {};
  const months = [];
  for (let i = 1; i <= 12; i++) {
    const m = y + '-' + pad(i);
    months.push({ month: m, target: R(monthTarget(db, m)), manual: !!(g.monthly && +g.monthly[m] > 0), sales: R((db.cache.sales || {})[m]), lastYear: R((db.cache.sales || {})[(+y - 1) + '-' + pad(i)]) });
  }
  return { year: y, annual: +g.annual || 0, months };
}

// ===== العملاء =====
function debtors(rec, today) {
  const map = new Map();
  for (const d of rec) {
    const k = String(d.who);
    let x = map.get(k);
    if (!x) { x = { id: d.who, name: d.name, total: 0, overdue: 0, maxLate: 0, invoices: 0 }; map.set(k, x); }
    const late = daysBetween(d.due, today);
    x.total += d.amount; x.invoices++;
    if (late > 0) { x.overdue += d.amount; x.maxLate = Math.max(x.maxLate, late); }
  }
  return [...map.values()].map(x => Object.assign(x, { total: R(x.total), overdue: R(x.overdue) }))
    .sort((a, b) => b.overdue - a.overdue || b.total - a.total);
}
const bucket = (due, today) => { const l = daysBetween(due, today); return l > 30 ? 'r' : l > 0 ? 'y' : 'g'; };

// ===== خطة الشهر: تقدّم كل بند محسوب من دفترة تلقائيًا =====
function planProgress(db, m, today) {
  const plan = (db.plans || {})[m] || { items: [] };
  const c = db.cache, cur = today.slice(0, 7);
  const owed = new Map(); for (const d of c.receivables) owed.set(String(d.who), (owed.get(String(d.who)) || 0) + d.amount);
  const cm = new Map(); if (c.statsMonth === m) for (const s of c.clientStats) cm.set(String(s.id), s.cm);
  const items = plan.items.map(it => {
    const o = Object.assign({}, it);
    if (it.type === 'collect' && it.clientId != null) {
      o.now = R(owed.get(String(it.clientId)) || 0);
      o.achieved = R(Math.max(0, (it.base || 0) - o.now));
      o.auto = o.now <= 0.5;
    } else if (it.type === 'sell' && it.clientId != null && m === cur) {
      o.achieved = R(Math.max(0, (cm.get(String(it.clientId)) || 0) - (it.base || 0)));
      o.auto = it.amount > 0 && o.achieved >= it.amount;
    } else { o.achieved = 0; o.auto = false; }
    o.complete = !!(it.done || o.auto);
    return o;
  });
  const sum = (t, k) => items.filter(i => i.type === t).reduce((s, i) => s + (+i[k] || 0), 0);
  return {
    month: m, strategy: plan.strategy || '', strategySource: plan.strategySource || '',
    items,
    totals: {
      count: items.length, done: items.filter(i => i.complete).length,
      collectPlanned: R(sum('collect', 'amount')), collected: R(sum('collect', 'achieved')),
      sellPlanned: R(sum('sell', 'amount')), sold: R(sum('sell', 'achieved'))
    }
  };
}

// ===== كل المقاييس =====
function metrics(db, now = new Date()) {
  const c = db.cache, today = ymd(now), m = today.slice(0, 7), y = m.slice(0, 4);
  const s = c.sales || {};
  const dim = daysIn(m), day = +today.slice(8), left = dim - day + 1;

  // الشهر الحالي
  const sold = s[m] || 0, target = monthTarget(db, m);
  const pace = day ? sold / day : 0;
  const projection = pace * dim;
  const need = Math.max(0, target - sold);
  const month = {
    month: m, sales: R(sold), invoices: (c.salesCount || {})[m] || 0, target: R(target),
    progress: target ? sold / target : null, projection: R(projection),
    projectedPct: target ? projection / target : null,
    need: R(need), perDay: R(left > 0 ? need / left : need), day, daysLeft: left, daysInMonth: dim,
    expectedByNow: R(target * day / dim),
    lastMonth: R(s[addM(m, -1)]), lastMonthSameDay: R((s[addM(m, -1)] || 0) * day / daysIn(addM(m, -1))),
    lastYear: R(s[addM(m, -12)])
  };

  // السنة
  let ytd = 0, ytdTarget = 0;
  for (let i = 1; i <= +m.slice(5); i++) {
    const mm = y + '-' + pad(i), t = monthTarget(db, mm);
    ytd += s[mm] || 0; ytdTarget += mm === m ? t * day / dim : t;
  }
  const annual = +(((db.goals || {})[y] || {}).annual) || 0;
  const last3 = [1, 2, 3].map(k => s[addM(m, -k)] || 0);
  const avg3 = last3.reduce((a, b) => a + b, 0) / 3;
  const monthsLeft = 12 - +m.slice(5);
  const yearProj = ytd - sold + projection + avg3 * monthsLeft;
  const year = {
    year: y, annual: R(annual), ytd: R(ytd), ytdTarget: R(ytdTarget),
    progress: annual ? ytd / annual : null, projection: R(yearProj),
    projectedPct: annual ? yearProj / annual : null,
    needPerMonth: R(monthsLeft > 0 ? Math.max(0, annual - ytd - projection) / monthsLeft : 0),
    lastYearTotal: R(Object.keys(s).filter(k => k.startsWith(String(+y - 1))).reduce((a, k) => a + s[k], 0)),
    monthsLeft
  };

  // آخر 12 شهر للرسم
  const trend = [];
  for (let i = 11; i >= 0; i--) { const mm = addM(m, -i); trend.push({ month: mm, sales: R(s[mm]), target: R(monthTarget(db, mm)) }); }

  // مبيعات يومية للشهر الحالي
  const daily = [];
  for (let d = 1; d <= dim; d++) { const k = m + '-' + pad(d); daily.push({ day: d, sales: R((c.daily || {})[k]), future: d > day }); }

  // المديونيات
  const rec = { r: 0, y: 0, g: 0, all: 0, count: c.receivables.length, dueThisMonth: 0 };
  for (const d of c.receivables) {
    rec[bucket(d.due, today)] += d.amount; rec.all += d.amount;
    if (d.due >= today && d.due.slice(0, 7) === m) rec.dueThisMonth += d.amount;
  }
  for (const k of ['r', 'y', 'g', 'all', 'dueThisMonth']) rec[k] = R(rec[k]);
  rec.overdue = rec.r + rec.y;
  rec.dso = month.lastMonth + (s[addM(m, -2)] || 0) + (s[addM(m, -3)] || 0) > 0
    ? R(rec.all / ((month.lastMonth + (s[addM(m, -2)] || 0) + (s[addM(m, -3)] || 0)) / 90)) : null;
  const debt = debtors(c.receivables, today);

  // العملاء
  const stats = (c.statsMonth === m ? c.clientStats : (c.clientStats || []).map(x => Object.assign({}, x, { cm: 0 }))) || [];
  const owedBy = new Map(debt.map(d => [String(d.id), d]));
  const withDebt = x => { const d = owedBy.get(String(x.id)); return Object.assign({}, x, { owed: d ? d.total : 0, overdue: d ? d.overdue : 0, maxLate: d ? d.maxLate : 0, idle: x.last ? daysBetween(x.last, today) : null }); };
  const top = [...stats].sort((a, b) => b.t12 - a.t12).slice(0, 15).map(withDebt);
  const dormant = stats.filter(x => x.t12 > 0 && x.last && daysBetween(x.last, today) >= 60)
    .sort((a, b) => b.t12 - a.t12).slice(0, 15).map(withDebt);
  const notThisMonth = stats.filter(x => x.t12 > 0 && !x.cm && x.last && daysBetween(x.last, today) < 60)
    .sort((a, b) => b.t12 - a.t12).slice(0, 15).map(withDebt);
  const activeClients = stats.filter(x => x.t12 > 0).length;
  const t12Total = stats.reduce((a, x) => a + x.t12, 0);
  const top5Share = t12Total ? [...stats].sort((a, b) => b.t12 - a.t12).slice(0, 5).reduce((a, x) => a + x.t12, 0) / t12Total : 0;

  const plan = planProgress(db, m, today);

  return {
    today, month, year, trend, daily, rec, debtors: debt,
    clients: { top, dormant, notThisMonth, active: activeClients, total: (c.clients || []).length, top5Share },
    plan
  };
}

// ===== اقتراح خطة الشهر (قواعد) =====
// يغطي الفجوة بين المبيعات والهدف: تحصيل المتأخر أولًا، ثم إعادة العملاء النايمين، ثم تكبير الكبار.
function suggestPlan(db, now = new Date()) {
  const M = metrics(db, now);
  const exist = new Set(M.plan.items.map(i => i.type + ':' + i.clientId));
  const items = [];
  const add = it => { const k = it.type + ':' + it.clientId; if (!exist.has(k)) { exist.add(k); items.push(it); } };

  for (const d of M.debtors.filter(d => d.overdue > 0).slice(0, 6))
    add({ type: 'collect', clientId: d.id, clientName: d.name, amount: d.total, base: d.total,
      text: `تحصيل ${d.name}`, why: `عليه ${F(d.overdue)} متأخرة${d.maxLate ? ' (أقدمها ' + d.maxLate + ' يوم)' : ''}.` });

  let gap = M.month.need, planned = 0;
  const sellFrom = (list, why) => {
    for (const x of list) {
      if (planned >= gap && items.filter(i => i.type === 'sell').length >= 3) break;
      if (x.overdue > 0 && x.maxLate > 30) continue;   // ما نبيعش أكتر لعميل متأخر جامد في السداد
      const amount = Math.max(x.avg || 0, R((x.t12 || 0) / 12));
      add({ type: 'sell', clientId: x.id, clientName: x.name, amount: R(amount), base: x.cm || 0, text: `بيع لـ ${x.name}`, why: why(x) });
      planned += amount;
    }
  };
  sellFrom(M.clients.dormant.slice(0, 5), x => `عميل نايم: آخر شراء من ${x.idle} يوم، واشترى ${F(x.t12)} آخر 12 شهر.`);
  sellFrom(M.clients.notThisMonth, x => `عميل نشط ما اشتراش الشهر ده؛ متوسط فاتورته ${F(x.avg)}.`);

  const strategy = M.month.target
    ? `الهدف ${F(M.month.target)} — اتحقق ${F(M.month.sales)} (${Math.round((M.month.progress || 0) * 100)}%). الباقي ${F(M.month.need)} في ${M.month.daysLeft} يوم = ${F(M.month.perDay)} يوميًا. ` +
      (M.rec.overdue ? `ابدأ بتحصيل ${F(M.rec.overdue)} متأخرة عشان السيولة، ` : '') +
      `وركّز البيع على العملاء اللي في الخطة (متوقع ${F(planned)}).`
    : 'حدد هدف الشهر من صفحة الأهداف عشان الخطة تتحسب على الفجوة. لحد ما تحدده، الخطة مبنية على التحصيل والعملاء النايمين.';
  return { items, strategy, metrics: M };
}

// ملخص مضغوط للـ AI
function buildSummary(db, currency, now = new Date()) {
  const M = metrics(db, now);
  const slim = x => ({ name: x.name, last12m: x.t12, thisMonth: x.cm, avgInvoice: x.avg, daysSinceLastBuy: x.idle, owed: x.owed, overdue: x.overdue });
  return {
    currency, today: M.today,
    month: M.month, year: M.year,
    trend12m: M.trend,
    receivables: Object.assign({}, M.rec, { topDebtors: M.debtors.slice(0, 8) }),
    clients: { active: M.clients.active, top5SharePct: Math.round(M.clients.top5Share * 100), top: M.clients.top.slice(0, 8).map(slim), dormant: M.clients.dormant.slice(0, 8).map(slim), notBoughtThisMonth: M.clients.notThisMonth.slice(0, 8).map(slim) },
    plan: { strategy: M.plan.strategy, totals: M.plan.totals, items: M.plan.items.map(i => ({ type: i.type, text: i.text, amount: i.amount, achieved: i.achieved, complete: i.complete })) }
  };
}

module.exports = { metrics, suggestPlan, planProgress, buildSummary, monthTarget, yearPlan, addM, ymd, daysBetween };
