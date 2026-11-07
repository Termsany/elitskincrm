"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { BrokenPromise, Pace, ReorderDue } from "@/lib/smart";

type D = { today: string; reorder: ReorderDue[]; pace: Pace | null; promises: BrokenPromise[]; nextWeek: { start: string; plan: { id: string; status: string } | null } };
const k = (n: number) => Math.round(n).toLocaleString("en-US");
const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
const when = (n: number) => n < 0 ? `متأخر ${-n} يوم` : n === 0 ? "النهارده" : n === 1 ? "بكرة" : `بعد ${n} يوم`;

/** Rep home: pace to target, clinics about to reorder, broken payment promises, and one tap to draft next week's plan. */
export default function RepSmartCard() {
  const toast = useToast();
  const [d, setD] = useState<D | null>(null); const [busy, setBusy] = useState(false);
  const load = () => fetch("/api/smart", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => j && setD(j)).catch(() => null);
  useEffect(() => { void load(); }, []);
  if (!d) return null;
  const p = d.pace, wd = new Date(`${d.today}T12:00:00Z`).getUTCDay();
  const showPlan = !d.nextWeek.plan && wd >= 3 && wd <= 6; // Wed → Sat: time to plan next week
  if (!d.reorder.length && !d.promises.length && !(p && p.target) && !showPlan && !d.nextWeek.plan) return null;
  async function draft() {
    setBusy(true); const r = await fetch("/api/plans/auto", { method: "POST" }); const j = await r.json().catch(() => null); setBusy(false);
    const c = j?.created?.[0];
    if (c) { toast(`اتجهزت مسودة ${c.visits} زيارة ✓`, "success"); location.href = `/plans?planId=${c.plan_id}`; }
    else toast(j?.skipped?.[0]?.why || j?.error || "تعذر تجهيز الخطة", "error");
  }
  const pct = p?.pct ?? null, tone = pct === null ? "#3b90e8" : pct >= 100 ? "#1aa865" : pct >= 85 ? "#e99608" : "#ef4b4e";
  return <section className="es-card-in mb-4 space-y-3 rounded-3xl border border-[var(--border)] bg-white p-4 shadow-sm" aria-label="اقتراحات النهارده">
    <div className="flex items-center gap-2"><span className="text-xl">💡</span><h2 className="font-extrabold text-[var(--navy)]">اقتراحات النهارده</h2></div>

    {p && p.target > 0 && <div className="rounded-2xl bg-[var(--bg)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><b className="text-[var(--navy)]">هدفك الشهر ده</b><span className="text-[12px] text-[var(--muted)]">حققت {k(p.mtd)} من {k(p.target)} ر.س</span></div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, p.target ? p.mtd / p.target * 100 : 0)}%`, background: tone }} /></div>
      <div className="mt-1.5 text-[12px] font-bold" style={{ color: tone }}>{pct === null ? "" : pct >= 100 ? `على السرعة دي هتعدّي الهدف — متوقع ${k(p.projected)} ر.س (${pct}%) 🎉` : `على السرعة دي هتقفل على ${k(p.projected)} ر.س (${pct}%)${d.reorder.length ? " — ركّز على العيادات اللي تحت" : ""}`}</div>
    </div>}

    {d.reorder.length > 0 && <div>
      <div className="mb-1.5 text-xs font-bold text-[var(--muted)]">عيادات قرّب ميعاد طلبها</div>
      <ul className="space-y-1.5">{d.reorder.slice(0, 5).map(r => <li key={r.clinic_id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] p-2.5">
        <span className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-extrabold ${r.days_to < 0 ? "bg-red-50 text-red-700" : r.days_to <= 2 ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-800"}`}>{when(r.days_to)}</span>
        <div className="min-w-0 flex-1"><b className="block truncate text-sm">{r.clinic_name}</b><span className="block truncate text-[11px] text-[var(--muted)]">بتطلب كل {r.usual_gap} يوم · آخر طلب {dm(r.last)}{r.top.length ? ` · ${r.top.join("، ")}` : ""}</span></div>
        {r.doctors[0] && <Link href={`/visits/new?doctorId=${r.doctors[0].id}`} className="shrink-0 rounded-lg bg-[var(--navy)] px-2.5 py-1.5 text-[11px] font-bold text-white">زيارة ‹</Link>}
      </li>)}</ul>
    </div>}

    {d.promises.length > 0 && <div className="rounded-2xl bg-red-50 p-3 text-[12.5px] text-red-900 ring-1 ring-red-200">
      <b>وعود سداد عدّى ميعادها:</b> {d.promises.slice(0, 3).map(x => `${x.clinic_name || x.customer} (وعد ${dm(x.promise_date)} · عليها ${k(x.unpaid)} ر.س)`).join(" · ")} — كلّمهم أو زورهم وسجّل الرد في التحصيل.
    </div>}

    {showPlan && <button type="button" disabled={busy} onClick={() => void draft()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--navy)] px-4 py-3 text-sm font-extrabold text-white shadow-md transition hover:-translate-y-0.5 disabled:opacity-60">
      <Icon name="calendar" size={18} />{busy ? "بجهّز…" : "جهّز لي خطة الأسبوع الجاي"}</button>}
    {d.nextWeek.plan?.status === "draft" && <Link href={`/plans?planId=${d.nextWeek.plan.id}`} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--navy)]/30 px-4 py-3 text-sm font-bold text-[var(--navy)]">🗓️ مسودة خطة الأسبوع الجاي جاهزة — راجعها وابعتها ‹</Link>}
  </section>;
}
