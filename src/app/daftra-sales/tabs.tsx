"use client";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { FinData, Tab } from "./FinanceHub";
import { sar, num, pct, short, mLabel, C, Hint, Kpi, Card, ExcelBtn, Bars, MonthChart, Table, Pill, STATUS_PAY, AGE } from "./kit";

type X = (s: string) => string;
const LEVEL: Record<string, [string, string, string]> = { danger: ["عاجل", "border-red-200 bg-red-50", "text-red-700"], warn: ["مهم", "border-amber-200 bg-amber-50", "text-amber-800"], good: ["ممتاز", "border-emerald-200 bg-emerald-50", "text-emerald-700"], info: ["للعلم", "border-sky-200 bg-sky-50", "text-sky-800"] };
const LEVEL_ICON: Record<string, string> = { danger: "flag", warn: "warn", good: "trophy", info: "sparkle" };
const daftraUrl = (sub: string, kind: "sale" | "purchase", id: number) => `https://${sub}.daftra.com/owner/${kind === "sale" ? "invoices" : "purchase_invoices"}/view/${id}`;

function AdviceCard({ a, go }: { a: FinData["advice"][number]; go?: (t: Tab) => void }) {
  const [l, box, txt] = LEVEL[a.level];
  return <div className={`rounded-2xl border p-4 ${box}`}>
    <div className="flex items-start gap-3"><span className={`mt-0.5 ${txt}`}><Icon name={LEVEL_ICON[a.level]} size={20} /></span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-extrabold ${txt}`}>{l}</span><b className="text-sm text-[var(--ink)]">{a.title}</b></div>
        <p className="mt-1 text-[12.5px] leading-6 text-[var(--ink-soft)]">{a.text}</p>
        {a.tab && go && <button type="button" onClick={() => go(a.tab as Tab)} className={`mt-1.5 text-xs font-bold ${txt} hover:underline`}>شوف التفاصيل ‹</button>}</div></div>
  </div>;
}

/* ═══════════════ الملخص ═══════════════ */
export function Overview({ d, go, pickMonth, x }: { d: FinData; go: (t: Tab) => void; pickMonth: (m: string) => void; x: X }) {
  const k = d.kpi;
  const steps: Array<[string, number, string]> = [["صافي المبيعات", k.sales, C.green], ["− تكلفة البضاعة", -k.cogs, C.orange], ["= مجمل الربح", k.gross, C.teal], ["− المصروفات", -k.opex, C.red], ["+ إيرادات أخرى", k.other_income, C.blue], ["= صافي الربح", k.net, k.net >= 0 ? C.green : C.red]];
  const maxStep = Math.max(1, ...steps.map(s => Math.abs(s[1])));
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="صافي المبيعات" value={sar(k.sales)} sub={`${k.invoices} فاتورة · ${k.clients} عميل`} icon="sales" color={C.green} hint="كل اللي بعته في الفترة بعد خصم المرتجعات، ومن غير ضريبة القيمة المضافة (الضريبة مش فلوسك، دي للدولة)." onClick={() => go("sales")} />
      <Kpi label="مجمل الربح" value={sar(k.gross)} sub={`هامش ${pct(k.gross_margin)} من المبيعات`} icon="trophy" color={C.teal} hint="المبيعات ناقص تكلفة شراء البضاعة اللي اتباعت بس. ده الربح قبل المرتبات والإيجار وباقي المصاريف." onClick={() => go("pricing")} />
      <Kpi label="المصروفات التشغيلية" value={sar(k.opex)} sub="رواتب، تسويق، إيجار…" icon="wallet" color={C.orange} hint="مصاريف تشغيل الشركة من دفترة (حسابات 5xxx). التحويلات للخزينة وسحوبات الشريك مش مصروف ومستبعدة." onClick={() => go("pnl")} />
      <Kpi label="صافي الربح" value={sar(k.net)} sub={`هامش ${pct(k.net_margin)}`} icon="coverage" color={k.net >= 0 ? C.green : C.red} tone={k.net >= 0 ? "good" : "bad"} hint="اللي فاضل في جيبك فعلاً: مجمل الربح ناقص المصروفات زائد أي إيرادات تانية." onClick={() => go("pnl")} />
      <Kpi label="ليا عند العملاء" value={sar(k.ar)} sub={<span className={k.ar_overdue ? "font-bold text-red-700" : ""}>منها متأخر {sar(k.ar_overdue)}</span>} icon="time" color={C.amber} hint="فلوس العملاء اللي لسه ما دفعوهاش (شاملة الضريبة) — حتى اليوم، مش مرتبطة بالفترة." onClick={() => go("ar")} />
      <Kpi label="عليا للموردين" value={sar(k.ap)} sub={`منها متأخر ${sar(k.ap_overdue)}`} icon="send" color={C.violet} hint="فواتير شراء لسه ما دفعتهاش للموردين — حتى اليوم." onClick={() => go("ap")} />
      <Kpi label="المشتريات" value={sar(k.purchases)} sub={`${k.purchase_invoices} فاتورة شراء`} icon="products" color={C.blue} hint="قيمة البضاعة اللي اشتريتها في الفترة قبل الضريبة. مش كلها تكلفة — اللي لسه في المخزن أصل مش مصروف." onClick={() => go("purchases")} />
      <Kpi label="الضريبة المستحقة (تقديري)" value={sar(k.vat_payable)} sub={`مخرجات ${short(k.vat_out)} − مدخلات ${short(k.vat_in)}`} icon="file" color={C.slate} hint="ضريبة المبيعات اللي حصّلتها ناقص ضريبة المشتريات والمصاريف اللي دفعتها. الرقم ده تقريبي ومراجعته مع المحاسب قبل الإقرار." />
    </div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <Card title="الربح خطوة بخطوة" hint="إزاي المبيعات بتتحول لصافي ربح." className="lg:col-span-2">
        <div className="space-y-2.5">{steps.map(([l, v, c]) => <div key={l}><div className="mb-1 flex justify-between text-xs"><span className="font-bold">{l}</span><b style={{ color: c }}>{sar(v)}</b></div><div className="h-2.5 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.abs(v) / maxStep * 100}%`, background: c }} /></div></div>)}</div>
        {k.cost_coverage < 99 && <p className="mt-3 rounded-xl bg-amber-50 p-2 text-[11px] text-amber-900">تنبيه: {pct(100 - k.cost_coverage)} من المبيعات منتجاتها ملهاش سعر شراء مسجل — تكلفتها مش محسوبة.</p>}
      </Card>
      <Card title="شهر بشهر" className="lg:col-span-3" right={<ExcelBtn href={x("summary")} />}>
        <MonthChart data={d.monthly} series={[{ key: "sales", label: "مبيعات", color: C.mint }, { key: "gross", label: "مجمل ربح", color: C.teal }, { key: "net", label: "صافي ربح", color: C.green }]} onPick={pickMonth} />
      </Card>
    </div>
    <Card title="نصايح المستشار المالي" right={<button type="button" onClick={() => go("advisor")} className="text-xs font-bold text-[var(--sky-deep)]">كل النصايح والتخطيط ‹</button>}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">{d.advice.slice(0, 3).map((a, i) => <AdviceCard key={i} a={a} go={go} />)}</div>
    </Card>
  </div>;
}

/* ═══════════════ المبيعات ═══════════════ */
export function Sales({ d, pickMonth, x, subdomain }: { d: FinData; pickMonth: (m: string) => void; x: X; subdomain: string }) {
  const k = d.kpi;
  const [prodSort, setProdSort] = useState<"net" | "gross">("net");
  const products = [...d.salesByProduct].sort((a, b) => b[prodSort] - a[prodSort]).slice(0, 12);
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="صافي المبيعات" value={sar(k.sales)} sub={`شامل الضريبة ${sar(k.sales_total)}`} icon="sales" color={C.green} />
      <Kpi label="عدد الفواتير" value={num(k.invoices)} sub={`متوسط الفاتورة ${sar(k.invoices ? k.sales / k.invoices : 0)}`} icon="file" color={C.blue} />
      <Kpi label="المحصّل في الفترة" value={sar(k.collected)} sub="دفعات العملاء المسجلة في دفترة" icon="check" color={C.teal} hint="الفلوس اللي دخلت فعلاً من العملاء في الفترة دي — ممكن تكون عن فواتير قديمة." />
      <Kpi label="المرتجعات" value={sar(k.refunds)} sub="شامل الضريبة" icon="repeat" color={C.red} />
    </div>
    <Card title="المبيعات والتحصيل شهر بشهر" right={<ExcelBtn href={x("sales")} label="تقرير المبيعات Excel" />}>
      <MonthChart data={d.monthly} series={[{ key: "sales", label: "مبيعات (قبل الضريبة)", color: C.mint }, { key: "collected", label: "تحصيل", color: C.teal }]} onPick={pickMonth} />
    </Card>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="أكتر المنتجات مبيعاً" right={<div className="flex gap-1 rounded-lg bg-[var(--bg)] p-0.5 text-[11px] font-bold">{([["net", "بالمبيعات"], ["gross", "بالربح"]] as const).map(([v, l]) => <button key={v} type="button" onClick={() => setProdSort(v)} className={`rounded-md px-2 py-1 ${prodSort === v ? "bg-white text-[var(--navy)] shadow-sm" : "text-[var(--muted)]"}`}>{l}</button>)}</div>}>
        <Bars rows={products.map(p => ({ label: p.name, value: p[prodSort], sub: `${num(p.qty)} وحدة · ${prodSort === "net" ? `ربح ${sar(p.gross)}` : `مبيعات ${sar(p.net)}`} · هامش ${pct(p.margin)}` }))} color={prodSort === "net" ? C.mint : C.teal} />
      </Card>
      <Card title="أكبر العملاء">
        <Bars rows={d.salesByClient.slice(0, 12).map(c => ({ label: c.name, value: c.net, sub: `${c.share}% من مبيعاتك · ${c.n} فاتورة · آخر فاتورة ${c.last}` }))} color={C.blue} />
      </Card>
    </div>
    <Card title="فواتير البيع">
      <Table rows={d.sales} rowKey={r => String(r.id)} search={r => `${r.no} ${r.party} ${r.branch}`} initialSort={["date", -1]} cols={[
        { key: "no", label: "رقم", className: "text-right", render: r => <a href={daftraUrl(subdomain, "sale", r.id)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="font-bold text-[var(--gold)] hover:underline" dir="ltr">{r.no}</a> },
        { key: "date", label: "التاريخ" }, { key: "party", label: "العميل", className: "max-w-64 truncate text-right" },
        { key: "net", label: "الصافي", render: r => <b>{sar(r.net)}</b> }, { key: "total", label: "شامل الضريبة", render: r => sar(r.total) },
        { key: "unpaid", label: "المتبقي", render: r => r.unpaid > 0 && r.status !== 3 ? <span className="font-bold text-orange-700">{sar(r.unpaid)}</span> : "—" },
        { key: "status", label: "الحالة", render: r => { const [t, c] = STATUS_PAY[r.status] || STATUS_PAY[0]; return <Pill text={t} cls={c} />; } },
      ]} />
    </Card>
  </div>;
}

/* ═══════════════ المشتريات ═══════════════ */
export function Purchases({ d, pickMonth, x, subdomain }: { d: FinData; pickMonth: (m: string) => void; x: X; subdomain: string }) {
  const k = d.kpi;
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="المشتريات قبل الضريبة" value={sar(k.purchases)} sub={`شامل الضريبة ${sar(k.purchases_total)}`} icon="products" color={C.blue} />
      <Kpi label="فواتير الشراء" value={num(k.purchase_invoices)} sub={`${d.purchasesBySupplier.length} مورد`} icon="file" color={C.slate} />
      <Kpi label="ضريبة المشتريات" value={sar(k.purchases_tax)} sub="بتتخصم من ضريبة المبيعات" icon="coverage" color={C.teal} hint="ضريبة القيمة المضافة اللي دفعتها للموردين — بتقلل الضريبة اللي هتدفعها للدولة." />
      <Kpi label="عليا للموردين" value={sar(k.ap)} sub={`متأخر ${sar(k.ap_overdue)}`} icon="send" color={C.violet} />
    </div>
    <Card title="المشتريات شهر بشهر" right={<ExcelBtn href={x("purchases")} label="تقرير المشتريات Excel" />}>
      <MonthChart data={d.monthly} series={[{ key: "purchases", label: "مشتريات", color: C.blue }, { key: "cogs", label: "تكلفة اللي اتباع", color: C.orange }]} onPick={pickMonth} />
      <p className="mt-2 text-[11px] text-[var(--muted)]">الفرق بين المشتريات وتكلفة اللي اتباع = بضاعة دخلت المخزن ولسه ما اتباعتش.</p>
    </Card>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card title="حسب المورد"><Bars rows={d.purchasesBySupplier.map(s => ({ label: s.name, value: s.net, sub: `${s.n} فاتورة${s.unpaid ? ` · عليك ${sar(s.unpaid)}` : ""}` }))} color={C.violet} /></Card>
      <Card title="أسعار شراء الأصناف" hint="متوسط سعر الشراء في الفترة مقارنة بآخر سعر — لو آخر سعر أعلى، المورد غلّى عليك." className="lg:col-span-2">
        <Table rows={d.purchasesByProduct} rowKey={r => r.name} search={r => `${r.name} ${r.supplier}`} initialSort={["net", -1]} max={40} cols={[
          { key: "name", label: "الصنف", className: "max-w-56 truncate text-right font-bold" }, { key: "qty", label: "الكمية", render: r => num(r.qty) },
          { key: "net", label: "الإجمالي", render: r => sar(r.net) }, { key: "avg_unit", label: "متوسط السعر", render: r => sar(r.avg_unit, 2) },
          { key: "last_unit", label: "آخر سعر", render: r => { const ch = r.avg_unit && r.last_unit ? (r.last_unit - r.avg_unit) / r.avg_unit * 100 : 0; return <span>{sar(r.last_unit, 2)}{Math.abs(ch) >= 1 && <span className={`mr-1 text-[10.5px] font-bold ${ch > 0 ? "text-red-700" : "text-emerald-700"}`}>{ch > 0 ? "▲" : "▼"}{Math.abs(ch).toFixed(0)}%</span>}</span>; } },
          { key: "last_date", label: "آخر شراء" }, { key: "supplier", label: "المورد", className: "max-w-40 truncate text-right text-[var(--muted)]" },
        ]} />
      </Card>
    </div>
    <Card title="فواتير الشراء">
      <Table rows={d.purchases} rowKey={r => String(r.id)} search={r => `${r.no} ${r.party}`} initialSort={["date", -1]} cols={[
        { key: "no", label: "رقم", className: "text-right", render: r => <a href={daftraUrl(subdomain, "purchase", r.id)} target="_blank" rel="noreferrer" className="font-bold text-[var(--gold)] hover:underline" dir="ltr">{r.no}</a> },
        { key: "date", label: "التاريخ" }, { key: "party", label: "المورد", className: "max-w-64 truncate text-right" },
        { key: "net", label: "الصافي", render: r => <b>{sar(r.net)}</b> }, { key: "total", label: "شامل الضريبة", render: r => sar(r.total) },
        { key: "unpaid", label: "عليك", render: r => r.unpaid > 0 ? <span className="font-bold text-violet-700">{sar(r.unpaid)}</span> : "—" },
        { key: "status", label: "الحالة", render: r => { const [t, c] = STATUS_PAY[r.status] || STATUS_PAY[0]; return <Pill text={t} cls={c} />; } },
      ]} />
    </Card>
  </div>;
}

/* ═══════════════ ليا / عليا ═══════════════ */
export function Book({ d, kind, x, subdomain }: { d: FinData; kind: "ar" | "ap"; x: X; subdomain: string }) {
  const b = d[kind]; const [bk, setBk] = useState<string | null>(null);
  const isAr = kind === "ar";
  const old = (b.buckets["61-90"] || 0) + (b.buckets["90+"] || 0);
  const dso = d.baseline && d.baseline.sales_gross > 0 ? d.kpi.ar / d.baseline.sales_gross * 30 : null;
  const parties = bk ? b.parties.filter(p => p.b[bk] > 0) : b.parties;
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label={isAr ? "إجمالي ليا عند العملاء" : "إجمالي عليا للموردين"} value={sar(b.total)} sub={`${b.parties.length} ${isAr ? "عميل" : "مورد"} · ${b.open.length} فاتورة`} icon={isAr ? "time" : "send"} color={isAr ? C.amber : C.violet} hint="الرقم شامل الضريبة وحتى النهارده — مش مرتبط بالفترة اللي فوق." />
      <Kpi label="فات ميعاده" value={sar(b.overdue)} sub={b.total ? `${Math.round(b.overdue / b.total * 100)}% من الإجمالي` : ""} icon="flag" color={C.red} tone={b.overdue > 0 ? "bad" : undefined} />
      <Kpi label="أقدم من 60 يوم" value={sar(old)} sub={isAr ? "أخطر ديون — احتمال التحصيل بيقل" : "ممكن يأثر على علاقتك بالمورد"} icon="warn" color="#7f151c" />
      {isAr ? <Kpi label="متوسط مدة التحصيل" value={dso === null ? "—" : `${Math.round(dso)} يوم`} sub="الطبيعي 45–60 يوم" icon="calendar" color={C.blue} hint="بتاخد كام يوم في المتوسط لحد ما تحصّل فلوس الفاتورة (DSO). كل ما قل كان أحسن للسيولة." />
        : <Kpi label="المستحق خلال الشهر" value={sar(b.buckets.current)} sub="فواتير لسه ما فاتش ميعادها" icon="calendar" color={C.blue} />}
    </div>
    <Card title="أعمار الديون" hint="بنقسم الفلوس حسب عدد الأيام اللي فاتت بعد ميعاد الاستحقاق. اضغط على أي فترة عشان تفلتر." right={<ExcelBtn href={x(kind)} />}>
      <div className="mb-3 flex h-4 overflow-hidden rounded-full bg-[var(--bg)]">{AGE.map(([k, , c]) => b.buckets[k] ? <button type="button" key={k} onClick={() => setBk(bk === k ? null : k)} title={sar(b.buckets[k])} style={{ width: `${b.buckets[k] / (b.total || 1) * 100}%`, background: c, opacity: bk && bk !== k ? 0.3 : 1 }} /> : null)}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{AGE.map(([k, l, c]) => <button type="button" key={k} onClick={() => setBk(bk === k ? null : k)} className={`rounded-xl border p-2.5 text-right transition ${bk === k ? "border-[var(--navy)] bg-[var(--sky-light)]" : "border-[var(--border)] hover:bg-[var(--bg)]"}`}><div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted)]"><i className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</div><div className="mt-1 font-extrabold">{sar(b.buckets[k])}</div></button>)}</div>
    </Card>
    <Card title={`${isAr ? "العملاء" : "الموردين"}${bk ? ` — ${AGE.find(a => a[0] === bk)?.[1]}` : ""}`} right={bk && <button type="button" onClick={() => setBk(null)} className="text-xs font-bold text-[var(--sky-deep)]">إلغاء الفلتر</button>}>
      <Table rows={parties} rowKey={r => r.name} search={r => r.name} initialSort={["unpaid", -1]} empty="مفيش مستحقات 🎉" cols={[
        { key: "name", label: isAr ? "العميل" : "المورد", className: "max-w-72 truncate text-right font-bold" },
        { key: "unpaid", label: "المتبقي", render: r => <b>{sar(r.unpaid)}</b> },
        { key: "overdue", label: "متأخر", render: r => r.overdue ? <span className="font-bold text-red-700">{sar(r.overdue)}</span> : "—" },
        { key: "oldestDue", label: "أقدم تأخير", render: r => r.oldestDue > 0 ? <span className={r.oldestDue > 60 ? "font-bold text-red-700" : ""}>{r.oldestDue} يوم</span> : "في الميعاد" },
        { key: "n", label: "فواتير" },
      ]} expand={r => <div className="space-y-1.5">{b.open.filter(o => o.party === r.name).map(o => <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs">
        <a href={daftraUrl(subdomain, isAr ? "sale" : "purchase", o.id)} target="_blank" rel="noreferrer" className="font-bold text-[var(--gold)]" dir="ltr">{o.no}</a><span>فاتورة {o.date}</span><span>استحقاق {o.due}</span>
        <span className={o.days > 0 ? "font-bold text-red-700" : "text-emerald-700"}>{o.days > 0 ? `متأخرة ${o.days} يوم` : `باقي ${-o.days} يوم`}</span><b>{sar(o.unpaid)}</b></div>)}</div>} />
    </Card>
    {isAr && <Card title="إزاي تحصّل أسرع"><ul className="list-disc space-y-1.5 pr-5 text-[13px] leading-6 text-[var(--ink-soft)]">
      <li>ابدأ بالفواتير الأقدم من 90 يوم — اتصل بالمسؤول المالي في العميل واتفق على جدول سداد مكتوب.</li>
      <li>وقّف البيع الآجل لأي عميل عليه فواتير متأخرة أكتر من 60 يوم لحد ما يسدد.</li>
      <li>خلّي المندوب المسؤول عن العميل يتابع التحصيل — وربط عمولته بالمحصّل مش بالمبيعات بس.</li>
      <li>لعملاء جدد: خصم صغير (2%) على الدفع خلال 15 يوم أرخص من فلوس متعطلة 4 شهور.</li></ul></Card>}
  </div>;
}

/* ═══════════════ المنتجات والتسعير ═══════════════ */
const PSTAT: Record<string, [string, string]> = { loss: ["بيُباع بخسارة", "bg-red-50 text-red-700 ring-red-200"], below_breakeven: ["ما يغطيش المصاريف", "bg-orange-50 text-orange-700 ring-orange-200"], thin: ["هامش ضعيف", "bg-amber-50 text-amber-800 ring-amber-200"], healthy: ["هامش كويس", "bg-emerald-50 text-emerald-700 ring-emerald-200"], no_cost: ["بدون تكلفة", "bg-slate-100 text-slate-600 ring-slate-200"], dead_stock: ["مخزون راكد", "bg-violet-50 text-violet-700 ring-violet-200"], no_sales: ["بدون مبيعات", "bg-slate-50 text-slate-500 ring-slate-200"] };
export function Pricing({ d, x, reload }: { d: FinData; x: X; reload: () => void }) {
  const toast = useToast();
  const [gm, setGm] = useState(d.settings.target_gross_margin); const [nm, setNm] = useState(d.settings.target_net_margin);
  const [f, setF] = useState<string | null>(null);
  const opexRatio = d.baseline && d.baseline.sales > 0 ? Math.min(0.6, d.baseline.opex / d.baseline.sales) : 0;
  const needed = Math.max(gm / 100, opexRatio + nm / 100);
  const rows = useMemo(() => d.pricing.map(p => ({ ...p, live: p.avg_cost === null ? null : Math.round(p.avg_cost / Math.max(0.1, 1 - needed) * 100) / 100 })), [d.pricing, needed]);
  const counts = rows.reduce<Record<string, number>>((m, p) => { m[p.status] = (m[p.status] || 0) + 1; return m; }, {});
  const shown = f ? rows.filter(p => p.status === f) : rows;
  const stockValue = rows.reduce((s, p) => s + (p.stock_value || 0), 0);
  async function save() { const r = await fetch("/api/admin/finance/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ target_gross_margin: gm, target_net_margin: nm }) }); const j = await r.json().catch(() => null); if (!r.ok) toast(j?.error || "تعذر الحفظ", "error"); else { toast("اتحفظت الأهداف", "success"); reload(); } }
  return <div className="space-y-4">
    <Card title="معادلة التسعير" hint="سعر التعادل = التكلفة ÷ (1 − نسبة المصاريف). السعر المقترح = التكلفة ÷ (1 − الهامش المطلوب). الأسعار كلها قبل الضريبة.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <label className="block"><div className="flex justify-between text-xs font-bold"><span>هامش مجمل الربح المستهدف</span><b className="text-[var(--navy)]">{gm}%</b></div><input type="range" min={10} max={80} value={gm} onChange={e => setGm(Number(e.target.value))} className="mt-2 w-full accent-[var(--sky)]" /><div className="text-[11px] text-[var(--muted)]">في التوزيع الطبي والتجميلي، 40–60% طبيعي.</div></label>
        <label className="block"><div className="flex justify-between text-xs font-bold"><span>صافي الربح المستهدف</span><b className="text-[var(--navy)]">{nm}%</b></div><input type="range" min={0} max={40} value={nm} onChange={e => setNm(Number(e.target.value))} className="mt-2 w-full accent-[var(--sky)]" /><div className="text-[11px] text-[var(--muted)]">مصاريفك التشغيلية = {pct(opexRatio * 100)} من المبيعات (آخر 6 شهور).</div></label>
        <div className="rounded-2xl bg-[var(--sky-light)] p-3 text-[12.5px] leading-6"><div>عشان تحقق الهدفين، كل منتج لازم يتباع بـ <b>تكلفته × {(1 / Math.max(0.1, 1 - needed)).toFixed(2)}</b> على الأقل (هامش {Math.round(needed * 100)}%).</div>
          {(gm !== d.settings.target_gross_margin || nm !== d.settings.target_net_margin) && <button type="button" onClick={() => void save()} className="mt-2 rounded-xl bg-[var(--navy)] px-3 py-1.5 text-xs font-bold text-white">احفظ كأهداف ثابتة</button>}</div>
      </div>
    </Card>
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => setF(null)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${!f ? "bg-[var(--navy)] text-white" : "bg-white ring-1 ring-[var(--border)]"}`}>الكل ({rows.length})</button>
      {Object.entries(PSTAT).filter(([k]) => counts[k]).map(([k, [l]]) => <button key={k} type="button" onClick={() => setF(f === k ? null : k)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${f === k ? "bg-[var(--navy)] text-white" : "bg-white ring-1 ring-[var(--border)]"}`}>{l} ({counts[k]})</button>)}
      <span className="mr-auto text-xs text-[var(--muted)]">قيمة المخزون بالتكلفة: <b className="text-[var(--navy)]">{sar(stockValue)}</b></span><ExcelBtn href={x("pricing")} label="تقرير التسعير Excel" />
    </div>
    <Card>
      <Table rows={shown} rowKey={r => r.key} search={r => `${r.name} ${r.code}`} initialSort={["revenue", -1]} max={60} cols={[
        { key: "name", label: "المنتج", className: "max-w-56 truncate text-right font-bold" },
        { key: "avg_cost", label: "التكلفة", hint: "متوسط سعر الشراء المرجّح من فواتير الشراء (قبل الضريبة).", render: r => sar(r.avg_cost, 2) },
        { key: "realized_price", label: "بتبيعه بكام", hint: "متوسط سعر البيع الفعلي بعد الخصومات في الفترة.", render: r => r.realized_price === null ? "—" : <b className={r.avg_cost !== null && r.realized_price < r.avg_cost ? "text-red-700" : ""}>{sar(r.realized_price, 2)}</b> },
        { key: "margin", label: "الهامش", render: r => r.margin === null ? "—" : <b className={r.margin < 0 ? "text-red-700" : r.margin < gm ? "text-amber-700" : "text-emerald-700"}>{pct(r.margin)}</b> },
        { key: "breakeven_price", label: "سعر التعادل", hint: "أقل سعر يغطي تكلفة المنتج ونصيبه من مصاريف الشركة — تحت كده بتخسر.", render: r => sar(r.breakeven_price, 2) },
        { key: "live", label: "السعر المقترح", hint: "السعر اللي يحقق هوامش الربح اللي حددتها فوق.", render: r => r.live === null ? "—" : <b className="text-[var(--sky-deep)]">{sar(r.live, 0)}</b> },
        { key: "list_price", label: "سعر القائمة", render: r => r.list_price ? sar(r.list_price) : "—" },
        { key: "qty_sold", label: "مباع", render: r => num(r.qty_sold) }, { key: "gross", label: "الربح", render: r => <span className={r.gross < 0 ? "text-red-700" : ""}>{sar(r.gross)}</span> },
        { key: "stock", label: "المخزون", render: r => r.stock ? <span title={r.stock_value ? sar(r.stock_value) : ""}>{num(r.stock)}</span> : "—" },
        { key: "status", label: "الحالة", render: r => <Pill text={PSTAT[r.status][0]} cls={PSTAT[r.status][1]} /> },
      ]} expand={r => <div className="grid gap-2 text-xs sm:grid-cols-4">
        <div>آخر سعر شراء: <b>{sar(r.last_cost, 2)}</b>{r.last_cost_date && ` (${r.last_cost_date})`}</div><div>آخر مورد: <b>{r.last_supplier || "—"}</b></div>
        <div>اتشرى في الفترة: <b>{num(r.qty_purchased)}</b> بـ {sar(r.purchased_value)}</div><div>آخر بيع: <b>{r.last_sale || "—"}</b></div>
        {r.live !== null && r.realized_price !== null && r.realized_price < r.live && <div className="sm:col-span-4 rounded-xl bg-amber-50 p-2 text-amber-900">لو بعته بالسعر المقترح ({sar(r.live)}) بدل {sar(r.realized_price, 2)}، كان ربحك زاد {sar((r.live - r.realized_price) * r.qty_sold)} في الفترة دي.</div>}
      </div>} />
    </Card>
  </div>;
}

/* ═══════════════ الأرباح والمصروفات ═══════════════ */
const TREAT: Record<string, [string, string]> = { opex: ["مصروف تشغيلي", "bg-orange-50 text-orange-700 ring-orange-200"], cogs: ["تكلفة مبيعات", "bg-sky-50 text-sky-700 ring-sky-200"], exclude: ["مش مصروف", "bg-slate-100 text-slate-600 ring-slate-200"], other_income: ["إيراد آخر", "bg-emerald-50 text-emerald-700 ring-emerald-200"] };
const FCAT: Record<string, string> = { rent: "إيجار", salaries: "رواتب", insurance: "تأمينات", subscriptions: "اشتراكات وبرامج", marketing: "تسويق", transport: "مواصلات وسيارات", government: "حكومي ورسوم", utilities: "كهرباء ومياه واتصالات", other: "أخرى" };
export function Pnl({ d, pickMonth, x, reload }: { d: FinData; pickMonth: (m: string) => void; x: X; reload: () => void }) {
  const toast = useToast();
  const setTreat = async (account_id: number | null, treatment: string | null) => {
    if (!account_id) { toast("القيود دي ملهاش حساب في دفترة", "error"); return; }
    const r = await fetch("/api/admin/finance/overrides", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ account_id, treatment }) });
    if (r.ok) { toast("اتغير التصنيف — في الـ CRM بس", "success"); reload(); } else toast("تعذر الحفظ", "error");
  };
  type Tot = { sales: number; cogs: number; gross: number; opex: number; other: number; net: number };
  const tot = d.monthly.reduce<Tot>((s, m) => ({ sales: s.sales + Number(m.sales), cogs: s.cogs + Number(m.cogs), gross: s.gross + Number(m.gross), opex: s.opex + Number(m.opex), other: s.other + Number(m.other), net: s.net + Number(m.net) }), { sales: 0, cogs: 0, gross: 0, opex: 0, other: 0, net: 0 });
  const avgOpex = d.baseline?.opex || 0;
  return <div className="space-y-4">
    <Card title="قائمة الدخل شهر بشهر" hint="المبيعات − تكلفة البضاعة = مجمل الربح. مجمل الربح − المصروفات + إيرادات أخرى = صافي الربح." right={<ExcelBtn href={x("pnl")} label="الأرباح والمصروفات Excel" />}>
      <MonthChart data={d.monthly} series={[{ key: "gross", label: "مجمل ربح", color: C.teal }, { key: "opex", label: "مصروفات", color: C.orange }, { key: "net", label: "صافي ربح", color: C.green }]} onPick={pickMonth} height={170} />
      <div className="-mx-4 mt-4 overflow-x-auto px-4"><table className="w-full min-w-[720px] text-sm"><thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="p-2.5 text-right">الشهر</th><th className="p-2.5">المبيعات</th><th className="p-2.5">تكلفة البضاعة</th><th className="p-2.5">مجمل الربح</th><th className="p-2.5">المصروفات</th><th className="p-2.5">إيرادات أخرى</th><th className="p-2.5">صافي الربح</th><th className="p-2.5">الهامش</th></tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{d.monthly.map(m => { const n = Number(m.net), s = Number(m.sales); return <tr key={String(m.m)} onClick={() => pickMonth(String(m.m))} className="cursor-pointer hover:bg-[var(--sky-light)]/60"><td className="p-2.5 font-bold">{mLabel(String(m.m), true)}</td><td className="p-2.5 text-center">{sar(s)}</td><td className="p-2.5 text-center text-[var(--muted)]">{sar(Number(m.cogs))}</td><td className="p-2.5 text-center">{sar(Number(m.gross))}</td><td className="p-2.5 text-center text-orange-700">{sar(Number(m.opex))}</td><td className="p-2.5 text-center">{Number(m.other) ? sar(Number(m.other)) : "—"}</td><td className={`p-2.5 text-center font-extrabold ${n < 0 ? "text-red-700" : "text-emerald-700"}`}>{sar(n)}</td><td className="p-2.5 text-center">{s ? pct(n / s * 100) : "—"}</td></tr>; })}
          <tr className="bg-[var(--sky-light)] font-extrabold"><td className="p-2.5">الإجمالي</td><td className="p-2.5 text-center">{sar(tot.sales)}</td><td className="p-2.5 text-center">{sar(tot.cogs)}</td><td className="p-2.5 text-center">{sar(tot.gross)}</td><td className="p-2.5 text-center">{sar(tot.opex)}</td><td className="p-2.5 text-center">{sar(tot.other)}</td><td className={`p-2.5 text-center ${tot.net < 0 ? "text-red-700" : "text-emerald-700"}`}>{sar(tot.net)}</td><td className="p-2.5 text-center">{tot.sales ? pct(tot.net / tot.sales * 100) : "—"}</td></tr></tbody></table></div>
    </Card>
    <Card title="المصروفات حسب الحساب في دفترة" hint="بنصنف كل مصروف حسب حسابه في دليل حسابات دفترة: 5xxx مصروف تشغيلي، 51xx تكلفة مبيعات، وأي حاجة تانية (خزينة، جاري الشريك، ضريبة، عُهد) مش مصروف. تقدر تغيّر التصنيف هنا — يتحفظ في الـ CRM بس.">
      <div className="space-y-1.5">{d.expensesByAccount.map(a => <div key={String(a.account_id)} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] p-2.5">
        <div className="min-w-0 flex-1"><b className="text-sm">{a.name}</b> <span className="text-[11px] text-[var(--muted)]" dir="ltr">{a.code}</span><div className="text-[11px] text-[var(--muted)]">{a.n} قيد</div></div>
        <b className={a.treatment === "exclude" ? "text-[var(--muted)] line-through" : ""}>{sar(a.amount)}</b>
        <select value={a.treatment} onChange={e => void setTreat(a.account_id, e.target.value)} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"><option value="opex">مصروف تشغيلي</option><option value="cogs">تكلفة مبيعات</option><option value="exclude">مش مصروف (استبعاد)</option></select>
      </div>)}{!d.expensesByAccount.length && <div className="text-sm text-[var(--muted)]">مفيش مصروفات في الفترة</div>}</div>
    </Card>
    <Fixed d={d} reload={reload} avgOpex={avgOpex} />
    <Card title="قيود المصروفات والإيرادات من دفترة">
      <Table rows={d.entries} rowKey={r => `${r.kind}${r.id}`} search={r => `${r.note} ${r.vendor} ${r.account}`} initialSort={["date", -1]} max={50} cols={[
        { key: "date", label: "التاريخ" }, { key: "note", label: "البيان", className: "max-w-72 truncate text-right", render: r => r.note || r.vendor || "—" },
        { key: "account", label: "الحساب", className: "text-right text-[var(--muted)]" },
        { key: "amount", label: "المبلغ", render: r => <b className={r.kind === "income" ? "text-emerald-700" : ""}>{r.kind === "income" ? "+" : ""}{sar(r.amount)}</b> },
        { key: "treatment", label: "التصنيف", render: r => <Pill text={(TREAT[r.treatment] || TREAT.exclude)[0]} cls={(TREAT[r.treatment] || TREAT.exclude)[1]} /> },
      ]} />
    </Card>
  </div>;
}

function Fixed({ d, reload, avgOpex }: { d: FinData; reload: () => void; avgOpex: number }) {
  const toast = useToast();
  const thisMonth = d.today.slice(0, 7);
  const blank = { id: "", name: "", category: "salaries", monthly_amount: "", start_month: thisMonth, end_month: "", notes: "" };
  const [form, setForm] = useState<typeof blank | null>(null);
  const save = async () => {
    if (!form) return;
    const r = await fetch("/api/admin/finance/fixed", { method: form.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const j = await r.json().catch(() => null); if (!r.ok) { toast(j?.error || "تعذر الحفظ", "error"); return; }
    toast("اتحفظ", "success"); setForm(null); reload();
  };
  const del = async (id: string) => { if (!window.confirm("حذف البند ده؟")) return; const r = await fetch(`/api/admin/finance/fixed?id=${id}`, { method: "DELETE" }); if (r.ok) { toast("اتحذف", "success"); reload(); } };
  return <Card title="المصروفات الثابتة الشهرية" hint="المصاريف اللي بتدفعها كل شهر مهما كانت المبيعات (إيجار، رواتب، اشتراكات…). المستشار المالي بيستخدمها عشان يحسب نقطة التعادل وهدف المبيعات. بتتحفظ في الـ CRM بس."
    right={<button type="button" onClick={() => setForm(blank)} className="flex items-center gap-1 rounded-xl bg-[var(--navy)] px-3 py-1.5 text-xs font-bold text-white"><Icon name="new-visit" size={14} />إضافة بند</button>}>
    <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-[var(--sky-light)] p-3"><div className="text-[11px] font-bold text-[var(--muted)]">إجمالي الثابت شهرياً</div><div className="text-lg font-extrabold text-[var(--navy)]">{sar(d.fixed_monthly)}</div></div>
      <div className="rounded-xl bg-[var(--bg)] p-3"><div className="text-[11px] font-bold text-[var(--muted)]">متوسط المصروف الفعلي (دفترة)</div><div className="text-lg font-extrabold">{sar(avgOpex)}</div></div>
      {d.fixed_monthly > 0 && avgOpex > 0 && <div className="col-span-2 rounded-xl bg-[var(--bg)] p-3 text-[12px] leading-5 sm:col-span-1">{avgOpex > d.fixed_monthly * 1.1 ? `الفعلي أعلى من المخطط بـ ${sar(avgOpex - d.fixed_monthly)} — فيه مصاريف متغيرة أو بنود ناقصة.` : "الفعلي قريب من المخطط 👍"}</div>}
    </div>
    {form && <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl border-2 border-[var(--sky-border)] bg-[var(--sky-light)] p-3 sm:grid-cols-6">
      <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثلاً: إيجار المكتب" className="col-span-2 rounded-lg border border-[var(--border)] px-2 py-2 text-sm" />
      <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="rounded-lg border border-[var(--border)] px-2 py-2 text-sm">{Object.entries(FCAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <input inputMode="decimal" value={form.monthly_amount} onChange={e => setForm({ ...form, monthly_amount: e.target.value.replace(/[^\d.]/g, "") })} placeholder="المبلغ شهرياً" className="rounded-lg border border-[var(--border)] px-2 py-2 text-sm" />
      <label className="text-[11px] font-bold text-[var(--muted)]">من<input type="month" value={form.start_month} onChange={e => setForm({ ...form, start_month: e.target.value })} className="mt-0.5 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm" /></label>
      <label className="text-[11px] font-bold text-[var(--muted)]">إلى (اختياري)<input type="month" value={form.end_month} onChange={e => setForm({ ...form, end_month: e.target.value })} className="mt-0.5 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm" /></label>
      <div className="col-span-2 flex gap-2 sm:col-span-6"><button type="button" onClick={() => void save()} className="rounded-lg bg-[var(--navy)] px-4 py-2 text-xs font-bold text-white">حفظ</button><button type="button" onClick={() => setForm(null)} className="rounded-lg px-4 py-2 text-xs font-bold">إلغاء</button></div>
    </div>}
    <div className="divide-y divide-[var(--border)]">{d.fixed.map(f => <div key={f.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
      <div className="min-w-0 flex-1"><b>{f.name}</b> <span className="text-[11px] text-[var(--muted)]">· {FCAT[f.category] || f.category} · من {f.start_month.slice(0, 7)}{f.end_month ? ` إلى ${f.end_month.slice(0, 7)}` : ""}</span></div>
      <b>{sar(f.monthly_amount)}</b>
      <button type="button" onClick={() => setForm({ id: f.id, name: f.name, category: f.category, monthly_amount: String(f.monthly_amount), start_month: f.start_month.slice(0, 7), end_month: f.end_month ? f.end_month.slice(0, 7) : "", notes: f.notes })} className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--sky-deep)] hover:bg-[var(--bg)]">تعديل</button>
      <button type="button" onClick={() => void del(f.id)} className="rounded-lg px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-50">حذف</button></div>)}
      {!d.fixed.length && !form && <div className="py-6 text-center text-sm text-[var(--muted)]">لسه ما ضفتش مصروفات ثابتة — ضيفها عشان المستشار يحسب هدف المبيعات بدقة. لحد ما تضيفها، بنستخدم متوسط مصروفاتك الفعلية من دفترة.</div>}</div>
  </Card>;
}

/* ═══════════════ المستشار المالي ═══════════════ */
const IDEAS: Array<[string, string, string]> = [
  ["ربط عملاء دفترة بعيادات الـ CRM", "كل فاتورة في دفترة تتنسب للمندوب صاحب العيادة → مبيعات وربحية كل مندوب فعلية، وعمولة على المحصّل مش على المبيعات.", "reps"],
  ["أهداف المناديب من هدف الشركة", "هدف المبيعات المقترح هنا يتوزع تلقائياً على المناديب حسب حصة كل واحد — بدل ما الهدف يتحط بالتخمين.", "coverage"],
  ["حماية سعر البيع", "لو مندوب سجّل توقع أو طلب بسعر أقل من سعر التعادل، يطلع له تنبيه ويحتاج موافقتك.", "warn"],
  ["تنبيهات التحصيل للمناديب", "كل مندوب يشوف في صفحته فواتير عملائه المتأخرة أكتر من 60 يوم، ويسجل متابعة التحصيل في الزيارة.", "time"],
  ["مصروفات المناديب في الربحية", "مصروفات المناديب المعتمدة في الـ CRM تتحسب على ربحية كل مندوب وعميل، من غير ما تتكرر مع دفترة.", "wallet"],
  ["تنبيه المخزون", "منتج رصيده قرب يخلص وعليه توقعات بيع عالية من المناديب → تنبيه تطلب من المورد بدري.", "products"],
];
export function Advisor({ d, go, x, reload }: { d: FinData; go: (t: Tab) => void; x: X; reload: () => void }) {
  const toast = useToast(); const B = d.baseline;
  const [nm, setNm] = useState(d.settings.target_net_margin);
  const [fixed, setFixed] = useState(d.plan.monthly_fixed);
  const [gm, setGm] = useState(d.plan.gm);
  const g = gm / 100, n = nm / 100;
  const be = g > 0 ? fixed / g : null, target = g > n ? fixed / (g - n) : null;
  const cur = B?.sales || 0, allowed = Math.max(0, cur * (g - n));
  const max = Math.max(cur, target || 0, be || 0) * 1.1 || 1;
  async function saveTarget() { const r = await fetch("/api/admin/finance/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ target_gross_margin: d.settings.target_gross_margin, target_net_margin: nm }) }); const j = await r.json().catch(() => null); if (r.ok) { toast("اتحفظ هدف صافي الربح", "success"); reload(); } else toast(j?.error || "تعذر الحفظ", "error"); }
  return <div className="space-y-4">
    <Card title="هدف المبيعات والمصاريف المسموحة" hint="الأرقام مبنية على متوسط آخر 6 شهور كاملة. حرّك المؤشرات وشوف النتيجة فوراً." right={<ExcelBtn href={x("advisor")} label="تقرير التخطيط Excel" />}>
      {!B ? <div className="text-sm text-[var(--muted)]">محتاج بيانات 6 شهور على الأقل.</div> : <>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <label className="block"><div className="flex justify-between text-xs font-bold"><span>صافي الربح اللي عايزه</span><b className="text-[var(--navy)]">{nm}%</b></div><input type="range" min={0} max={35} value={nm} onChange={e => setNm(Number(e.target.value))} className="mt-2 w-full accent-[var(--sky)]" /></label>
          <label className="block"><div className="flex justify-between text-xs font-bold"><span>المصاريف الثابتة شهرياً<Hint text={d.plan.fixed_source === "planned" ? "من المصروفات الثابتة اللي ضفتها في تبويب الأرباح." : "متوسط مصروفاتك الفعلية من دفترة — ضيف مصروفاتك الثابتة في تبويب الأرباح لدقة أكبر."} /></span><b className="text-[var(--navy)]">{sar(fixed)}</b></div><input type="range" min={0} max={Math.max(50000, d.plan.monthly_fixed * 2)} step={500} value={fixed} onChange={e => setFixed(Number(e.target.value))} className="mt-2 w-full accent-[var(--sky)]" /></label>
          <label className="block"><div className="flex justify-between text-xs font-bold"><span>هامش مجمل الربح<Hint text="نسبة اللي بيفضل من كل ريال مبيعات بعد تكلفة البضاعة. لو رفعت أسعارك أو جبت تكلفة أقل، بيزيد." /></span><b className="text-[var(--navy)]">{gm.toFixed(1)}%</b></div><input type="range" min={5} max={85} step={0.5} value={gm} onChange={e => setGm(Number(e.target.value))} className="mt-2 w-full accent-[var(--sky)]" /></label>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="نقطة التعادل الشهرية" value={sar(be)} sub="أقل مبيعات من غير خسارة" icon="coverage" color={C.amber} hint="لو بعت أقل من الرقم ده في الشهر، الشركة بتخسر." />
          <Kpi label="هدف المبيعات الشهري" value={sar(target)} sub={target && cur ? (target > cur ? `محتاج +${Math.round((target / cur - 1) * 100)}% عن متوسطك` : "متوسطك الحالي محقق الهدف ✓") : ""} icon="trophy" color={C.green} />
          <Kpi label="هدف المبيعات السنوي" value={sar(target ? target * 12 : null)} sub={`لصافي ربح ${nm}%`} icon="calendar" color={C.teal} />
          <Kpi label="المصاريف المسموحة شهرياً" value={sar(allowed)} sub={`على متوسط مبيعاتك ${sar(cur)}`} icon="wallet" color={C.orange} tone={B.opex > allowed ? "bad" : "good"} hint="أقصى مصاريف تشغيل تقدر تصرفها في الشهر على مستوى مبيعاتك الحالي وتحقق صافي الربح اللي اخترته." />
        </div>
        <div className="mt-5 space-y-3">{([["متوسط مبيعاتك", cur, C.blue], ["نقطة التعادل", be || 0, C.amber], ["الهدف", target || 0, C.green]] as const).map(([l, v, c]) => <div key={l}><div className="mb-1 flex justify-between text-xs"><span className="font-bold">{l}</span><b>{sar(v)}</b></div><div className="h-3 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${v / max * 100}%`, background: c }} /></div></div>)}</div>
        <div className="mt-4 rounded-2xl bg-[var(--sky-light)] p-4 text-[13px] leading-7">
          <b>الخلاصة:</b> متوسط مبيعاتك {sar(cur)} ومصاريفك الفعلية {sar(B.opex)} في الشهر، وصافي ربحك {sar(B.net)} ({cur ? pct(B.net / cur * 100) : "—"}).
          {target !== null && (target > cur ? <> عشان توصل لصافي ربح {nm}% محتاج تبيع <b>{sar(target)}</b> شهرياً (زيادة {sar(target - cur)})، <b>أو</b> تنزّل مصاريفك لـ <b>{sar(allowed)}</b> (توفير {sar(Math.max(0, B.opex - allowed))})، أو مزيج من الاتنين — زي إنك ترفع الأسعار شوية فهامش مجمل الربح يزيد.</> : <> أنت فوق هدفك — حافظ على المصاريف تحت <b>{sar(allowed)}</b> واستثمر الفايض في مناديب أو منتجات جديدة.</>)}
          {nm !== d.settings.target_net_margin && <button type="button" onClick={() => void saveTarget()} className="mr-2 rounded-lg bg-[var(--navy)] px-3 py-1 text-xs font-bold text-white">احفظ {nm}% كهدف</button>}
        </div>
      </>}
    </Card>
    <Card title={`التوصيات (${d.advice.length})`}><div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{d.advice.map((a, i) => <AdviceCard key={i} a={a} go={go} />)}</div></Card>
    <Card title="إزاي الصفحة دي تتكامل مع باقي السستم" hint="اقتراحات — اختار اللي يناسبك وأنفذه."><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{IDEAS.map(([t, s, i]) => <div key={t} className="rounded-2xl border border-[var(--border)] p-4"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--sky-soft)] text-[var(--navy)]"><Icon name={i} size={18} /></span><b className="mt-2 block text-sm">{t}</b><p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">{s}</p></div>)}</div></Card>
  </div>;
}
