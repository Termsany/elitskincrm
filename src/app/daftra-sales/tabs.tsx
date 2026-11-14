"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import type { Ask, FinData, Tab } from "./FinanceHub";
import { sar, num, pct, C, Kpi, Card, ExcelBtn, Bars, MonthChart, Table, Pill, STATUS_PAY, AGE } from "./kit";
import { ClientLinks } from "./guard";
import { BranchLinks } from "./branches";

type X = (s: string) => string;
const daftraUrl = (sub: string, id: number) => `https://${sub}.daftra.com/owner/invoices/view/${id}`;
/** Small "ask the advisor" button used next to a card title or a table row. */
function AskBtn({ onClick, label = "اسأل المستشار" }: { onClick: () => void; label?: string }) {
  return <button type="button" onClick={e => { e.stopPropagation(); onClick(); }} className="inline-flex items-center gap-1 rounded-lg bg-[var(--sky-light)] px-2.5 py-1.5 text-[11.5px] font-bold text-[var(--navy)] transition hover:bg-[var(--sky-soft)]"><Icon name="sparkle" size={12} />{label}</button>;
}

/* ═══════════════ المبيعات ═══════════════ */
export function Sales({ d, pickMonth, x, subdomain, ask, go }: { d: FinData; pickMonth: (m: string) => void; x: X; subdomain: string; ask: Ask; go: (t: Tab) => void }) {
  const k = d.kpi;
  const [prodSort, setProdSort] = useState<"net" | "gross">("net");
  const products = [...d.salesByProduct].sort((a, b) => b[prodSort] - a[prodSort]).slice(0, 12);
  const L = d.link || null;
  const gap = L?.goals && L.goals.month_target > L.sales.mtd ? L.goals.month_target - L.sales.mtd : 0;
  return <div className="space-y-4">
    {L && (gap > 0 || L.ar.overdue > 0) && <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-white p-3 text-[13px] font-bold">
      {gap > 0 && <button type="button" onClick={() => go("goals")} className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200 transition hover:bg-amber-100">باقي {sar(gap)} على هدف الشهر ‹</button>}
      {L.ar.overdue > 0 && <button type="button" onClick={() => go("ar")} className="rounded-xl bg-red-50 px-3 py-2 text-red-800 ring-1 ring-red-200 transition hover:bg-red-100">{sar(L.ar.overdue)} متأخر عند العملاء ‹</button>}
      {gap > 0 && <span className="mr-auto"><AskBtn label="إزاي أقفل الفرق؟" onClick={() => ask(`باقي ${Math.round(gap).toLocaleString("en-US")} ريال على هدف الشهر. قولّي أقفلهم إزاي: أنهي عملاء أزورهم أو أكلمهم، وأنهي منتجات أدفعها، وكام من المتأخر عند العملاء أقدر أحصّله.`)} /></span>}
    </div>}
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
        <Bars onPick={name => { const p = d.salesByProduct.find(x => x.name === name); if (p) ask(`حلّل لي منتج «${name}»: بعت منه ${p.qty} وحدة بـ ${Math.round(p.net).toLocaleString("en-US")} ريال وهامشه ${p.margin ?? "غير معروف"}%. أزوّد مبيعاته إزاي، ولمين، وهل سعره مناسب؟`); }} rows={products.map(p => ({ label: p.name, value: p[prodSort], sub: `${num(p.qty)} وحدة · ${prodSort === "net" ? `ربح ${sar(p.gross)}` : `مبيعات ${sar(p.net)}`} · هامش ${pct(p.margin)}` }))} color={prodSort === "net" ? C.mint : C.teal} />
      </Card>
      <Card title="أكبر العملاء">
        <Bars onPick={name => { const c = d.salesByClient.find(x => x.name === name); if (c) ask(`حلّل لي العميل «${name}»: اشترى بـ ${Math.round(c.net).toLocaleString("en-US")} ريال (${c.share}% من مبيعاتي) وآخر فاتورة ${c.last}. عليه مديونية؟ وأزوّد مبيعاتي له إزاي؟`); }} rows={d.salesByClient.slice(0, 12).map(c => ({ label: c.name, value: c.net, sub: `${c.share}% من مبيعاتك · ${c.n} فاتورة · آخر فاتورة ${c.last}` }))} color={C.blue} />
      </Card>
    </div>
    <Card title="فواتير البيع">
      <Table rows={d.sales} rowKey={r => String(r.id)} search={r => `${r.no} ${r.party} ${r.branch}`} initialSort={["date", -1]} cols={[
        { key: "no", label: "رقم", className: "text-right", render: r => <a href={daftraUrl(subdomain, r.id)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="font-bold text-[var(--gold)] hover:underline" dir="ltr">{r.no}</a> },
        { key: "date", label: "التاريخ" }, { key: "party", label: "العميل", className: "max-w-64 truncate text-right" },
        { key: "net", label: "الصافي", render: r => <b>{sar(r.net)}</b> }, { key: "total", label: "شامل الضريبة", render: r => sar(r.total) },
        { key: "unpaid", label: "المتبقي", render: r => r.unpaid > 0 && r.status !== 3 ? <span className="font-bold text-orange-700">{sar(r.unpaid)}</span> : "—" },
        { key: "status", label: "الحالة", render: r => { const [t, c] = STATUS_PAY[r.status] || STATUS_PAY[0]; return <Pill text={t} cls={c} />; } },
      ]} />
    </Card>
  </div>;
}

/* ═══════════════ مديونيات العملاء ═══════════════ */
export function Book({ d, subdomain, ask }: { d: FinData; subdomain: string; ask: Ask }) {
  const b = d.ar; const [bk, setBk] = useState<string | null>(null);
  const old = (b.buckets["61-90"] || 0) + (b.buckets["90+"] || 0);
  const dso = d.baseline && d.baseline.sales_gross > 0 ? d.kpi.ar / d.baseline.sales_gross * 30 : null;
  const parties = bk ? b.parties.filter(p => p.b[bk] > 0) : b.parties;
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="إجمالي ليا عند العملاء" value={sar(b.total)} sub={`${b.parties.length} عميل · ${b.open.length} فاتورة`} icon="time" color={C.amber} hint="الرقم شامل الضريبة وحتى النهارده — مش مرتبط بالفترة اللي فوق." />
      <Kpi label="فات ميعاده" value={sar(b.overdue)} sub={b.total ? `${Math.round(b.overdue / b.total * 100)}% من الإجمالي` : ""} icon="flag" color={C.red} tone={b.overdue > 0 ? "bad" : undefined} />
      <Kpi label="أقدم من 60 يوم" value={sar(old)} sub="أخطر ديون — احتمال التحصيل بيقل" icon="warn" color="#7f151c" />
      <Kpi label="متوسط مدة التحصيل" value={dso === null ? "—" : `${Math.round(dso)} يوم`} sub="الطبيعي 45–60 يوم" icon="calendar" color={C.blue} hint="بتاخد كام يوم في المتوسط لحد ما تحصّل فلوس الفاتورة (DSO). كل ما قل كان أحسن للسيولة." />
    </div>
    <Card title="أعمار الديون" hint="بنقسم الفلوس حسب عدد الأيام اللي فاتت بعد ميعاد الاستحقاق. اضغط على أي فترة عشان تفلتر." right={<AskBtn label="خطة تحصيل الأسبوع" onClick={() => ask("اعمل لي خطة تحصيل للأسبوع ده: رتّب العملاء حسب الأولوية (المبلغ وعمر الدين)، وقولّي أقول لكل واحد إيه، ومين أوقف له البيع الآجل. واربطها بمصاريف خطة الشهر وهدف الشهر.")} />}>
      <div className="mb-3 flex h-4 overflow-hidden rounded-full bg-[var(--bg)]">{AGE.map(([k, , c]) => b.buckets[k] ? <button type="button" key={k} onClick={() => setBk(bk === k ? null : k)} title={sar(b.buckets[k])} style={{ width: `${b.buckets[k] / (b.total || 1) * 100}%`, background: c, opacity: bk && bk !== k ? 0.3 : 1 }} /> : null)}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{AGE.map(([k, l, c]) => <button type="button" key={k} onClick={() => setBk(bk === k ? null : k)} className={`rounded-xl border p-2.5 text-right transition ${bk === k ? "border-[var(--navy)] bg-[var(--sky-light)]" : "border-[var(--border)] hover:bg-[var(--bg)]"}`}><div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted)]"><i className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</div><div className="mt-1 font-extrabold">{sar(b.buckets[k])}</div></button>)}</div>
    </Card>
    <ClientLinks />
    <BranchLinks />
    <Card title={`العملاء${bk ? ` — ${AGE.find(a => a[0] === bk)?.[1]}` : ""}`} right={bk && <button type="button" onClick={() => setBk(null)} className="text-xs font-bold text-[var(--sky-deep)]">إلغاء الفلتر</button>}>
      <Table rows={parties} rowKey={r => r.name} search={r => r.name} initialSort={["unpaid", -1]} empty="مفيش مستحقات 🎉" cols={[
        { key: "name", label: "العميل", className: "max-w-72 truncate text-right font-bold" },
        { key: "unpaid", label: "المتبقي", render: r => <b>{sar(r.unpaid)}</b> },
        { key: "overdue", label: "متأخر", render: r => r.overdue ? <span className="font-bold text-red-700">{sar(r.overdue)}</span> : "—" },
        { key: "oldestDue", label: "أقدم تأخير", render: r => r.oldestDue > 0 ? <span className={r.oldestDue > 60 ? "font-bold text-red-700" : ""}>{r.oldestDue} يوم</span> : "في الميعاد" },
        { key: "n", label: "فواتير" },
        { key: "ask", label: "", render: r => r.overdue > 0 ? <AskBtn label="إزاي أحصّل؟" onClick={() => ask(`العميل «${r.name}» عليه ${Math.round(r.unpaid).toLocaleString("en-US")} ريال، منهم ${Math.round(r.overdue).toLocaleString("en-US")} متأخر وأقدم تأخير ${r.oldestDue} يوم. اعمل لي خطة تحصيل له: أقول إيه، أعرض إيه، وأوقف البيع له ولا لأ؟ وبص على مشترياته عندي.`)} /> : null },
      ]} expand={r => <div className="space-y-1.5">{b.open.filter(o => o.party === r.name).map(o => <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs">
        <a href={daftraUrl(subdomain, o.id)} target="_blank" rel="noreferrer" className="font-bold text-[var(--gold)]" dir="ltr">{o.no}</a><span>فاتورة {o.date}</span><span>استحقاق {o.due}</span>
        <span className={o.days > 0 ? "font-bold text-red-700" : "text-emerald-700"}>{o.days > 0 ? `متأخرة ${o.days} يوم` : `باقي ${-o.days} يوم`}</span><b>{sar(o.unpaid)}</b></div>)}</div>} />
    </Card>
  </div>;
}

/* ═══════════════ المنتجات والتسعير ═══════════════ */
