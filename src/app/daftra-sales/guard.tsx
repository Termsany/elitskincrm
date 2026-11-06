"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { FinData } from "./FinanceHub";
import { sar, num, C, Card, Pill } from "./kit";

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
        </div>)}{d.stock_alerts.some(s => s.stock_status === "negative") && <p className="pt-1 text-[11px] leading-5 text-[var(--muted)]">الرصيد بالسالب معناه إن فيه فواتير بيع اتعملت قبل ما فاتورة الشراء أو الجرد يتسجلوا في دفترة.</p>}</div>}
    </Card>
  </div>;
}

type Link = { client_id: number; name: string; unpaid: number; overdue: number; invoices: number; oldest: number | null; rep_id: string | null; clinic_id: string | null; linked: boolean;
  suggestion: { clinic_id: string; clinic_name: string; rep_id: string | null; rep_name: string | null; score: number } | null;
  last_followup: { result: string; promise_date: string | null; note: string; created_at: string; rep_name: string } | null };
type LinksData = { reps: Array<{ id: string; name: string }>; clinics: Array<{ id: string; name: string; city: string }>; clients: Link[] };
const RL: Record<string, string> = { contacted: "📞 اتواصل", promised: "🤝 وعد بالدفع", partial: "💵 دفع جزء", paid: "✅ دفع", disputed: "⚠️ معترض", no_answer: "📵 ما ردش" };

/** AR tab: route every Daftra customer to the rep who follows up the collection. */
export function ClientLinks() {
  const toast = useToast();
  const [d, setD] = useState<LinksData | null>(null);
  const load = useCallback(() => fetch("/api/admin/finance/links", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => j && setD(j)).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const unlinked = useMemo(() => d?.clients.filter(c => !c.rep_id && c.unpaid > 0) || [], [d]);
  const sugg = useMemo(() => d?.clients.filter(c => !c.linked && c.suggestion?.rep_id).length || 0, [d]);
  async function set(c: Link, rep_id: string | null, clinic_id: string | null) {
    setD(x => x && { ...x, clients: x.clients.map(y => y.client_id === c.client_id ? { ...y, rep_id, clinic_id, linked: !!(rep_id || clinic_id) } : y) });
    const r = await fetch("/api/admin/finance/links", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: c.client_id, rep_id, clinic_id }) });
    if (!r.ok) { toast("تعذر الحفظ", "error"); void load(); } else toast(rep_id ? "اتربط العميل بالمندوب ✓ — هيظهر في صفحته" : "اتشال الربط", "success");
  }
  async function auto() { const r = await fetch("/api/admin/finance/links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "auto" }) }); const j = await r.json().catch(() => null); if (r.ok) { toast(`اتربط ${j.linked} عميل تلقائياً — راجعهم`, "success"); void load(); } else toast("تعذر الربط", "error"); }
  if (!d) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  return <Card title="مين بيحصّل من كل عميل؟" hint="اربط كل عميل في دفترة بالمندوب المسؤول (والعيادة لو حابب). المندوب هيشوف فواتير عملاؤه المتأخرة في الصفحة الرئيسية ويسجل متابعة التحصيل. الربط في الـ CRM بس."
    right={sugg > 0 ? <button type="button" onClick={() => void auto()} className="flex items-center gap-1.5 rounded-xl bg-[var(--navy)] px-3 py-2 text-xs font-bold text-white"><Icon name="sparkle" size={14} />اربط {sugg} تلقائياً بالاقتراح</button> : null}>
    {unlinked.length > 0 && <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 ring-1 ring-amber-200">{unlinked.length} عميل عليهم {sar(unlinked.reduce((s, c) => s + c.unpaid, 0))} مش مربوطين بمندوب — محدش بيتابع تحصيلهم</div>}
    <div className="-mx-4 overflow-x-auto px-4"><table className="w-full min-w-[760px] text-sm">
      <thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="p-2.5 text-right">العميل</th><th className="p-2.5">المتبقي</th><th className="p-2.5">أقدم تأخير</th><th className="p-2.5">المندوب</th><th className="p-2.5">العيادة</th><th className="p-2.5 text-right">آخر متابعة</th></tr></thead>
      <tbody className="divide-y divide-[var(--border)]">{d.clients.filter(c => c.unpaid > 0).map(c => <tr key={c.client_id} className={`transition-colors hover:bg-[var(--sky-light)]/50 ${!c.rep_id ? "bg-amber-50/40" : ""}`}>
        <td className="max-w-64 p-2.5"><div className="truncate font-bold" dir="auto">{c.name}</div>{!c.linked && c.suggestion && <button type="button" onClick={() => void set(c, c.suggestion!.rep_id, c.suggestion!.clinic_id)} className="mt-0.5 text-[11px] font-bold text-[var(--sky-deep)] hover:underline">✨ اقتراح: {c.suggestion.clinic_name}{c.suggestion.rep_name ? ` · ${c.suggestion.rep_name}` : ""} — اضغط للتأكيد</button>}</td>
        <td className="p-2.5 text-center"><b>{sar(c.unpaid)}</b>{c.overdue > 0 && <div className="text-[10.5px] font-bold text-red-600">متأخر {sar(c.overdue)}</div>}</td>
        <td className="p-2.5 text-center">{c.oldest && c.oldest > 0 ? <span className={c.oldest > 60 ? "font-bold text-red-700" : "text-amber-700"}>{c.oldest} يوم</span> : "في الميعاد"}</td>
        <td className="p-2.5 text-center"><select value={c.rep_id || ""} onChange={e => void set(c, e.target.value || null, c.clinic_id)} className={`h-9 rounded-lg border px-2 text-xs font-bold ${c.rep_id ? "border-[var(--sky-border)] bg-[var(--sky-light)] text-[var(--navy)]" : "border-amber-300 bg-white text-amber-800"}`}><option value="">— اختار مندوب —</option>{d.reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></td>
        <td className="p-2.5 text-center"><select value={c.clinic_id || ""} onChange={e => void set(c, c.rep_id, e.target.value || null)} className="h-9 max-w-44 rounded-lg border border-[var(--border)] px-2 text-xs"><option value="">—</option>{d.clinics.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}</select></td>
        <td className="p-2.5 text-xs">{c.last_followup ? <div><b>{RL[c.last_followup.result]}</b>{c.last_followup.promise_date && <span className="text-[var(--muted)]"> · ميعاد {c.last_followup.promise_date}</span>}<div className="text-[10.5px] text-[var(--muted)]">{c.last_followup.rep_name}{c.last_followup.note ? ` — ${c.last_followup.note.slice(0, 40)}` : ""}</div></div> : <span className="text-[var(--muted)]">لسه مفيش</span>}</td>
      </tr>)}</tbody></table></div>
  </Card>;
}
