"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import type { FinData } from "../daftra-sales/FinanceHub";
import { sar, num, C, Card, Pill } from "../daftra-sales/kit";

const daftraInv = (sub: string, id: number) => `https://${sub}.daftra.com/owner/invoices/view/${id}`;
const STOCK: Record<string, [string, string]> = { negative: ["رصيد بالسالب", "bg-red-600 text-white ring-red-600"], out: ["خلص", "bg-red-50 text-red-700 ring-red-200"], low: ["أقل من شهر", "bg-amber-50 text-amber-800 ring-amber-200"] };

/** Pricing tab: real Daftra sales below break-even (price protection) + products running out. */
export function GuardAndStock({ d, subdomain }: { d: FinData; subdomain: string }) {
  const g = d.price_guard; const [onlyCost, setOnlyCost] = useState(false); const [all, setAll] = useState(false);
  const lines = onlyCost ? g.lines.filter(l => l.below_cost) : g.lines;
  return <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
    <Card title="حماية سعر البيع" hint={`كل بيعة في دفترة سعرها أقل من «أقل سعر مسموح» = التكلفة ÷ (1 − ${g.floor_margin}% هامش مجمل ربح مستهدف — تقدر تغيّره من معادلة التسعير فوق). الأحمر = أقل من تكلفة الشراء نفسها (خسارة). للمراجعة بس — مفيش أي تعديل على دفترة.`}
      right={<div className="flex gap-1.5"><button type="button" onClick={() => setOnlyCost(false)} className={`rounded-full px-3 py-1 text-xs font-bold ${!onlyCost ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)]"}`}>الكل {g.lines.length}</button><button type="button" onClick={() => setOnlyCost(true)} className={`rounded-full px-3 py-1 text-xs font-bold ${onlyCost ? "bg-red-600 text-white" : "bg-red-50 text-red-700"}`}>أقل من التكلفة {g.below_cost}</button></div>}>
      {!g.lines.length ? <div className="rounded-2xl bg-emerald-50 p-6 text-center text-sm font-bold text-emerald-800">✓ كل المبيعات في الفترة دي فوق أقل سعر مسموح</div> : <>
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-red-50 p-2.5"><div className="text-[10.5px] font-bold text-red-700">أقل من التكلفة (خسارة فعلية)</div><div className="text-lg font-extrabold text-red-700">{g.below_cost}</div><div className="text-[10.5px] font-bold text-red-700">−{sar(g.real_loss)}</div></div>
          <div className="rounded-2xl bg-amber-50 p-2.5"><div className="text-[10.5px] font-bold text-amber-800">كسبانة بهامش أقل من {g.floor_margin}%</div><div className="text-lg font-extrabold text-amber-800">{g.below_breakeven}</div></div>
          <div className="rounded-2xl bg-[var(--bg)] p-2.5"><div className="text-[10.5px] font-bold text-[var(--muted)]">ربح فات عن السعر المستهدف</div><div className="text-lg font-extrabold text-[var(--navy)]">{sar(g.lost)}</div></div>
        </div>
        <div className="space-y-1.5">{(all ? lines : lines.slice(0, 8)).map((l, i) => <a key={`${l.id}-${i}`} href={daftraInv(subdomain, l.id)} target="_blank" rel="noreferrer" className={`block rounded-xl border-r-4 px-3 py-2 text-xs transition hover:-translate-x-0.5 ${l.below_cost ? "border-r-red-500 bg-red-50/60" : "border-r-amber-400 bg-amber-50/60"}`}>
          <div className="flex items-center justify-between gap-3"><b className="min-w-0 truncate text-[12.5px]" dir="auto">{l.item}</b><span className="shrink-0 font-bold text-red-700">−{sar(l.lost)}</span></div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[var(--muted)]"><span>اتباع <b className="text-[var(--ink)]">{num(l.price, 2)}</b> × {num(l.qty)}</span><span>أقل سعر {num(l.breakeven, 2)}</span><span className={l.below_cost ? "font-bold text-red-700" : ""}>التكلفة {num(l.cost, 2)}</span><span className="min-w-0 truncate" dir="auto">{l.party}</span><span>{l.date} · <span dir="ltr">#{l.no}</span></span></div></a>)}</div>
        {lines.length > 8 && <button type="button" onClick={() => setAll(!all)} className="mt-2 w-full rounded-xl bg-[var(--bg)] py-2 text-xs font-bold text-[var(--navy)]">{all ? "عرض أقل" : `عرض الكل (${lines.length})`}</button>}
      </>}
    </Card>
    <Card title="تنبيه المخزون" hint="بنقارن رصيد كل صنف في دفترة بمعدل بيعه آخر 90 يوم. الكمية المقترحة للطلب = اللي يكفي شهرين.">
      {!d.stock_alerts.length ? <div className="rounded-2xl bg-emerald-50 p-6 text-center text-sm font-bold text-emerald-800">✓ المخزون مكفّي لأكتر من شهر لكل الأصناف المتحركة</div>
        : <div className="space-y-1.5">{d.stock_alerts.map(s => <div key={s.key} className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ color: s.stock_status === "low" ? C.amber : C.red, background: `${s.stock_status === "low" ? C.amber : C.red}1f` }}><Icon name="products" size={18} /></span>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold" dir="auto">{s.name}</div><div className="text-[11px] text-[var(--muted)]">الرصيد {num(s.stock)} · بيتباع ~{num(s.monthly_pace, 1)} شهرياً{s.months_cover !== null && s.stock > 0 ? ` · يكفي ${s.months_cover} شهر` : ""}</div></div>
          <div className="shrink-0 text-left"><Pill text={STOCK[s.stock_status][0]} cls={STOCK[s.stock_status][1]} />{s.reorder_qty > 0 && <div className="mt-1 text-[11px] font-bold text-[var(--navy)]">اطلب {num(s.reorder_qty)}</div>}</div>
        </div>)}</div>}
    </Card>
  </div>;
}
