"use client";
import { useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import type { AccData } from "./AccountsHub";
import { sar, num, pct, mLabel, C, Card, ExcelBtn, MonthChart, Table, Pill } from "../daftra-sales/kit";
import { FixedCosts } from "../daftra-sales/fixed";
import { PriceCalc, maxDiscount } from "./pricecalc";
import { GuardAndStock } from "./guardstock";
import { Tile } from "./summary";

type X = (s: string) => string;
type FinData = AccData;
type Mo = { m: string; sales: number; cogs: number; gross: number; opex: number; other: number; net: number; purchases: number; collected: number; vat_out: number; vat_in: number };
const months = (d: AccData) => d.monthly as unknown as Mo[];
const TREAT: Record<string, [string, string]> = { opex: ["مصروف تشغيلي", "bg-orange-50 text-orange-700 ring-orange-200"], cogs: ["تكلفة مبيعات", "bg-sky-50 text-sky-700 ring-sky-200"], exclude: ["مش مصروف", "bg-slate-100 text-slate-600 ring-slate-200"], other_income: ["إيراد آخر", "bg-emerald-50 text-emerald-700 ring-emerald-200"] };

/* ═══════════════ المصروفات ═══════════════ */
export function Expenses({ d, reload, pickMonth }: { d: AccData; reload: () => void; pickMonth: (m: string) => void }) {
  const toast = useToast();
  const setTreat = async (account_id: number | null, treatment: string | null) => {
    if (!account_id) { toast("القيود دي ملهاش حساب في دفترة", "error"); return; }
    const r = await fetch("/api/admin/finance/overrides", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ account_id, treatment }) });
    if (r.ok) { toast("اتغير التصنيف — في البرنامج بس، مش في دفترة", "success"); reload(); } else toast("تعذر الحفظ", "error");
  };
  const k = d.kpi, avg = d.baseline?.opex || 0;
  const counted = d.expensesByAccount.filter(a => a.treatment !== "exclude"), total = counted.reduce((s, a) => s + a.amount, 0);
  const excluded = d.expensesByAccount.filter(a => a.treatment === "exclude").reduce((s, a) => s + a.amount, 0);
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="المصروفات التشغيلية" value={sar(k.opex)} sub={k.sales ? `${pct(k.opex / k.sales * 100)} من المبيعات` : "—"} />
      <Tile label="متوسط المصروف الشهري" value={sar(avg)} sub="من بداية الحسابات (شهور مقفولة)" />
      <Tile label="منها تسويق وفعاليات" value={sar(k.marketing)} sub={k.sales ? `${pct(k.marketing / k.sales * 100)} من المبيعات` : "—"} />
      <Tile label="مستبعد (مش مصروف)" value={sar(excluded)} sub="خزينة، جاري شريك، ضريبة، عُهد…" />
    </div>
    <Card title="المصروفات شهر بشهر" hint="اضغط على أي شهر عشان تشوف قيوده.">
      <MonthChart data={months(d)} series={[{ key: "opex", label: "مصروفات تشغيلية", color: C.orange }]} onPick={pickMonth} height={150} />
    </Card>
    <Card title="المصروفات حسب الحساب" hint="بنصنف كل مصروف حسب حسابه في دليل حسابات دفترة: 5xxx مصروف تشغيلي، 51xx تكلفة مبيعات، وأي حاجة تانية مش مصروف. تقدر تغيّر التصنيف — بيتحفظ في البرنامج بس.">
      <div className="space-y-1.5">{d.expensesByAccount.map(a => { const share = a.treatment !== "exclude" && total ? a.amount / total * 100 : 0; return <div key={String(a.account_id)} className="rounded-xl border border-[var(--border)] p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1"><b className="text-sm">{a.name}</b> <span className="text-[11px] text-[var(--muted)]" dir="ltr">{a.code}</span><span className="text-[11px] text-[var(--muted)]"> · {a.n} قيد{share ? ` · ${pct(share)}` : ""}</span></div>
          <b className={`tabular-nums ${a.treatment === "exclude" ? "text-[var(--muted)] line-through" : ""}`}>{sar(a.amount)}</b>
          <select value={a.treatment} onChange={e => void setTreat(a.account_id, e.target.value)} aria-label={`تصنيف ${a.name}`} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"><option value="opex">مصروف تشغيلي</option><option value="cogs">تكلفة مبيعات</option><option value="exclude">مش مصروف (استبعاد)</option></select>
        </div>
        {share > 0 && <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full bg-orange-400" style={{ width: `${share}%` }} /></div>}
      </div>; })}{!d.expensesByAccount.length && <div className="py-4 text-center text-sm text-[var(--muted)]">مفيش مصروفات في الفترة</div>}</div>
    </Card>
    <FixedCosts fixed={d.fixed} today={d.today} reload={reload} />
    <Card title="قيود المصروفات والإيرادات من دفترة">
      <Table rows={d.entries} rowKey={r => `${r.kind}${r.id}`} search={r => `${r.note} ${r.vendor} ${r.account}`} initialSort={["date", -1]} max={80} cols={[
        { key: "date", label: "التاريخ" }, { key: "note", label: "البيان", className: "max-w-72 truncate text-right", render: r => r.note || r.vendor || "—" },
        { key: "account", label: "الحساب", className: "text-right text-[var(--muted)]" },
        { key: "amount", label: "المبلغ", render: r => <b className={`tabular-nums ${r.kind === "income" ? "text-emerald-700" : ""}`}>{r.kind === "income" ? "+" : ""}{sar(r.amount)}</b> },
        { key: "treatment", label: "التصنيف", render: r => <Pill text={(TREAT[r.treatment] || TREAT.exclude)[0]} cls={(TREAT[r.treatment] || TREAT.exclude)[1]} /> },
      ]} />
    </Card>
  </div>;
}

/* ═══════════════ الأرباح والخسائر ═══════════════ */
export function Pnl({ d, pickMonth }: { d: AccData; pickMonth: (m: string) => void }) {
  const ms = months(d);
  const tot = ms.reduce((s, m) => ({ sales: s.sales + m.sales, cogs: s.cogs + m.cogs, gross: s.gross + m.gross, opex: s.opex + m.opex, other: s.other + m.other, net: s.net + m.net }), { sales: 0, cogs: 0, gross: 0, opex: 0, other: 0, net: 0 });
  type Row = { label: string; v: (m: Pick<Mo, "sales" | "cogs" | "gross" | "opex" | "other" | "net">) => number | null; pctRow?: boolean; strong?: boolean; tone?: boolean; minus?: boolean };
  const R: Row[] = [
    { label: "المبيعات (قبل الضريبة)", v: m => m.sales, strong: true },
    { label: "تكلفة البضاعة المباعة", v: m => m.cogs, minus: true },
    { label: "مجمل الربح", v: m => m.gross, strong: true },
    { label: "هامش مجمل الربح", v: m => m.sales ? m.gross / m.sales * 100 : null, pctRow: true },
    { label: "المصروفات التشغيلية", v: m => m.opex, minus: true },
    { label: "إيرادات أخرى", v: m => m.other },
    { label: "صافي الربح", v: m => m.net, strong: true, tone: true },
    { label: "هامش صافي الربح", v: m => m.sales ? m.net / m.sales * 100 : null, pctRow: true },
  ];
  const cell = (r: Row, v: number | null) => v === null ? "—" : r.pctRow ? pct(v) : `${r.minus && v ? "(" : ""}${num(v)}${r.minus && v ? ")" : ""}`;
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="صافي المبيعات" value={sar(d.kpi.sales)} sub={`${d.kpi.invoices} فاتورة`} />
      <Tile label="مجمل الربح" value={sar(d.kpi.gross)} sub={`هامش ${pct(d.kpi.gross_margin)}`} />
      <Tile label="صافي الربح" value={sar(d.kpi.net)} tone={d.kpi.net < 0 ? "bad" : undefined} sub={`هامش ${pct(d.kpi.net_margin)}`} />
      <Tile label="الربح قبل التسويق" value={sar(d.kpi.net_before_marketing)} sub={`التسويق أخد ${sar(d.kpi.marketing)}`} />
    </div>
    {d.kpi.cost_coverage < 95 && <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">تكلفة {Math.round(d.kpi.cost_coverage)}% بس من المبيعات معروفة من فواتير الشراء — الأصناف اللي ملهاش تكلفة بتتحسب كأن تكلفتها صفر، فالربح هنا أعلى من الحقيقي. شوف «المنتجات والأسعار ← بدون تكلفة».</div>}
    <Card title="قائمة الدخل" hint="الأرقام قبل الضريبة. اضغط على اسم أي شهر عشان تختار الشهر ده بس.">
      <div className="-mx-4 overflow-x-auto px-4"><table className="w-full min-w-[640px] text-[13px] tabular-nums">
        <thead><tr className="border-b border-[var(--border)] text-xs text-[var(--muted)]"><th className="sticky right-0 bg-[var(--card)] p-2.5 text-right">البند</th>
          {ms.map(m => <th key={m.m} className="p-2.5"><button type="button" onClick={() => pickMonth(m.m)} className="font-bold hover:text-[var(--navy)] hover:underline">{mLabel(m.m, true)}</button></th>)}
          {ms.length > 1 && <th className="bg-[var(--sky-light)] p-2.5 font-extrabold text-[var(--ink)]">الإجمالي</th>}</tr></thead>
        <tbody>{R.map(r => <tr key={r.label} className={`border-b border-[var(--border)] ${r.strong ? "font-extrabold" : ""} ${r.pctRow ? "text-[12px] text-[var(--muted)]" : ""}`}>
          <td className="sticky right-0 bg-[var(--card)] p-2.5 text-right">{r.label}</td>
          {ms.map(m => { const v = r.v(m); return <td key={m.m} className={`p-2.5 text-center ${r.tone && v !== null ? v < 0 ? "text-red-700" : "text-emerald-700" : ""}`}>{cell(r, v)}</td>; })}
          {ms.length > 1 && (() => { const v = r.v(tot); return <td className={`bg-[var(--sky-light)] p-2.5 text-center ${r.tone && v !== null ? v < 0 ? "text-red-700" : "text-emerald-700" : ""}`}>{cell(r, v)}</td>; })()}
        </tr>)}</tbody></table></div>
      <div className="mt-2 text-[11px] text-[var(--muted)]">الأرقام بين القوسين بتتطرح. الريال السعودي.</div>
    </Card>
    <Card title="شكل الشهور"><MonthChart data={ms} series={[{ key: "gross", label: "مجمل ربح", color: C.teal }, { key: "opex", label: "مصروفات", color: C.orange }, { key: "net", label: "صافي ربح", color: C.green }]} onPick={pickMonth} height={170} /></Card>
  </div>;
}

/* ═══════════════ الضريبة ═══════════════ */
export function Vat({ d }: { d: AccData }) {
  const ms = months(d), k = d.kpi;
  return <div className="space-y-4">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Tile label="ضريبة المبيعات (المخرجات)" value={sar(k.vat_out)} sub="اللي حصّلتها من العملاء" />
      <Tile label="ضريبة المشتريات والمصروفات (المدخلات)" value={sar(k.vat_in)} sub="اللي دفعتها للموردين" />
      <Tile label="الصافي المستحق (تقديري)" value={sar(k.vat_payable)} tone={k.vat_payable > 0 ? "warn" : "good"} sub={k.vat_payable > 0 ? "المفروض تسدده للهيئة" : "ليك استرداد"} />
    </div>
    <Card title="الضريبة شهر بشهر" hint="تقدير من فواتير دفترة قبل أي تسويات في الإقرار. المصروفات المستبعدة مش محسوب ضريبتها.">
      <div className="-mx-4 overflow-x-auto px-4"><table className="w-full min-w-[520px] text-[13px] tabular-nums">
        <thead className="bg-[var(--sky-light)] text-xs text-[var(--muted)]"><tr><th className="p-2.5 text-right">الشهر</th><th className="p-2.5">المخرجات</th><th className="p-2.5">المدخلات</th><th className="p-2.5">الصافي</th></tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{ms.map(m => { const n = m.vat_out - m.vat_in; return <tr key={m.m}><td className="p-2.5 font-bold">{mLabel(m.m, true)}</td><td className="p-2.5 text-center">{sar(m.vat_out)}</td><td className="p-2.5 text-center">{sar(m.vat_in)}</td><td className={`p-2.5 text-center font-extrabold ${n > 0 ? "text-amber-700" : "text-emerald-700"}`}>{sar(n)}</td></tr>; })}</tbody>
      </table></div>
    </Card>
  </div>;
}

/* ═══════════════ المنتجات والأسعار ═══════════════ */
const PSTAT: Record<string, [string, string]> = { loss: ["بيُباع بخسارة", "bg-red-50 text-red-700 ring-red-200"], below_breakeven: ["ما يغطيش المصاريف", "bg-orange-50 text-orange-700 ring-orange-200"], thin: ["هامش ضعيف", "bg-amber-50 text-amber-800 ring-amber-200"], healthy: ["هامش كويس", "bg-emerald-50 text-emerald-700 ring-emerald-200"], no_cost: ["بدون تكلفة", "bg-slate-100 text-slate-600 ring-slate-200"], dead_stock: ["مخزون راكد", "bg-violet-50 text-violet-700 ring-violet-200"], no_sales: ["بدون مبيعات", "bg-slate-50 text-slate-500 ring-slate-200"] };
export function Products({ d, x, reload, subdomain }: { d: FinData; x: X; reload: () => void; subdomain: string }) {
  const toast = useToast();
  const [gm, setGm] = useState(d.settings.target_gross_margin); const [nm, setNm] = useState(d.settings.target_net_margin);
  const [f, setF] = useState<string | null>(null);
  const opexRatio = d.baseline && d.baseline.sales > 0 ? Math.min(0.6, d.baseline.opex / d.baseline.sales) : 0;
  // full-cost pricing breaks down when overheads are a huge share of sales — cap it and say why
  const rawNeeded = opexRatio + nm / 100, needed = Math.max(gm / 100, Math.min(rawNeeded, 0.7));
  const rows = useMemo(() => d.pricing.map(p => ({ ...p, live: p.avg_cost === null ? null : Math.round(p.avg_cost / Math.max(0.1, 1 - needed) * 100) / 100 })), [d.pricing, needed]);
  const counts = rows.reduce<Record<string, number>>((m, p) => { m[p.status] = (m[p.status] || 0) + 1; return m; }, {});
  const shown = f ? rows.filter(p => p.status === f) : rows;
  const stockValue = rows.reduce((s, p) => s + (p.stock_value || 0), 0);
  async function save() { const r = await fetch("/api/admin/finance/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ target_gross_margin: gm, target_net_margin: nm }) }); const j = await r.json().catch(() => null); if (!r.ok) toast(j?.error || "تعذر الحفظ", "error"); else { toast("اتحفظت الأهداف", "success"); reload(); } }
  return <div className="space-y-4">
    <Card title="معادلة التسعير" hint="سعر التعادل = التكلفة ÷ (1 − نسبة المصاريف). السعر المقترح = التكلفة ÷ (1 − الهامش المطلوب). الأسعار كلها قبل الضريبة.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <label className="block"><div className="flex justify-between text-xs font-bold"><span>هامش مجمل الربح المستهدف</span><b className="text-[var(--navy)]">{gm}%</b></div><input type="range" min={10} max={80} value={gm} onChange={e => setGm(Number(e.target.value))} className="mt-2 w-full accent-[var(--sky)]" /><div className="text-[11px] text-[var(--muted)]">في التوزيع الطبي والتجميلي، 40–60% طبيعي.</div></label>
        <label className="block"><div className="flex justify-between text-xs font-bold"><span>صافي الربح المستهدف</span><b className="text-[var(--navy)]">{nm}%</b></div><input type="range" min={0} max={40} value={nm} onChange={e => setNm(Number(e.target.value))} className="mt-2 w-full accent-[var(--sky)]" /><div className="text-[11px] text-[var(--muted)]">مصاريفك التشغيلية = {pct(opexRatio * 100)} من المبيعات (متوسط من بداية الحسابات).</div></label>
        <div className="rounded-2xl bg-[var(--sky-light)] p-3 text-[12.5px] leading-6"><div>عشان تحقق الهدفين، كل منتج لازم يتباع بـ <b>تكلفته × {(1 / Math.max(0.1, 1 - needed)).toFixed(2)}</b> على الأقل (هامش {Math.round(needed * 100)}%).</div>
          {rawNeeded > 0.7 && <div className="mt-1 text-[11.5px] text-amber-900">مصاريفك = {pct(opexRatio * 100)} من المبيعات، فلو حمّلتها كلها على السعر هتطلع أسعار مش منافسة. الحل الأساسي: زوّد حجم المبيعات أو قلّل المصاريف (شوف تبويب الأهداف) — وارفع الأسعار بس للمنتجات اللي هامشها تحت {gm}%.</div>}
          {(gm !== d.settings.target_gross_margin || nm !== d.settings.target_net_margin) && <button type="button" onClick={() => void save()} className="mt-2 rounded-xl bg-[var(--navy)] px-3 py-1.5 text-xs font-bold text-white">احفظ كأهداف ثابتة</button>}</div>
      </div>
    </Card>
    <PriceCalc d={d} needed={needed} opexRatio={opexRatio} />
    <GuardAndStock d={d} subdomain={subdomain} />
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
        { key: "maxdisc", label: "أقصى خصم", hint: "أكبر خصم المندوب يقدر يديه من سعر القائمة وانت لسه بتحقق الهامش المستهدف. الرقم الصغير تحته = أقصى خصم قبل ما تبيع بأقل من التكلفة.", value: r => maxDiscount(r.list_price, r.live), render: r => { const t = maxDiscount(r.list_price, r.live), l = maxDiscount(r.list_price, r.avg_cost); return t === null ? "—" : <span><b className={t <= 0 ? "text-red-700" : t < 10 ? "text-amber-700" : "text-emerald-700"}>{pct(t)}</b>{l !== null && <span className="block text-[10px] text-[var(--muted)]">خسارة بعد {pct(l)}</span>}</span>; } },
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
