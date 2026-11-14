// الذكاء الاصطناعي: يقرأ المبيعات + المديونيات + الأهداف + الخطة مع بعض ويقترح.
// لو مفيش مفتاح Anthropic، يرجّع تحليل بقواعد ثابتة مبني على نفس الأرقام.
const { buildSummary } = require('./finance');
const store = require('./store');
const aiKey = () => { try { return store.get().settings.anthropicKey || process.env.ANTHROPIC_API_KEY; } catch (e) { return process.env.ANTHROPIC_API_KEY; } };
const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

const pct = x => Math.round((x || 0) * 100) + '%';

function ruleBased(S) {
  const out = [], f = n => Math.round(n || 0).toLocaleString('en-US') + ' ' + S.currency;
  const m = S.month, y = S.year, r = S.receivables;
  if (!m.target) out.push({ type: 'idea', title: 'حدد هدف الشهر', body: 'من غير هدف مش هنعرف إنت متقدم ولا متأخر. حط هدف سنوي والبرنامج يوزعه على الشهور حسب موسمية السنة اللي فاتت.', action: 'goals' });
  else if (m.projectedPct < 0.95) out.push({ type: 'warn', title: `على المعدل الحالي هتقفل الشهر عند ${pct(m.projectedPct)} من الهدف`, body: `المتوقع ${f(m.projection)} من ${f(m.target)}. محتاج ${f(m.perDay)} يوميًا في الـ ${m.daysLeft} يوم الباقيين.`, action: 'plan' });
  else out.push({ type: 'good', title: `ماشي صح: متوقع ${pct(m.projectedPct)} من هدف الشهر`, body: `اتحقق ${f(m.sales)} والمتوقع ${f(m.projection)}. حافظ على ${f(m.sales / Math.max(1, m.day))} يوميًا.` });
  if (r.r > 0) out.push({ type: 'warn', title: `${f(r.r)} متأخرة أكثر من شهر`, body: r.topDebtors[0] ? `أكبر متأخر: ${r.topDebtors[0].name} — ${f(r.topDebtors[0].overdue)} من ${r.topDebtors[0].maxLate} يوم. التحصيل ده سيولة جاهزة من غير بيع جديد.` : '', action: 'rec' });
  if (S.clients.dormant.length) {
    const pot = S.clients.dormant.slice(0, 5).reduce((a, x) => a + (x.avgInvoice || 0), 0);
    out.push({ type: 'idea', title: `${S.clients.dormant.length} عميل نايم ممكن يرجعوا`, body: `أكبرهم ${S.clients.dormant[0].name} (آخر شراء من ${S.clients.dormant[0].daysSinceLastBuy} يوم). أول 5 فرصة تقريبًا ${f(pot)}.`, action: 'plan' });
  }
  if (S.clients.top5SharePct >= 60) out.push({ type: 'warn', title: `أكبر 5 عملاء = ${S.clients.top5SharePct}% من مبيعاتك`, body: 'اعتماد عالي على عدد قليل. وسّع قاعدة العملاء عشان تقلل المخاطرة.' });
  if (y.annual && y.projectedPct < 0.95) out.push({ type: 'warn', title: `السنة متوقع تقفل عند ${pct(y.projectedPct)} من الهدف`, body: `محتاج ${f(y.needPerMonth)} شهريًا في الـ ${y.monthsLeft} شهور الباقية.`, action: 'goals' });
  if (S.plan.totals.count && S.plan.totals.done < S.plan.totals.count) out.push({ type: 'idea', title: `الخطة: ${S.plan.totals.done} من ${S.plan.totals.count} بند خلصوا`, body: `اتحصّل ${f(S.plan.totals.collected)} من ${f(S.plan.totals.collectPlanned)} واتباع ${f(S.plan.totals.sold)} من ${f(S.plan.totals.sellPlanned)}.`, action: 'plan' });
  return out.slice(0, 6);
}

async function claude(system, user, maxTokens = 1400) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': aiKey(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL(), max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(45000)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + res.status));
  const txt = (j.content || []).map(b => b.text || '').join('');
  const match = txt.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('رد غير متوقع من الـ AI');
  return JSON.parse(match[0]);
}

const BASE = `أنت مستشار مبيعات ومالية لشركة Elite Skin (منتجات عناية بالبشرة تُباع للعيادات والصيدليات). تتكلم عربي مصري واضح ومختصر وعملي.
تحصل على ملخص JSON فيه: مبيعات الشهر مقابل الهدف والمعدل المتوقع، الهدف السنوي، مديونيات العملاء وأعمارها، أكبر العملاء والعملاء النايمين، وخطة الشهر وتقدّمها.
اربط الأربعة ببعض: كل نصيحة لازم تقول تأثيرها على الهدف أو السيولة بالرقم. التزم بالأرقام المعطاة فقط ولا تخترع بيانات أو أسماء.`;

const SCOPES = { all: 'الصورة الكاملة', sales: 'المبيعات والمعدل', rec: 'مديونيات العملاء والتحصيل', goals: 'الأهداف السنوية والشهرية', plan: 'خطة الشهر' };

async function analyze({ scope = 'all', question = '', db, currency }) {
  const S = buildSummary(db, currency);
  if (!aiKey()) return { source: 'rules', insights: ruleBased(S), note: 'التحليل بقواعد ثابتة. أضف مفتاح Anthropic من الإعدادات لتفعيل الذكاء الاصطناعي الكامل.' };
  const sys = BASE + `
${question ? 'جاوب على سؤال المستخدم تحديدًا.' : 'ركّز على: ' + (SCOPES[scope] || SCOPES.all) + '.'}
أرجع JSON فقط: {"summary":"سطرين","insights":[{"type":"warn|good|idea","title":"...","body":"...","action":"sales|rec|goals|plan|none"}]} بحد أقصى 6 عناصر. action = الصفحة اللي المستخدم يروحها عشان ينفّذ.`;
  try {
    const p = await claude(sys, (question ? `السؤال: ${question}\n\n` : '') + 'الملخص:\n' + JSON.stringify(S));
    const insights = Array.isArray(p.insights) && p.insights.length ? p.insights : ruleBased(S);
    return { source: 'ai', insights, summary: p.summary || '' };
  } catch (e) {
    return { source: 'rules', insights: ruleBased(S), note: 'تعذّر الاتصال بالذكاء الاصطناعي (' + String(e.message || e) + '). عُرض تحليل بقواعد ثابتة.' };
  }
}

// يحسّن خطة مقترحة: استراتيجية + سبب وطريقة لكل بند. البنود نفسها (العملاء والمبالغ) تفضل من البيانات.
async function refinePlan({ draft, db, currency }) {
  if (!aiKey() || !draft.items.length) return { strategy: draft.strategy, items: draft.items, source: 'rules' };
  const S = buildSummary(db, currency);
  const list = draft.items.map((it, i) => ({ i, type: it.type, client: it.clientName, amount: it.amount, why: it.why }));
  const sys = BASE + `
هتاخد خطة مقترحة للشهر (بنود تحصيل وبيع). اكتب:
1) strategy: فقرة قصيرة (3 أسطر) إزاي الخطة دي تقفل فجوة الهدف وتحسّن السيولة، بالأرقام.
2) لكل بند how: جملة واحدة عملية (إيه اللي تقوله/تعمله مع العميل ده).
3) order: ترتيب أرقام البنود حسب الأولوية.
أرجع JSON فقط: {"strategy":"...","items":[{"i":0,"how":"..."}],"order":[0,1,2]}`;
  try {
    const p = await claude(sys, 'الملخص:\n' + JSON.stringify(S) + '\n\nالبنود:\n' + JSON.stringify(list), 1600);
    const how = new Map((p.items || []).map(x => [x.i, String(x.how || '')]));
    let items = draft.items.map((it, i) => Object.assign({}, it, how.get(i) ? { how: how.get(i) } : {}));
    if (Array.isArray(p.order)) {
      const seen = new Set(), ordered = [];
      for (const i of p.order) if (items[i] && !seen.has(i)) { seen.add(i); ordered.push(items[i]); }
      items.forEach((it, i) => { if (!seen.has(i)) ordered.push(it); });
      items = ordered;
    }
    return { strategy: p.strategy || draft.strategy, items, source: 'ai' };
  } catch (e) {
    return { strategy: draft.strategy, items: draft.items, source: 'rules', note: String(e.message || e) };
  }
}

module.exports = { analyze, refinePlan, ruleBased };
