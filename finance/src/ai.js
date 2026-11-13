// تحليل بالذكاء الاصطناعي عبر Anthropic. لو المفتاح مش موجود، يرجّع تحليل بقواعد ثابتة.
const { buildSummary, curMonth, addM } = require('./finance');
const store = require('./store');
const aiKey = () => { try { return store.get().settings.anthropicKey || process.env.ANTHROPIC_API_KEY; } catch (e) { return process.env.ANTHROPIC_API_KEY; } };

function ruleBased(summary) {
  const out = [], f = n => Math.round(n).toLocaleString('en-US') + ' ' + summary.currency;
  const m = summary.monthly, cur = m[m.length - 1], prev = m[m.length - 2];
  if (prev && cur.profit < prev.profit)
    out.push({ type: 'warn', title: 'صافي الربح نزل عن الشهر السابق', body: `من ${f(prev.profit)} إلى ${f(cur.profit)}. راجع بنود المصاريف والمشتريات.` });
  for (const c of summary.expensesByCategory)
    if (c.avg3 && c.current > c.avg3 * 1.15 && c.current - c.avg3 > 2000)
      out.push({ type: 'warn', title: `بند "${c.cat}" زاد عن متوسط آخر 3 شهور`, body: `الشهر ده ${f(c.current)} مقابل متوسط ${f(c.avg3)}.` });
  if (summary.receivables.overdue30plus > 0)
    out.push({ type: 'warn', title: `${f(summary.receivables.overdue30plus)} متأخرة أكثر من شهر عند العملاء`, body: summary.receivables.topLate[0] ? `أكبرها ${summary.receivables.topLate[0].name} متأخرة ${summary.receivables.topLate[0].daysLate} يوم.` : '' });
  for (const e of summary.endingTempExpenses)
    out.push({ type: 'good', title: `"${e.name}" ينتهي قريبًا`, body: `بعده مصاريفك الشهرية هتنزل ${f(e.amount)}.` });
  if (!out.length) out.push({ type: 'idea', title: 'الوضع مستقر', body: 'لا توجد انحرافات كبيرة هذا الشهر.' });
  return out;
}

async function analyze({ scope = 'all', question = '', db, currency }) {
  const summary = buildSummary(db, currency);
  const key = aiKey();
  if (!key) {
    return { source: 'rules', insights: ruleBased(summary),
      note: 'التحليل بقواعد ثابتة. أضف ANTHROPIC_API_KEY في .env لتفعيل الذكاء الاصطناعي الكامل.' };
  }
  const scopeAr = { all: 'كل العمليات', exp: 'المصاريف', rec: 'مديونيات العملاء', pay: 'مستحقات الموردين', pl: 'الربح والخسارة', trade: 'البيع والشراء' }[scope] || 'كل العمليات';
  const sys = `أنت محلل مالي خبير لعيادة/شركة تجميل اسمها Elite Skin. تتكلم عربي مصري واضح ومختصر.
تحصل على ملخص مالي بصيغة JSON. مهمتك إعطاء تحليل عملي: فين المصاريف زادت ولماذا، أين يمكن التوفير، وكيف تزيد الربح، ومتابعة المديونيات والسيولة.
التزم بالأرقام المعطاة فقط ولا تخترع بيانات. كل اقتراح لازم يكون مبني على رقم من الملخص.
${question ? 'ركّز على سؤال المستخدم.' : 'ركّز على موضوع: ' + scopeAr + '.'}
أرجع JSON فقط بالشكل: {"insights":[{"type":"warn|good|idea","title":"...","body":"..."}],"summary":"سطر أو سطرين ملخص"} بحد أقصى 6 عناصر.`;
  const userMsg = (question ? `سؤال المستخدم: ${question}\n\n` : '') + 'الملخص المالي:\n' + JSON.stringify(summary);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
        max_tokens: 1200,
        system: sys,
        messages: [{ role: 'user', content: userMsg }]
      })
    });
    const j = await res.json();
    if (!res.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + res.status));
    const txt = (j.content || []).map(b => b.text || '').join('');
    const match = txt.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : { insights: [], summary: txt };
    if (!Array.isArray(parsed.insights) || !parsed.insights.length) parsed.insights = ruleBased(summary);
    return { source: 'ai', insights: parsed.insights, summary: parsed.summary || '' };
  } catch (e) {
    return { source: 'rules', insights: ruleBased(summary), note: 'تعذّر الاتصال بالذكاء الاصطناعي (' + String(e.message || e) + '). عُرض تحليل بقواعد ثابتة.' };
  }
}

module.exports = { analyze, ruleBased };
