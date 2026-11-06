import type { Input, computeFinance } from "@/lib/finance";

/** Account audit: automatic checks a CFO would run on the Daftra books. Pure — no I/O. */
export type Severity = "high" | "medium" | "low";
export type Link = { kind: "sale" | "purchase"; id: number } | { kind: "tab"; tab: string };
export type Finding = { key: string; title: string; detail: string; amount: number | null; date: string | null; link: Link | null; review?: { status: string; note: string; at: string } | null };
export type Check = { id: string; title: string; why: string; fix: string; severity: Severity; findings: Finding[] };
export type DiscountLine = { invoice_id: number; item: string; discount: number; net: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const VAT = 0.15;
const WEIGHT: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Invoice numbers in Daftra can be hexadecimal (…8E, 8F, 90). Returns the missing numbers inside the used range. */
export function numberGaps(nos: string[]): string[] {
  const clean = nos.map(n => n.trim()).filter(n => /^[0-9A-Fa-f]+$/.test(n));
  if (clean.length < 2) return [];
  const hex = clean.some(n => /[A-Fa-f]/.test(n)), base = hex ? 16 : 10, width = clean.every(n => n.length === clean[0].length) ? clean[0].length : 0; // zero-padded series keep their width
  const vals = [...new Set(clean.map(n => parseInt(n, base)))].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 1; i < vals.length && out.length < 50; i++) for (let v = vals[i - 1] + 1; v < vals[i] && out.length < 50; v++) out.push(v.toString(base).toUpperCase().padStart(width, "0"));
  return out;
}

export function runAudit(inp: Input, fin: ReturnType<typeof computeFinance>, discounts: DiscountLine[], from: string, to: string): Check[] {
  const inR = (d: string) => d >= from && d <= to;
  const sales = inp.sales.filter(d => inR(d.date));
  const live = sales.filter(d => d.payment_status !== 3 && !(d.refund >= d.total && d.total > 0));
  const checks: Check[] = [];
  const add = (c: Omit<Check, "findings">, findings: Finding[]) => checks.push({ ...c, findings });

  // 1. VAT missing
  add({ id: "vat_zero", severity: "medium", title: "فواتير بيع بدون ضريبة قيمة مضافة",
    why: "في السعودية الضريبة 15% على أغلب المبيعات. فاتورة بدون ضريبة يا إما العميل معفي فعلاً، يا إما الضريبة اتنست — وساعتها انت مسؤول تدفعها لهيئة الزكاة من جيبك.",
    fix: "افتح الفاتورة في دفترة: لو العميل مش معفي، صحّح الضريبة أو اعمل إشعار دائن وفاتورة جديدة." },
    live.filter(d => d.net > 0 && Math.abs(d.tax) < 0.01).map(d => ({ key: `vat_zero:${d.id}`, title: `فاتورة ${d.no} — ${d.party}`, detail: `صافي ${r2(d.net)} ر.س بدون ضريبة. الضريبة المفروضة لو مش معفي: ${r2(d.net * VAT)} ر.س`, amount: r2(d.net * VAT), date: d.date, link: { kind: "sale", id: d.id } })));

  // 2. VAT rate not 15%
  add({ id: "vat_rate", severity: "medium", title: "ضريبة بنسبة غير 15%",
    why: "نسبة ضريبة مختلفة عن 15% غالباً معناها خصم اتحسب غلط أو بند معفي اتخلط مع بند خاضع — والإقرار الضريبي هيطلع غلط.",
    fix: "راجع بنود الفاتورة في دفترة وتأكد إن كل بند عليه النسبة الصح." },
    live.filter(d => d.net > 0 && d.tax > 0.01 && Math.abs(d.tax / d.net - VAT) > 0.005).map(d => ({ key: `vat_rate:${d.id}`, title: `فاتورة ${d.no} — ${d.party}`, detail: `الضريبة ${r2(d.tax / d.net * 100)}% بدل 15% (الفرق ${r2(d.net * VAT - d.tax)} ر.س)`, amount: r2(Math.abs(d.net * VAT - d.tax)), date: d.date, link: { kind: "sale", id: d.id } })));

  // 3. totals don't add up
  add({ id: "total_mismatch", severity: "high", title: "إجمالي الفاتورة مش مساوي الصافي + الضريبة",
    why: "لو الأرقام جوه الفاتورة مش متطابقة، يبقى فيه خطأ في الإدخال وكل التقارير المبنية عليها هتطلع غلط.",
    fix: "افتح الفاتورة وصحّح البنود أو الإجمالي." },
    sales.filter(d => Math.abs(d.net + d.tax - d.total) > 1).map(d => ({ key: `total:${d.id}`, title: `فاتورة ${d.no}`, detail: `صافي ${d.net} + ضريبة ${d.tax} ≠ إجمالي ${d.total}`, amount: r2(Math.abs(d.net + d.tax - d.total)), date: d.date, link: { kind: "sale", id: d.id } })));

  // 4. possible duplicates
  const dupMap = new Map<string, typeof live>();
  for (const d of live) { const k = `${d.party_id ?? d.party}|${d.date}|${d.total}`; (dupMap.get(k) || dupMap.set(k, []).get(k)!).push(d); }
  add({ id: "duplicate", severity: "high", title: "احتمال فواتير مكررة",
    why: "نفس العميل ونفس اليوم ونفس المبلغ في أكتر من فاتورة. لو مكررة بالغلط، مبيعاتك ومديونية العميل متضخمة.",
    fix: "اتأكد إنها بيعتين حقيقيتين. لو مكررة، ألغِ واحدة في دفترة." },
    [...dupMap.values()].filter(g => g.length > 1).map(g => ({ key: `dup:${g.map(d => d.id).sort().join("-")}`, title: `${g.length} فواتير لـ ${g[0].party}`, detail: `أرقام ${g.map(d => d.no).join("، ")} — كل واحدة ${g[0].total} ر.س يوم ${g[0].date}`, amount: r2(g[0].total * (g.length - 1)), date: g[0].date, link: { kind: "sale", id: g[1].id } })));

  // 5. overpaid
  add({ id: "overpaid", severity: "high", title: "فواتير مدفوع فيها أكتر من قيمتها",
    why: "المدفوع أكبر من الإجمالي معناه دفعة اتسجلت على الفاتورة الغلط أو مرتين — وعميل تاني مديونيته ظاهرة أكبر من الحقيقة.",
    fix: "راجع مدفوعات العميل في دفترة وانقل الدفعة للفاتورة الصح." },
    sales.filter(d => d.paid > d.total + 1).map(d => ({ key: `overpaid:${d.id}`, title: `فاتورة ${d.no} — ${d.party}`, detail: `مدفوع ${d.paid} من إجمالي ${d.total}`, amount: r2(d.paid - d.total), date: d.date, link: { kind: "sale", id: d.id } })));

  // 6. numbering gaps
  const gaps = numberGaps(inp.sales.map(d => d.no));
  add({ id: "gaps", severity: "low", title: "أرقام فواتير ناقصة في التسلسل",
    why: "التسلسل لازم يكون متصل. الرقم الناقص غالباً فاتورة اتحذفت أو مسودة — وهيئة الزكاة بتسأل عن الأرقام الناقصة.",
    fix: "اعرف إيه اللي حصل للرقم ده في دفترة (ملغية؟ مسودة؟) وسجّل السبب في الملاحظة." },
    gaps.length ? [{ key: `gaps:${gaps.join(",")}`, title: `${gaps.length} رقم ناقص`, detail: gaps.slice(0, 20).join("، ") + (gaps.length > 20 ? " …" : ""), amount: null, date: null, link: null }] : []);

  // 7. big discounts
  const invById = new Map(inp.sales.map(d => [d.id, d]));
  add({ id: "discount", severity: "medium", title: "خصومات كبيرة (أكتر من 25%)",
    why: "الخصم الكبير بياكل الربح مباشرة. لازم يكون معروف مين وافق عليه وليه.",
    fix: "حدد أقصى خصم للمناديب من تبويب التسعير، واعتمد أي خصم أكبر بنفسك." },
    discounts.filter(l => l.discount > 0 && l.discount / (l.net + l.discount) > 0.25 && invById.has(l.invoice_id) && inR(invById.get(l.invoice_id)!.date)).map(l => { const d = invById.get(l.invoice_id)!; const p = l.discount / (l.net + l.discount) * 100;
      return { key: `disc:${l.invoice_id}:${l.item}`, title: `${l.item} — فاتورة ${d.no}`, detail: `خصم ${r2(l.discount)} ر.س (${r2(p)}%) لـ ${d.party}`, amount: r2(l.discount), date: d.date, link: { kind: "sale", id: d.id } as Link }; }));

  // 8. sold below cost (from the pricing engine)
  add({ id: "below_cost", severity: "high", title: "بيع بأقل من تكلفة الشراء",
    why: "كل وحدة اتباعت كده خسّرتك فلوس فعلاً، حتى قبل الرواتب والإيجار.",
    fix: "اعرف مين باع وليه. حدّث أقل سعر مسموح للمناديب." },
    fin.price_guard.lines.filter(l => l.below_cost).map(l => ({ key: `bcost:${l.id}:${l.key}`, title: `${l.item} — فاتورة ${l.no}`, detail: `اتباع بـ ${l.price} والتكلفة ${l.cost} × ${l.qty} (${l.party})`, amount: r2((l.cost - l.price) * l.qty), date: l.date, link: { kind: "sale", id: l.id } as Link })));

  // 9. returns
  const refunded = sales.filter(d => d.refund > 0);
  const refundTotal = refunded.reduce((s, d) => s + d.refund, 0), salesTotal = sales.reduce((s, d) => s + d.total, 0);
  add({ id: "returns", severity: salesTotal && refundTotal / salesTotal > 0.1 ? "medium" : "low", title: `مرتجعات${salesTotal ? ` (${r2(refundTotal / salesTotal * 100)}% من المبيعات)` : ""}`,
    why: "المرتجع بيلغي البيعة. نسبة مرتجعات فوق 10% معناها مشكلة: منتج، سعر، أو بيع اتعمل قبل ما العميل يكون جاهز.",
    fix: "اكتب سبب كل مرتجع في الملاحظة عشان تعرف النمط." },
    refunded.map(d => ({ key: `ret:${d.id}`, title: `فاتورة ${d.no} — ${d.party}`, detail: `مرتجع ${r2(d.refund)} ر.س من ${d.total}`, amount: r2(d.refund), date: d.date, link: { kind: "sale", id: d.id } as Link })));

  // 10. negative stock
  add({ id: "neg_stock", severity: "medium", title: "مخزون بالسالب",
    why: "يعني اتباع أكتر من اللي اتسجل إنه دخل المخزن. تكلفة البضاعة والربح بيطلعوا غلط، وممكن بضاعة تكون ضايعة.",
    fix: "سجّل فاتورة الشراء أو تسوية الجرد الناقصة في دفترة." },
    inp.products.filter(p => p.stock < 0).map(p => ({ key: `neg:${p.id}`, title: p.name, detail: `الرصيد ${p.stock}`, amount: null, date: null, link: { kind: "tab", tab: "pricing" } as Link })));

  // 11. months with sales but no expenses
  add({ id: "no_opex", severity: "medium", title: "شهور فيها مبيعات ومفيش مصروفات متسجلة",
    why: "الرواتب والإيجار بيتصرفوا كل شهر. لو ما اتسجلوش في شهرهم، الشهر ده يبان كسبان أكتر من الحقيقة وشهر تاني يبان خسران.",
    fix: "سجّل المصروفات في دفترة بتاريخ الشهر اللي تخصه، حتى لو اتدفعت بعدين." },
    fin.monthly.filter(m => Number(m.sales) > 0 && Number(m.opex) <= 0).map(m => ({ key: `noopex:${m.m}`, title: String(m.m), detail: `مبيعات ${m.sales} ر.س ومصروفات صفر`, amount: null, date: `${m.m}-01`, link: { kind: "tab", tab: "pnl" } as Link })));

  // 12. expenses without an account
  const entries = inp.entries.filter(e => e.kind === "expense" && inR(e.date));
  add({ id: "no_account", severity: "low", title: "مصروفات من غير حساب",
    why: "من غير حساب ما نقدرش نعرف المصروف ده رواتب ولا تسويق ولا إيجار.",
    fix: "افتح المصروف في دفترة واختار الحساب الصح." },
    entries.filter(e => e.account_id === null).map(e => ({ key: `noacc:${e.id}`, title: `${e.vendor || "مصروف"} — ${e.date}`, detail: `${e.amount} ر.س ${e.note ? `· ${e.note.slice(0, 60)}` : ""}`, amount: e.amount, date: e.date, link: { kind: "tab", tab: "pnl" } as Link })));

  // 13. duplicate expenses
  const eMap = new Map<string, typeof entries>();
  for (const e of entries) { const k = `${e.account_id}|${e.date}|${e.amount}`; (eMap.get(k) || eMap.set(k, []).get(k)!).push(e); }
  add({ id: "dup_expense", severity: "medium", title: "احتمال مصروف متسجل مرتين",
    why: "نفس الحساب ونفس اليوم ونفس المبلغ. لو اتسجل مرتين، ربحك ظاهر أقل من الحقيقة.",
    fix: "اتأكد من الإيصالات واحذف المكرر في دفترة." },
    [...eMap.values()].filter(g => g.length > 1).map(g => ({ key: `dupexp:${g.map(e => e.id).sort().join("-")}`, title: `${g.length} × ${g[0].amount} ر.س يوم ${g[0].date}`, detail: g.map(e => e.note || e.vendor).filter(Boolean).join(" | ").slice(0, 140) || "—", amount: r2(g[0].amount * (g.length - 1)), date: g[0].date, link: { kind: "tab", tab: "pnl" } as Link })));

  // 14. unusual expenses (3× the usual for that account)
  const byAcc = new Map<number, number[]>();
  for (const e of inp.entries) if (e.kind === "expense" && e.account_id !== null) (byAcc.get(e.account_id) || byAcc.set(e.account_id, []).get(e.account_id)!).push(e.amount);
  const accName = new Map(inp.accounts.map(a => [a.id, a]));
  add({ id: "outlier", severity: "low", title: "مصروفات أكبر بكتير من المعتاد",
    why: "مبلغ أكبر من 3 أضعاف المعتاد لنفس البند يستاهل نظرة — يمكن صح ويمكن غلطة في رقم.",
    fix: "اتأكد من الفاتورة/الإيصال." },
    entries.filter(e => { if (e.account_id === null || e.amount < 5000) return false; const acc = accName.get(e.account_id); if (acc && !acc.code.startsWith("5")) return false; const a = byAcc.get(e.account_id) || []; return a.length >= 4 && e.amount > 3 * median(a); })
      .map(e => ({ key: `out:${e.id}`, title: `${accName.get(e.account_id!)?.name || "مصروف"} — ${e.date}`, detail: `${e.amount} ر.س (المعتاد حوالي ${r2(median(byAcc.get(e.account_id!)!))}) ${e.note ? `· ${e.note.slice(0, 50)}` : ""}`, amount: e.amount, date: e.date, link: { kind: "tab", tab: "pnl" } as Link })));

  // 15. purchase cost jumps
  const lastCost = new Map<string, { unit: number; date: string; no: string }>();
  const jumps: Finding[] = [];
  for (const d of [...inp.purchases].sort((a, b) => a.date.localeCompare(b.date))) for (const l of d.lines) {
    if (!(l.quantity > 0 && l.net > 0)) continue;
    const k = l.product_id !== null ? `p${l.product_id}` : l.item.toLowerCase(), unit = l.net / l.quantity, prev = lastCost.get(k);
    if (prev && unit > prev.unit * 1.2 && inR(d.date)) jumps.push({ key: `jump:${d.id}:${k}`, title: `${l.item} — شراء ${d.no}`, detail: `التكلفة طلعت من ${r2(prev.unit)} لـ ${r2(unit)} (+${r2((unit / prev.unit - 1) * 100)}%) من ${d.party}`, amount: r2((unit - prev.unit) * l.quantity), date: d.date, link: { kind: "purchase", id: d.id } });
    lastCost.set(k, { unit, date: d.date, no: d.no });
  }
  add({ id: "cost_jump", severity: "low", title: "زيادة في سعر الشراء أكتر من 20%",
    why: "لو التكلفة زادت وسعر البيع زي ما هو، هامشك بيقل من غير ما تاخد بالك.",
    fix: "حدّث سعر البيع من تبويب التسعير أو فاوض المورد." }, jumps);

  // 16. very old receivables
  add({ id: "ar_old", severity: "high", title: "فلوس عند العملاء متأخرة أكتر من 90 يوم",
    why: "كل ما الدين يقدم، احتمال تحصيله يقل بسرعة. بعد 90 يوم بيعتبر دين معرّض للخطر.",
    fix: "اتواصل مع العميل، اتفق على جدول سداد، وأوقف البيع الآجل له لحد ما يسدد." },
    fin.ar.open.filter(o => o.days > 90).map(o => ({ key: `ar90:${o.id}`, title: `فاتورة ${o.no} — ${o.party}`, detail: `متأخرة ${o.days} يوم — باقي ${o.unpaid} ر.س`, amount: o.unpaid, date: o.date, link: { kind: "sale", id: o.id } as Link })));

  // 17. customer concentration in receivables
  add({ id: "ar_conc", severity: "medium", title: "عميل واحد عليه أكتر من 30% من المديونية",
    why: "لو العميل ده اتأخر أو ما دفعش، السيولة كلها تتأثر.",
    fix: "حط حد ائتمان للعميل ده وما تزودش البيع الآجل له قبل ما يسدد جزء." },
    fin.ar.total > 0 ? fin.ar.parties.filter(p => p.unpaid / fin.ar.total > 0.3).map(p => ({ key: `arconc:${p.name}`, title: p.name, detail: `عليه ${p.unpaid} ر.س = ${r2(p.unpaid / fin.ar.total * 100)}% من كل المديونية`, amount: p.unpaid, date: null, link: { kind: "tab", tab: "ar" } as Link })) : []);

  // 18. overdue to suppliers
  add({ id: "ap_overdue", severity: "medium", title: "مستحقات موردين فات ميعادها",
    why: "التأخير على الموردين بيضيّع خصوماتهم وثقتهم، وممكن يوقفوا التوريد.",
    fix: "اعمل جدول سداد حسب الأقدم ووازنه مع التحصيل في تبويب السيولة." },
    fin.ap.open.filter(o => o.days > 0).map(o => ({ key: `ap:${o.id}`, title: `شراء ${o.no} — ${o.party}`, detail: `متأخر ${o.days} يوم — باقي ${o.unpaid} ر.س`, amount: o.unpaid, date: o.date, link: { kind: "purchase", id: o.id } as Link })));

  return checks;
}

/** Health score: share of (severity-weighted) checks with no open findings. */
export function auditScore(checks: Check[]) {
  const total = checks.reduce((s, c) => s + WEIGHT[c.severity], 0) || 1;
  const pass = checks.filter(c => c.findings.every(f => f.review)).reduce((s, c) => s + WEIGHT[c.severity], 0);
  return Math.round(pass / total * 100);
}
