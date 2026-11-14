"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import type { TDoctor, Territory } from "@/lib/territory";
import { addDays, currentWeekStart, DAY_AR, weekday, weekDays } from "@/lib/plan-week-core";

const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} ر.س`;
const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
const TONE: Record<string, string> = { red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-800", teal: "bg-teal-50 text-teal-800", gold: "bg-amber-50 text-amber-700", slate: "bg-slate-100 text-slate-600", navy: "bg-[var(--sky-soft)] text-[var(--navy)]", green: "bg-emerald-50 text-emerald-700" };
type Filter = "all" | "late" | "unseen" | "a";
const FILTERS: Array<[Filter, string]> = [["all", "الكل"], ["late", "متأخرين"], ["unseen", "ما اتزاروش الشهر ده"], ["a", "A"]];

/** Work days a visit can still go on: the rest of this week and next week. */
export function planDays(today: string) {
  const s = currentWeekStart(today);
  return [...weekDays(s), ...weekDays(addDays(s, 7))].filter(d => d >= today);
}
const dayLabel = (d: string, today: string) => d === today ? "النهارده" : d === addDays(today, 1) ? "بكرة" : DAY_AR[weekday(d)];

function Bar({ v, max }: { v: number; max: number }) {
  const p = max ? Math.min(100, v / max * 100) : 0;
  return <div className="h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className={`h-full rounded-full transition-all duration-700 ${p >= 80 ? "bg-teal-500" : p >= 50 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${p}%` }} /></div>;
}

/** The rep's area by city: what each city needs this month, who is late, own-product sales and overdue money, with add-to-plan. */
export default function AreaBoard({ repId, isAdmin = false }: { repId?: string; isAdmin?: boolean }) {
  const toast = useToast();
  const [t, setT] = useState<Territory | null>(null);
  const [city, setCity] = useState(""); const [f, setF] = useState<Filter>("all");
  const [pick, setPick] = useState<string[] | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    fetch(`/api/plans/territory${repId ? `?repId=${repId}` : ""}`).then(r => r.ok ? r.json() : null).then(j => j ? setT(j) : toast("تعذر تحميل المنطقة", "error")).catch(() => toast("تعذر تحميل المنطقة", "error"));
  }, [repId, toast]);
  useEffect(() => { load(); }, [load]);

  const list = useMemo(() => (t?.doctors || []).filter(d => (!city || d.city === city) && (f === "all" || (f === "late" && d.late) || (f === "unseen" && !d.month_visits) || (f === "a" && d.cls === "A"))), [t, city, f]);
  if (!t) return <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="es-shimmer h-28 rounded-[26px]" />)}</div>;

  const tot = t.byCity.reduce((a, c) => ({ required: a.required + c.required, done: a.done + c.done, late: a.late + c.late, sales: a.sales + c.sales, overdue: a.overdue + c.overdue }), { required: 0, done: 0, late: 0, sales: 0, overdue: 0 });
  const days = planDays(t.today);
  const toAdd = (ids: string[]) => ids.filter(id => !t.doctors.find(d => d.id === id)?.in_plan);

  async function add(ids: string[], date: string) {
    setBusy(true); let ok = 0, req = 0, fail = 0, err = "";
    for (const id of ids) {
      const r = await fetch("/api/agenda/plan-items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date, doctorId: id, repId: isAdmin ? repId : undefined }) });
      if (r.status === 202) req++; else if (r.ok) ok++; else { fail++; err = (await r.json().catch(() => null))?.error || err; }
    }
    setBusy(false); setPick(null);
    toast([ok && `${ok} اتضافوا ليوم ${dayLabel(date, t!.today)}`, req && `${req} اتبعتوا طلب للمدير`, fail && (err || `${fail} فشلوا`)].filter(Boolean).join(" · "), fail && !ok && !req ? "error" : "success");
    load();
  }

  const row = (d: TDoctor) => <li key={d.id} className="flex items-start gap-2.5 rounded-2xl border border-[var(--border)] bg-white p-3">
    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs font-extrabold ${d.cls === "A" ? "bg-[var(--navy)] text-white" : d.cls === "B" ? "bg-[var(--sky-soft)] text-[var(--navy)]" : "bg-slate-100 text-slate-600"}`}>{d.cls || "—"}</span>
    <div className="min-w-0 flex-1">
      <Link href={`/doctors/${d.id}`} className="block truncate font-extrabold text-[var(--navy)] hover:underline" dir="auto">{d.name}</Link>
      <div className="truncate text-[11.5px] text-[var(--muted)]" dir="auto">{[d.clinic, d.city].filter(Boolean).join(" · ")}</div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {d.reason && <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${TONE[d.tone] || TONE.slate}`}>{d.icon} {d.reason}</span>}
        <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${d.month_visits >= d.required ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{d.month_visits}/{d.required} زيارة الشهر ده</span>
        {d.sales > 0 && <span className="rounded-lg bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-800">💰 {money(d.sales)}</span>}
        {d.overdue > 0 && <span className="rounded-lg bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">متأخرات {money(d.overdue)}</span>}
      </div>
    </div>
    {d.in_plan ? <span className="shrink-0 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700">✓ في الخطة {dm(d.in_plan)}</span>
      : <button type="button" disabled={busy} onClick={() => setPick(pick?.[0] === d.id && pick.length === 1 ? null : [d.id])} className="shrink-0 rounded-xl border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--navy)] hover:border-teal-400">＋ للخطة</button>}
  </li>;

  const picker = pick && <div className="es-pop flex flex-wrap items-center gap-1.5 rounded-2xl bg-[var(--sky-light)] p-2.5">
    <span className="text-xs font-bold text-[var(--navy)]">{pick.length > 1 ? `${pick.length} أطباء` : t.doctors.find(d => d.id === pick[0])?.name} ←</span>
    {days.map(d => <button key={d} type="button" disabled={busy} onClick={() => void add(pick, d)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[var(--navy)]">{dayLabel(d, t.today)} <span className="font-normal text-[var(--muted)]">{dm(d)}</span></button>)}
    <button type="button" onClick={() => setPick(null)} className="px-2 text-xs font-bold text-[var(--muted)]">إلغاء</button>
  </div>;

  const lateIds = toAdd(list.filter(d => d.late).map(d => d.id));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-[22px] border border-[var(--border)] bg-white p-3.5 shadow-sm"><div className="text-[11px] text-[var(--muted)]">الزيارات المطلوبة لحد النهارده</div>
          <div className="text-xl font-extrabold text-[var(--navy)]">{tot.done}/{tot.required}</div><div className="mt-2"><Bar v={tot.done} max={tot.required} /></div></div>
        <div className="rounded-[22px] border border-[var(--border)] bg-white p-3.5 shadow-sm"><div className="text-[11px] text-[var(--muted)]">أطباء متأخرين</div><div className={`text-xl font-extrabold ${tot.late ? "text-red-600" : "text-emerald-700"}`}>{tot.late}</div></div>
        <div className="rounded-[22px] border border-[var(--border)] bg-white p-3.5 shadow-sm"><div className="text-[11px] text-[var(--muted)]">مبيعات صنفك الشهر ده</div><div className="text-xl font-extrabold text-[var(--navy)]">{money(tot.sales)}</div></div>
        <div className="rounded-[22px] border border-[var(--border)] bg-white p-3.5 shadow-sm"><div className="text-[11px] text-[var(--muted)]">متأخرات العيادات</div><div className={`text-xl font-extrabold ${tot.overdue ? "text-red-600" : "text-[var(--navy)]"}`}>{money(tot.overdue)}</div></div>
      </div>

      {!t.byCity.length ? <div className="rounded-[26px] border border-dashed border-[var(--border-strong)] bg-white p-8 text-center text-sm text-[var(--muted)]">{t.assigned ? "مفيش أطباء نشطين في مدنك" : "لسه مفيش مدن ليك — المدير يحددها من «التغطية»"}</div> : <>
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {t.byCity.map(c => <button key={c.city} type="button" onClick={() => setCity(city === c.city ? "" : c.city)}
            className={`es-card-in rounded-[22px] border bg-white p-3.5 text-right shadow-sm transition ${city === c.city ? "border-teal-500 ring-2 ring-teal-100" : "border-[var(--border)] hover:border-teal-300"}`}>
            <div className="flex items-center justify-between gap-2"><b className="truncate text-[var(--navy)]" dir="auto">{c.city}</b><span className="text-[11px] text-[var(--muted)]">{c.doctors} طبيب · A {c.a}</span></div>
            <div className="mt-2 flex items-center gap-2"><div className="flex-1"><Bar v={c.done} max={c.required} /></div><span className="text-[11px] font-bold">{c.done}/{c.required}</span></div>
            <div className="mt-2 flex flex-wrap gap-1 text-[10.5px] font-bold">
              {c.late > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">{c.late} متأخر</span>}
              {c.planned > 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{c.planned} في الخطة</span>}
              {c.sales > 0 && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-800">💰 {money(c.sales)}</span>}
              {c.overdue > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">متأخرات {money(c.overdue)}</span>}
            </div>
          </button>)}
        </div>

        <section className="rounded-[26px] border border-[var(--border)] bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="font-extrabold text-[var(--navy)]" dir="auto">{city || "كل المدن"} <span className="text-[11px] font-normal text-[var(--muted)]">({list.length})</span></h3>
            <div className="flex flex-wrap gap-1">{FILTERS.map(([k, l]) => <button key={k} type="button" onClick={() => setF(k)} className={`rounded-full px-3 py-1 text-xs font-bold ${f === k ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)] text-[var(--muted)]"}`}>{l}</button>)}</div>
            {lateIds.length > 0 && <button type="button" disabled={busy} onClick={() => setPick(lateIds.slice(0, 12))} className="mr-auto rounded-xl bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">＋ ضيف المتأخرين ({Math.min(12, lateIds.length)})</button>}
          </div>
          {picker && <div className="mb-3">{picker}</div>}
          <ul className="space-y-2">{list.slice(0, 80).map(row)}</ul>
          {list.length > 80 && <p className="mt-2 text-center text-xs text-[var(--muted)]">و {list.length - 80} كمان</p>}
          {!list.length && <p className="text-center text-sm text-[var(--muted)]">مفيش أطباء هنا</p>}
        </section>
      </>}
    </div>
  );
}
