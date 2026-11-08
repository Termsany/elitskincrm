"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import type { RepWeek, WeekItem } from "@/lib/plan-week";
import { addDays, DAY_AR, weekday } from "@/lib/plan-week-core";

const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
const dayName = (d: string) => DAY_AR[weekday(d)];
const range = (a: string, b: string) => `${Number(a.slice(8, 10))}–${Number(b.slice(8, 10))} ${new Intl.DateTimeFormat("ar-EG", { month: "long", timeZone: "UTC" }).format(new Date(`${b}T12:00:00Z`))}`;
export const PLAN_STATUS: Record<string, [string, string]> = { approved: ["معتمدة ✓", "bg-emerald-50 text-emerald-700"], pending: ["مستنية الاعتماد", "bg-amber-50 text-amber-800"], needs_revision: ["محتاجة تعديل", "bg-red-50 text-red-700"],
  draft: ["مسودة", "bg-slate-100 text-slate-600"], none: ["مفيش خطة", "bg-slate-100 text-slate-500"] };
const TONE: Record<string, string> = { red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-800", teal: "bg-teal-50 text-teal-800", gold: "bg-amber-50 text-amber-700", slate: "bg-slate-100 text-slate-600", navy: "bg-[var(--sky-soft)] text-[var(--navy)]", green: "bg-emerald-50 text-emerald-700" };
const REASONS = ["الطبيب مسافر", "العيادة مقفولة", "اتزار قبل كده", "مش محتاج زيارة دلوقتي"];

function Ring({ v }: { v: number }) {
  const r = 22, c = 2 * Math.PI * r;
  return <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90"><circle cx="28" cy="28" r={r} fill="none" stroke="var(--bg)" strokeWidth="7" />
    <circle cx="28" cy="28" r={r} fill="none" stroke="#33b3a6" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, v) / 100)} style={{ transition: "stroke-dashoffset 1s ease" }} /></svg>;
}
function Kpi({ label, value, sub, tone = "", ring }: { label: string; value: string; sub: string; tone?: string; ring?: number }) {
  return <div className="es-card-in flex items-center gap-3 rounded-[22px] border border-[var(--border)] bg-white p-3.5 shadow-sm">
    {ring !== undefined && <div className="relative shrink-0"><Ring v={ring} /><b className="absolute inset-0 grid place-items-center text-[11px] text-[var(--navy)]">{ring}%</b></div>}
    <div className="min-w-0"><div className="text-[11px] text-[var(--muted)]">{label}</div><div className={`text-xl font-extrabold leading-tight ${tone || "text-[var(--navy)]"}`}>{value}</div><div className="text-[10.5px] text-[var(--muted)]">{sub}</div></div></div>;
}

/** Rep's week: health, day chips, today's route with one-tap actions, missed visits, smart suggestions and next week. Admin can open it for one rep. */
export default function WeekBoard({ repId, isAdmin = false, embedded = false, initialStart = "" }: { repId?: string; isAdmin?: boolean; embedded?: boolean; initialStart?: string }) {
  const toast = useToast();
  const [start, setStart] = useState(initialStart);
  const [w, setW] = useState<RepWeek | null>(null);
  const [day, setDay] = useState("");
  const [open, setOpen] = useState<{ id: string; kind: "move" | "remove" } | null>(null);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => {
    const qs = new URLSearchParams(); if (start) qs.set("start", start); if (repId) qs.set("repId", repId);
    fetch(`/api/plans/week?${qs}`).then(r => r.ok ? r.json() : null).then((j: RepWeek | null) => {
      if (!j) { toast("تعذر تحميل الخطة", "error"); return; }
      setW(j); setDay(d => d && j.days.some(x => x.date === d) ? d : (j.days.find(x => x.date === j.today)?.date || j.days.find(x => x.count)?.date || j.days[0].date));
    }).catch(() => toast("تعذر تحميل الخطة", "error"));
  }, [start, repId, toast]);
  useEffect(() => { load(); }, [load]);

  const done = (r: Response, j: { error?: string; requested?: boolean } | null, ok: string) => {
    if (r.status === 202 || j?.requested) toast("الخطة معتمدة — اتبعت طلب للمدير يوافق عليه", "info");
    else if (r.ok) toast(ok, "success"); else { toast(j?.error || "تعذر", "error"); return false; }
    setOpen(null); load(); return true;
  };
  async function move(it: WeekItem, date: string) {
    setBusy(it.id); const r = await fetch(`/api/agenda/plan-items/${it.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ date }) });
    const j = await r.json().catch(() => null); setBusy(""); done(r, j, `اتنقلت ليوم ${dayName(date)}`);
  }
  async function remove(it: WeekItem, reason: string) {
    setBusy(it.id); const r = await fetch(`/api/agenda/plan-items/${it.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) });
    const j = await r.json().catch(() => null); setBusy(""); done(r, j, "اتشالت من الخطة");
  }
  async function add(doctorIds: string[], date: string) {
    setBusy(date + doctorIds[0]); let ok = 0, req = 0, fail = 0; let err = "";
    for (const id of doctorIds) {
      const r = await fetch("/api/agenda/plan-items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date, doctorId: id, repId: isAdmin ? repId : undefined }) });
      if (r.status === 202) req++; else if (r.ok) ok++; else { fail++; err = (await r.json().catch(() => null))?.error || err; }
    }
    setBusy(""); toast([ok && `${ok} اتضافوا ليوم ${dayName(date)}`, req && `${req} اتبعتوا طلب للمدير`, fail && (err || `${fail} فشلوا`)].filter(Boolean).join(" · "), fail && !ok && !req ? "error" : "success"); load();
  }
  async function submitNext() {
    if (!w?.next.id) return; const r = await fetch(`/api/plans/${w.next.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ submit: true }) });
    const j = await r.json().catch(() => null); if (r.ok) { toast("اتبعتت للاعتماد ✓", "success"); load(); } else toast(j?.error || "تعذر", "error");
  }
  async function draftNext() {
    const r = await fetch("/api/plans/auto", { method: "POST" }); const j = await r.json().catch(() => null);
    if (r.ok) { toast("اتعملت مسودة الأسبوع الجاي — راجعها", "success"); load(); } else toast(j?.error || "تعذر", "error");
  }

  if (!w) return <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="es-shimmer h-28 rounded-[26px]" />)}</div>;
  const k = w.kpi; const status = w.plans.find(p => p.status === "needs_revision")?.status || w.plans.find(p => p.status === "pending")?.status || w.plans.find(p => p.status === "approved")?.status || w.plans[0]?.status || "none";
  const [sl, sc] = PLAN_STATUS[status] || PLAN_STATUS.none;
  const missed = w.items.filter(i => i.state === "missed" && !i.excused);
  const dayItems = w.items.filter(i => i.date === day && (i.state !== "missed" || i.excused));
  const cities = [...new Set(dayItems.map(i => i.city || "—"))];
  const todayIn = w.days.some(d => d.date === w.today);
  const futureDays = (from: string) => w.days.map(d => d.date).filter(d => d > from && d >= w.today);
  const note = w.plans.find(p => p.status === "needs_revision")?.admin_note;

  const row = (it: WeekItem) => {
    const isOpen = open?.id === it.id; const targets = futureDays(it.date < w.today ? addDays(w.today, -1) : it.date);
    return <li key={it.id} className={`rounded-2xl border p-3 transition ${it.state === "done" ? "border-emerald-200 bg-emerald-50/40" : it.excused ? "border-amber-200 bg-amber-50/40" : it.state === "missed" ? "border-red-200 bg-white" : "border-[var(--border)] bg-white"}`}>
      <div className="flex items-start gap-2.5">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs font-extrabold ${it.cls === "A" ? "bg-[var(--navy)] text-white" : it.cls === "B" ? "bg-[var(--sky-soft)] text-[var(--navy)]" : "bg-slate-100 text-slate-600"}`}>{it.cls || "—"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5"><Link href={`/doctors/${it.doctor_id}`} className="truncate font-extrabold text-[var(--navy)] hover:underline" dir="auto">{it.doctor}</Link>
            {it.product && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10.5px] font-bold text-teal-800" dir="auto">{it.product}</span>}
            {it.pending_change && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">مستني موافقة المدير</span>}</div>
          <div className="truncate text-[11.5px] text-[var(--muted)]" dir="auto">{[it.clinic, it.city].filter(Boolean).join(" · ")}{it.state === "missed" ? ` · كانت يوم ${dayName(it.date)}` : ""}</div>
          {it.state !== "done" && it.reason && <span className={`mt-1.5 inline-block rounded-lg px-2 py-0.5 text-[11px] font-bold ${TONE[it.tone] || TONE.slate}`}>{it.icon} {it.reason}</span>}
        </div>
        <span className={`shrink-0 text-[11px] font-bold ${it.excused ? "text-amber-700" : it.state === "done" ? "text-emerald-700" : it.state === "missed" ? "text-red-600" : it.state === "today" ? "text-amber-700" : "text-[var(--muted)]"}`}>
          {it.excused ? "⏱ وقت مكتبي" : it.state === "done" ? (it.done_at ? `✓ اتعملت ${it.done_at}` : `✓ اتعملت ${it.done_on ? dayName(it.done_on) : ""}`) : it.state === "missed" ? "فاتت" : it.state === "today" ? "النهارده" : "لسه"}</span>
      </div>
      {it.state !== "done" && <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {!isAdmin && <Link href={`/visits/new?doctorId=${it.doctor_id}${it.product_id ? `&productId=${it.product_id}` : ""}`} className="flex min-h-9 items-center rounded-xl bg-[var(--navy)] px-3 text-xs font-bold text-white">▶ سجل زيارة</Link>}
        {it.state === "missed" && todayIn && <button type="button" disabled={busy === it.id} onClick={() => void move(it, w.today)} className="min-h-9 rounded-xl bg-red-50 px-3 text-xs font-bold text-red-700">حطها النهارده</button>}
        {targets.length > 0 && <button type="button" onClick={() => setOpen(isOpen && open?.kind === "move" ? null : { id: it.id, kind: "move" })} className="min-h-9 rounded-xl border border-[var(--border)] px-3 text-xs font-bold">↷ أجّلها</button>}
        <button type="button" onClick={() => setOpen(isOpen && open?.kind === "remove" ? null : { id: it.id, kind: "remove" })} className="min-h-9 rounded-xl px-2 text-xs font-bold text-[var(--muted)] hover:text-red-600">✕ شيلها</button>
      </div>}
      {isOpen && <div className="es-pop mt-2 flex flex-wrap gap-1.5 rounded-xl bg-[var(--bg)] p-2">
        {open!.kind === "move" ? targets.map(d => <button key={d} type="button" disabled={busy === it.id} onClick={() => void move(it, d)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[var(--navy)]">{d === addDays(w.today, 1) ? "بكرة" : dayName(d)} <span className="font-normal text-[var(--muted)]">{dm(d)}</span></button>)
          : REASONS.map(r => <button key={r} type="button" disabled={busy === it.id} onClick={() => void remove(it, r)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold">{r}</button>)}
      </div>}
    </li>;
  };

  const side = <>
    {(w.fill || w.suggestions.length > 0) && <section className="es-card-in rounded-[26px] border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-50">✨</span><div><h3 className="font-extrabold text-[var(--navy)]">اقتراحات ذكية</h3><p className="text-[11px] text-[var(--muted)]">دكاترة محتاجين زيارة ومش في خطتك — على اليوم اللي إنت فيه في نفس المدينة</p></div></div>
      {w.fill && <div className="mb-3 rounded-2xl bg-teal-50 p-3"><p className="text-xs font-bold leading-5 text-[var(--navy)]">يوم {dayName(w.fill.date)} فيه {w.fill.count} زيارات بس — ضيف {w.fill.doctors.length} من المقترحين{w.fill.city ? ` في ${w.fill.city}` : ""}؟</p>
        <button type="button" disabled={!!busy} onClick={() => void add(w.fill!.doctors, w.fill!.date)} className="mt-2 min-h-9 w-full rounded-xl bg-white text-xs font-bold text-teal-800">ضيفهم كلهم</button></div>}
      <ul className="space-y-2">{w.suggestions.map(s => <li key={s.doctor_id} className="flex items-center gap-2.5 rounded-2xl border border-[var(--border)] p-2.5">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-extrabold ${s.cls === "A" ? "bg-[var(--navy)] text-white" : "bg-[var(--sky-soft)] text-[var(--navy)]"}`}>{s.cls || "—"}</span>
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold" dir="auto">{s.name}</div><div className="truncate text-[11px] text-[var(--muted)]">{s.icon} {s.reason}</div>{s.day && <div className="text-[10.5px] font-bold text-teal-700">{s.city || "—"} — {dayName(s.day)}</div>}</div>
        {s.day ? <button type="button" disabled={!!busy} onClick={() => void add([s.doctor_id], s.day!)} className="shrink-0 rounded-xl border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--navy)] hover:border-teal-400">＋ {dayName(s.day)}</button>
          : <span className="text-[10.5px] text-[var(--muted)]">الأسبوع خلص</span>}
      </li>)}</ul>
    </section>}
    {!embedded && <section className="rounded-[26px] border border-[var(--border)] bg-gradient-to-l from-[var(--sky-light)] to-white p-4 shadow-sm">
      <h3 className="font-extrabold text-[var(--navy)]">خطة الأسبوع الجاي <span className="text-[11px] font-normal text-[var(--muted)]">({dm(w.next.start)})</span></h3>
      {w.next.id ? <>
        <p className="mt-1 text-xs text-[var(--muted)]"><span className={`ml-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${(PLAN_STATUS[w.next.status] || PLAN_STATUS.none)[1]}`}>{(PLAN_STATUS[w.next.status] || PLAN_STATUS.none)[0]}</span> {w.next.n} زيارة · {w.next.a} دكاترة A
          {(w.next.diffA || w.next.diffC) ? <span className="block mt-1">عن الأسبوع ده: {w.next.diffA >= 0 ? "+" : ""}{w.next.diffA} A، {w.next.diffC >= 0 ? "+" : ""}{w.next.diffC} C</span> : null}</p>
        <div className="mt-3 flex gap-2"><Link href={`/plans?view=list&planId=${w.next.id}`} className="flex min-h-10 flex-1 items-center justify-center rounded-xl border border-[var(--border)] bg-white text-xs font-bold">راجعها</Link>
          {w.next.status === "draft" && !isAdmin && <button type="button" onClick={() => void submitNext()} className="min-h-10 flex-1 rounded-xl bg-[var(--navy)] text-xs font-bold text-white">ابعتها للاعتماد كما هي</button>}</div>
      </> : <><p className="mt-1 text-xs text-[var(--muted)]">لسه مفيش خطة للأسبوع الجاي.</p>{!isAdmin && <button type="button" onClick={() => void draftNext()} className="mt-3 min-h-10 w-full rounded-xl bg-[var(--navy)] text-xs font-bold text-white">اعملّي مسودة من الدكاترة المحتاجين زيارة</button>}</>}
    </section>}
  </>;

  return (
    <div className="space-y-4">
      {!embedded && <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-extrabold text-[var(--navy)]">{isAdmin ? "خطة المندوب" : "خطتي"}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${sc}`}>{sl}</span>
        <div className="mr-auto flex items-center rounded-2xl border border-[var(--border)] bg-white">
          <button type="button" aria-label="الأسبوع اللي فات" onClick={() => setStart(addDays(w.start, -7))} className="grid h-10 w-10 place-items-center">›</button>
          <span className="px-2 text-sm font-bold">{w.start <= w.today && w.today <= addDays(w.start, 6) ? "الأسبوع ده" : w.start > w.today ? "الأسبوع الجاي" : "أسبوع فات"} · {range(w.start, w.end)}</span>
          <button type="button" aria-label="الأسبوع الجاي" onClick={() => setStart(addDays(w.start, 7))} className="grid h-10 w-10 place-items-center">‹</button></div>
      </div>}
      {note && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900"><b>المدير طالب تعديل:</b> {note} — <Link href="/plans?view=list" className="font-bold underline">عدّلها</Link></div>}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Kpi label="التنفيذ" value={`${k.done}/${k.planned}`} sub={k.planned ? (k.label === "ok" ? "ماشي تمام" : k.label === "risk" ? "متأخر كتير" : "متأخر شوية") : "مفيش زيارات في الخطة"} ring={k.planned ? Math.round(k.done / k.planned * 100) : 0} />
        <Kpi label="تغطية A" value={`${k.aDone}/${k.aPlanned}`} sub={k.aDue ? `${k.aDue} دكاترة A محتاجين زيارة` : "دكاترة A في الخطة"} />
        <Kpi label="زيارات فاتتك" value={String(k.missed)} sub={`${k.missed ? "رجّعها أو أجّلها" : "مفيش ✓"}${k.excused ? ` · ${k.excused} اتعذرت بوقت مكتبي` : ""}`} tone={k.missed ? "text-red-600" : "text-emerald-700"} />
        <Kpi label="متوقع تخلص" value={`${k.projected}/${k.planned}`} sub={`بمعدلك ده (${k.rate}%)`} />
      </div>
      <div className={embedded ? "space-y-4" : "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]"}>
        <div className="min-w-0 space-y-4">
          {missed.length > 0 && <section className="rounded-[26px] border border-red-200 bg-red-50/40 p-4"><h3 className="mb-2 font-extrabold text-red-700">فاتتك ({missed.length})</h3><ul className="space-y-2">{missed.map(row)}</ul></section>}
          <section className="rounded-[26px] border border-[var(--border)] bg-white p-4 shadow-sm">
            <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">{w.days.map(d => { const on = d.date === day; const isToday = d.date === w.today; return (
              <button key={d.date} type="button" onClick={() => setDay(d.date)} aria-pressed={on} className={`min-w-[104px] shrink-0 rounded-2xl border px-3 py-2 text-right transition ${on ? "border-teal-500 bg-teal-50 ring-2 ring-teal-100" : "border-[var(--border)] bg-white"}`}>
                <div className="flex items-center gap-1 text-sm font-extrabold text-[var(--navy)]">{dayName(d.date)}{isToday && <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />}</div>
                <div className="text-[10.5px] text-[var(--muted)]">{d.count ? `✓ ${d.done}/${d.count}` : "فاضي"}{d.cities[0] ? ` · ${d.cities[0]}` : ""}</div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full bg-teal-500 transition-all duration-700" style={{ width: `${d.count ? d.done / d.count * 100 : 0}%` }} /></div>
              </button>); })}</div>
            <div className="mb-2 flex items-baseline justify-between"><h3 className="font-extrabold text-[var(--navy)]">{day === w.today ? "مسار النهارده" : `يوم ${dayName(day)}`} <span className="text-xs font-normal text-[var(--muted)]">{dm(day)}</span></h3><span className="text-[11px] text-[var(--muted)]">{dayItems.length} زيارة · مترتبين حسب المدينة والعيادة</span></div>
            {!dayItems.length && <div className="rounded-2xl border border-dashed border-[var(--border-strong)] p-6 text-center text-sm text-[var(--muted)]">اليوم ده فاضي{w.suggestions.some(s => s.day === day) ? " — شوف الاقتراحات" : ""}</div>}
            {cities.map(c => <div key={c} className="mb-3 last:mb-0"><div className="mb-1.5 text-xs font-extrabold text-[var(--navy)]">{c} <span className="font-normal text-[var(--muted)]">· {dayItems.filter(i => (i.city || "—") === c).length}</span></div>
              <ul className="space-y-2">{dayItems.filter(i => (i.city || "—") === c).map(row)}</ul></div>)}
            {(k.unplanned > 0 || k.cancelled > 0) && <p className="mt-3 text-[11px] text-[var(--muted)]">{k.unplanned ? `${k.unplanned} زيارات اتعملت من برّه الخطة` : ""}{k.unplanned && k.cancelled ? " · " : ""}{k.cancelled ? `${k.cancelled} اتلغت` : ""}</p>}
          </section>
        </div>
        <div className="space-y-4">{side}</div>
      </div>
    </div>
  );
}
