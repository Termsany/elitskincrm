"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { BrokenPromise, DiscountLine, Pace, ReorderDue } from "@/lib/smart";

type D = { today: string; reorder: ReorderDue[]; pace: Pace[]; promises: BrokenPromise[]; discounts: { max: number; lines: DiscountLine[]; lost: number } | null; nextWeek: { start: string; withPlan: number } };
type Tab = "pace" | "reorder" | "promises" | "discounts";
const k = (n: number) => Math.round(n).toLocaleString("en-US");
const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;

/** Admin home "ذكاء المبيعات": pace per rep, clinics about to reorder, broken payment promises, discounts above the limit, and next week's auto plans. */
export default function AdminSmartBoard() {
  const toast = useToast();
  const [d, setD] = useState<D | null>(null); const [tab, setTab] = useState<Tab>("pace"); const [busy, setBusy] = useState(false);
  const [max, setMax] = useState(""); const [all, setAll] = useState(false);
  const load = () => fetch("/api/smart", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => { if (j) { setD(j); setMax(String(j.discounts?.max ?? "")); } }).catch(() => null);
  useEffect(() => { void load(); }, []);
  if (!d) return <div className="es-shimmer h-48 rounded-[28px]" />;
  const behind = d.pace.filter(p => p.behind);
  async function plans() {
    setBusy(true); const r = await fetch("/api/plans/auto", { method: "POST" }); const j = await r.json().catch(() => null); setBusy(false);
    if (!r.ok) { toast(j?.error || "تعذر", "error"); return; }
    toast(j.created.length ? `اتعمل ${j.created.length} مسودة (${j.created.map((c: { rep: string; visits: number }) => `${c.rep.split(" ")[0]} ${c.visits}`).join("، ")}) — اتبعتت للمناديب` : `مفيش مسودات جديدة: ${j.skipped.map((s: { rep: string; why: string }) => `${s.rep.split(" ")[0]}: ${s.why}`).join(" · ")}`, j.created.length ? "success" : "info");
    void load();
  }
  async function saveMax() {
    const r = await fetch("/api/smart", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ max_discount_pct: Number(max) }) });
    const j = await r.json().catch(() => null); if (!r.ok) toast(j?.error || "تعذر الحفظ", "error"); else { toast("اتحفظ الحد ✓", "success"); void load(); }
  }
  const tabs: Array<[Tab, string, number, string]> = [
    ["pace", "سرعة الأهداف", behind.length, "#ef4b4e"], ["reorder", "قرّب طلبها", d.reorder.length, "#3b90e8"], ["promises", "وعود اتكسرت", d.promises.length, "#e16201"],
    ...(d.discounts ? [["discounts", "خصومات زيادة", d.discounts.lines.length, "#9676e3"] as [Tab, string, number, string]] : []),
  ];
  const list = <T,>(rows: T[]) => all ? rows : rows.slice(0, 6);
  return <section className="es-card-in overflow-hidden rounded-[28px] border border-[var(--border)] bg-white" aria-labelledby="smart-h">
    <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3">
      <div className="flex items-center gap-2"><span className="text-xl">💡</span><h2 id="smart-h" className="text-lg font-extrabold text-[var(--navy)]">ذكاء المبيعات</h2></div>
      <button type="button" disabled={busy} onClick={() => void plans()} className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--navy)] px-3 py-2 text-xs font-bold text-white shadow transition hover:-translate-y-0.5 disabled:opacity-60" title={`الأسبوع اللي يبدأ ${dm(d.nextWeek.start)}`}>
        <Icon name="calendar" size={14} />{busy ? "بجهّز…" : `جهّز خطط الأسبوع الجاي${d.nextWeek.withPlan ? ` (${d.nextWeek.withPlan} عندهم خطة)` : ""}`}</button>
    </div>
    <div className="flex gap-1.5 overflow-x-auto px-5 pb-3">{tabs.map(([t, l, n, c]) => <button key={t} type="button" onClick={() => { setTab(t); setAll(false); }}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${tab === t ? "bg-[var(--navy)] text-white shadow" : "bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--navy)]"}`}>
      {l}{n > 0 && <span className="rounded-full px-1.5 text-[10px] text-white" style={{ background: tab === t ? "rgba(255,255,255,.25)" : c }}>{n}</span>}</button>)}</div>
    <div className="border-t border-[var(--border)]">
      {tab === "pace" && <ul className="divide-y divide-[var(--border)]">{d.pace.filter(p => p.target > 0 || p.mtd > 0).map(p => { const c = p.pct === null ? "#3b90e8" : p.pct >= 100 ? "#1aa865" : p.pct >= 85 ? "#e99608" : "#ef4b4e";
        return <li key={p.rep_id} className="px-5 py-3"><div className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><b>{p.name}</b>
          <span className="text-[12px] text-[var(--muted)]">{k(p.mtd)} من {p.target ? k(p.target) : "—"} · متوقع <b style={{ color: c }}>{k(p.projected)}{p.pct !== null ? ` (${p.pct}%)` : ""}</b></span></div>
          <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className="absolute inset-y-0 right-0 rounded-full opacity-30" style={{ width: `${Math.min(100, p.target ? p.projected / p.target * 100 : 0)}%`, background: c }} />
            <div className="absolute inset-y-0 right-0 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, p.target ? p.mtd / p.target * 100 : 0)}%`, background: c }} /></div>
          {p.behind && <div className="mt-1 text-[11px] font-bold text-red-700">متأخر عن الهدف — {d.reorder.length ? "فيه عيادات قرّب طلبها في «قرّب طلبها»" : "محتاج متابعة"}</div>}</li>; })}
        {!d.pace.some(p => p.target > 0 || p.mtd > 0) && <li className="p-6 text-center text-sm text-[var(--muted)]">حط أهداف شهرية للمناديب عشان تشوف السرعة</li>}
        <li className="px-5 py-2 text-[10.5px] text-[var(--muted)]">اليوم {d.pace[0]?.day || 0} من {d.pace[0]?.days || 30} — المتوقع = المحقق ÷ الأيام اللي فاتت × أيام الشهر</li></ul>}
      {tab === "reorder" && <ul className="divide-y divide-[var(--border)]">{list(d.reorder).map(r => <li key={r.clinic_id} className="flex items-center gap-3 px-5 py-3">
        <span className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-extrabold ${r.days_to < 0 ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-800"}`}>{r.days_to < 0 ? `متأخر ${-r.days_to}` : r.days_to === 0 ? "النهارده" : `بعد ${r.days_to}`} يوم</span>
        <div className="min-w-0 flex-1"><b className="block truncate text-sm">{r.clinic_name}</b><span className="block truncate text-[11px] text-[var(--muted)]">كل {r.usual_gap} يوم · متوسط {k(r.monthly_avg)} ر.س/شهر{r.branches?.length ? ` · ${r.branches.length} فروع` : ""}{r.top.length ? ` · ${r.top.join("، ")}` : ""}</span></div>
        {r.doctors[0] && <Link href={`/doctors/${r.doctors[0].id}`} className="shrink-0 text-xs font-bold text-[var(--sky-deep)]">الطبيب ‹</Link>}</li>)}
        {!d.reorder.length && <li className="p-6 text-center text-sm text-[var(--muted)]">مفيش عيادات قرّب ميعاد طلبها الأسبوع ده</li>}</ul>}
      {tab === "promises" && <ul className="divide-y divide-[var(--border)]">{list(d.promises).map(x => <li key={`${x.client_id}`} className="flex items-center gap-3 px-5 py-3">
        <span className="shrink-0 rounded-lg bg-orange-50 px-2 py-1 text-[11px] font-extrabold text-orange-800">متأخر {x.days_late} يوم</span>
        <div className="min-w-0 flex-1"><b className="block truncate text-sm">{x.clinic_name || x.customer}</b><span className="text-[11px] text-[var(--muted)]">{x.rep_name} · وعد يدفع {dm(x.promise_date)}{x.amount ? ` ${k(x.amount)} ر.س` : ""} · عليها {k(x.unpaid)} ر.س</span></div></li>)}
        {!d.promises.length && <li className="p-6 text-center text-sm text-[var(--muted)]">كل وعود السداد في ميعادها ✓</li>}</ul>}
      {tab === "discounts" && d.discounts && <div>
        <div className="flex flex-wrap items-center gap-2 bg-[var(--bg)] px-5 py-2.5 text-xs"><span>أقصى خصم مسموح</span><input value={max} onChange={e => setMax(e.target.value.replace(/[^\d.]/g, ""))} className="w-16 rounded-lg border border-[var(--border)] px-2 py-1 text-center" dir="ltr" />%
          {Number(max) !== d.discounts.max && <button type="button" onClick={() => void saveMax()} className="rounded-lg bg-[var(--navy)] px-2.5 py-1 font-bold text-white">حفظ</button>}
          <span className="mr-auto text-[var(--muted)]">آخر 60 يوم · ضاع {k(d.discounts.lost)} ر.س خصومات فوق الحد</span></div>
        <ul className="divide-y divide-[var(--border)]">{list(d.discounts.lines).map((l, i) => <li key={`${l.invoice_id}-${i}`} className="flex items-center gap-3 px-5 py-2.5">
          <span className="shrink-0 rounded-lg bg-violet-50 px-2 py-1 text-[11px] font-extrabold text-violet-800">{l.discount_pct >= 99.5 ? "مجاني" : `${l.discount_pct}%`}</span>
          <div className="min-w-0 flex-1"><b className="block truncate text-sm" dir="auto">{l.item}</b><span className="block truncate text-[11px] text-[var(--muted)]">{l.customer} · فاتورة {l.invoice_no} · {dm(l.date)}{l.reps ? ` · ${l.reps}` : ""}</span></div>
          <span className="shrink-0 text-xs font-bold text-red-700">−{k(l.lost)}</span></li>)}
          {!d.discounts.lines.length && <li className="p-6 text-center text-sm text-[var(--muted)]">مفيش خصومات فوق {d.discounts.max}% ✓</li>}</ul></div>}
      {((tab === "reorder" && d.reorder.length > 6) || (tab === "promises" && d.promises.length > 6) || (tab === "discounts" && (d.discounts?.lines.length || 0) > 6)) &&
        <button type="button" onClick={() => setAll(!all)} className="w-full border-t border-[var(--border)] py-2.5 text-xs font-bold text-[var(--muted)] hover:text-[var(--navy)]">{all ? "أقل" : "عرض الكل"}</button>}
    </div>
  </section>;
}
