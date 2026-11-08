"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { OFFICE_KINDS } from "@/lib/office-kinds";
import { riyadhToday, addDays } from "@/lib/fmt";

type Entry = { id: string; kind: string; minutes: number; from_time: string | null; to_time: string | null; note: string | null };
type Sum = { day: string; entries: Entry[]; minutes: number; planned: number; base: number; fieldMin: number; expected: number };
const DUR: Array<[string, number]> = [["نص ساعة", 30], ["ساعة", 60], ["ساعتين", 120], ["3 ساعات", 180], ["نص يوم", 240], ["يوم كامل", 480]];
const L = "ar-EG-u-nu-latn";
const hrs = (m: number) => m % 60 === 0 ? `${m / 60} ساعة` : m < 60 ? `${m} دقيقة` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} ساعة`;

/** Log time that wasn't field work (office, meeting, training…) in three taps, so the day's expected visits shrink with it. */
export default function OfficeTimeClient() {
  const toast = useToast();
  const today = riyadhToday();
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState(""); const [min, setMin] = useState(0);
  const [range, setRange] = useState(false); const [from, setFrom] = useState("09:00"); const [to, setTo] = useState("11:00");
  const [day, setDay] = useState(today); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const [sum, setSum] = useState<Sum | null>(null); const [saved, setSaved] = useState<Sum | null>(null);
  useEffect(() => { fetch(`/api/my/office-time?day=${day}`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => j && setSum(j)).catch(() => {}); }, [day]);
  const go = (n: number) => window.setTimeout(() => setStep(n), 320);
  const tMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const dur = range ? Math.max(0, tMin(to) - tMin(from)) : min;
  const base = sum?.base || 8, used = sum?.minutes || 0;
  const field = Math.max(0, 480 - Math.min(480, used + dur)), exp = Math.round(base * field / 480);

  async function save() {
    setBusy(true);
    const r = await fetch("/api/my/office-time", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(range ? { kind, from, to, day, note } : { kind, minutes: min, day, note }) });
    const j = await r.json().catch(() => null); setBusy(false);
    if (!r.ok) { toast(j?.error || "تعذر التسجيل", "error"); return; }
    setSum(j); setSaved(j);
  }
  async function remove(id: string) {
    const r = await fetch(`/api/my/office-time?id=${id}`, { method: "DELETE" }); const j = await r.json().catch(() => null);
    if (r.ok) { setSum(j); toast("اتشال", "success"); } else toast(j?.error || "تعذر", "error");
  }
  const reset = () => { setSaved(null); setStep(1); setKind(""); setMin(0); setRange(false); setNote(""); };
  const K = OFFICE_KINDS[kind];
  const dayLabel = (d: string) => d === today ? "النهارده" : d === addDays(today, -1) ? "امبارح" : new Intl.DateTimeFormat(L, { weekday: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

  const tabs = <div className="grid grid-cols-2 gap-1 rounded-2xl border border-[var(--border)] bg-white p-1 shadow-sm">
    <Link href="/visits/new" className="flex min-h-11 items-center justify-center rounded-xl text-sm font-extrabold text-[var(--muted)] transition hover:text-[var(--navy)]">🩺 زيارة</Link>
    <span className="flex min-h-11 items-center justify-center rounded-xl bg-[var(--navy)] text-sm font-extrabold text-white shadow">💼 وقت مكتبي / اجتماع</span>
  </div>;

  if (saved) return <div className="mx-auto max-w-xl space-y-4">
    {tabs}
    <section className="es-card-in rounded-[28px] bg-gradient-to-bl from-[#0b2a2f] via-[#10484f] to-[#156067] p-6 text-center text-white shadow-lg">
      <div className="ot-burst mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#33b3a6] text-4xl font-extrabold text-[#0b2a2f]">✓</div>
      <h2 className="mt-4 text-2xl font-extrabold">اتسجل ✓</h2>
      <p className="mt-2 text-sm text-white/80">{saved.day === today ? "هدفك النهارده" : `هدف ${dayLabel(saved.day)}`} بقى <b className="text-[#e7c977]">{saved.expected} زيارات</b> بدل {saved.base}</p>
      <p className="mt-1 text-[12px] text-white/60">إجمالي وقتك المكتبي في اليوم ده: {hrs(saved.minutes)}</p>
      <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={reset} className="min-h-12 rounded-2xl border border-white/25 font-bold">＋ وقت تاني</button><Link href="/" className="grid min-h-12 place-items-center rounded-2xl bg-[#c9a24a] font-extrabold text-[#0b2a2f]">الرئيسية</Link></div>
    </section>
    <Style />
  </div>;

  return <div className="mx-auto max-w-xl space-y-4 pb-24">
    <div><h1 className="text-2xl font-extrabold text-[var(--navy)]">وقت مش زيارة</h1><p className="mt-0.5 text-sm text-[var(--muted)]">سجّل الوقت المكتبي أو الاجتماعات عشان يومك يتحسب صح</p></div>
    {tabs}
    {(kind || dur > 0) && <div className="flex flex-wrap gap-2">
      {kind && <button type="button" onClick={() => setStep(1)} className="rounded-full bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800">{K?.icon} {K?.label} · ✎</button>}
      {step > 2 && dur > 0 && <button type="button" onClick={() => setStep(2)} className="rounded-full bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800">{range ? `${from}–${to}` : hrs(dur)} · ✎</button>}
    </div>}

    <div key={step} className="ot-in">
      {step === 1 && <section>
        <p className="text-xs font-bold text-teal-600">عشان يومك يتحسب صح</p><h2 className="mt-1 text-2xl font-extrabold text-[var(--navy)]">كنت فين؟</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">الوقت ده بيتشال من وقتك الميداني ومن عدد الزيارات المتوقع</p>
        <div className="mt-4 grid grid-cols-2 gap-3">{Object.entries(OFFICE_KINDS).map(([k, v]) => <button key={k} type="button" onClick={() => { setKind(k); go(2); }}
          className={`ot-tap flex min-h-24 flex-col items-center justify-center gap-1 rounded-[22px] border text-base font-extrabold shadow-sm transition ${kind === k ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--border)] bg-white text-[var(--navy)] hover:border-teal-500"}`}><span className="text-2xl">{v.icon}</span>{v.label}</button>)}</div>
      </section>}

      {step === 2 && <section>
        <p className="text-xs font-bold text-teal-600">المدة</p><h2 className="mt-1 text-2xl font-extrabold text-[var(--navy)]">قد إيه؟</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">اختار مدة جاهزة، أو حدّدها بنفسك من غير حدود لحد يوم كامل</p>
        <div className="mt-4 grid grid-cols-3 gap-3">{DUR.map(([l, m]) => <button key={l} type="button" onClick={() => { setRange(false); setMin(m); go(3); }}
          className={`ot-tap min-h-20 rounded-[22px] border text-base font-extrabold shadow-sm transition ${!range && min === m ? "border-[var(--navy)] bg-[var(--navy)] text-white" : m >= 240 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-[var(--border)] bg-white text-[var(--navy)] hover:border-teal-500"}`}>{l}</button>)}</div>
        <div className="mt-4 rounded-[22px] border border-[var(--border)] bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2"><span className="text-sm font-extrabold text-[var(--navy)]">مدة تانية</span>
            <span className="flex items-center gap-2"><button type="button" aria-label="أقل" onClick={() => { setRange(false); setMin(m => Math.max(15, (m || 60) - 15)); }} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] text-lg font-bold">−</button>
              <b className="min-w-[84px] text-center text-[var(--navy)]">{hrs(!range && min ? min : 60)}</b>
              <button type="button" aria-label="أكتر" onClick={() => { setRange(false); setMin(m => Math.min(600, (m || 60) + 15)); }} className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--navy)] text-lg font-bold text-white">+</button></span></div>
          <button type="button" onClick={() => setRange(r => !r)} className="mt-3 w-full text-center text-sm font-bold text-[var(--sky-deep)]">{range ? "▴ إخفاء من / إلى" : "🕘 حدّد من / إلى"}</button>
          {range && <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[11px] font-bold text-[var(--muted)]">من<input type="time" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2 text-base" /></label>
            <label className="text-[11px] font-bold text-[var(--muted)]">إلى<input type="time" value={to} onChange={e => setTo(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2 text-base" /></label></div>}
          <button type="button" disabled={range && dur < 5} onClick={() => { if (!range && !min) setMin(60); setStep(3); }} className="mt-3 min-h-12 w-full rounded-2xl bg-[var(--navy)] font-extrabold text-white disabled:opacity-40">تمام ✓</button>
        </div>
      </section>}

      {step === 3 && <section className="space-y-4">
        <div><p className="text-xs font-bold text-teal-600">آخر خطوة</p><h2 className="mt-1 text-2xl font-extrabold text-[var(--navy)]">راجع وسجّل</h2></div>
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2"><b className="text-lg text-[var(--navy)]">{K?.icon} {K?.label}</b><span className="rounded-full bg-teal-50 px-3 py-1.5 text-sm font-extrabold text-teal-800">{range ? `${from} – ${to} · ` : ""}{hrs(dur)}</span></div>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">{[0, 1, 2].map(i => addDays(today, -i)).map(d => <button key={d} type="button" onClick={() => setDay(d)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${day === d ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)] text-[var(--muted)]"}`}>{dayLabel(d)}</button>)}</div>
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="ملاحظة (اختياري): اجتماع مع المدير، تجهيز طلبيات…" className="mt-3 min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm outline-none focus:border-teal-500" />
        </div>
        <div className="rounded-[24px] bg-gradient-to-bl from-[#0b2a2f] to-[#156067] p-4 text-white shadow">
          <p className="text-[11px] font-bold text-white/60">تأثيره على يومك</p>
          <p className="mt-1 font-extrabold">يومك 8 ساعات ← <span className="text-[#8de2d7]">{hrs(field) === "0 ساعة" ? "مفيش وقت ميداني" : `${hrs(field)} ميداني`}</span></p>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-white/10"><span className="h-full bg-[#33b3a6] transition-all duration-700" style={{ width: `${field / 480 * 100}%` }} /><span className="h-full bg-[#c9a24a] transition-all duration-700" style={{ width: `${100 - field / 480 * 100}%` }} /></div>
          <div className="mt-1.5 flex justify-between text-[10.5px] text-white/70"><span>🟢 ميداني</span><span>🟡 مكتبي{used ? ` (منهم ${hrs(used)} متسجلين قبل كده)` : ""}</span></div>
          <p className="mt-3 rounded-2xl bg-white/10 p-3 text-sm">المتوقع {day === today ? "النهارده" : dayLabel(day)}: <b>{base} زيارات</b> ← <b className="text-[#e7c977]">{exp} زيارات</b>{sum?.planned ? <span className="block text-[11px] text-white/60">من خطتك المعتمدة ({sum.planned} زيارة)</span> : null}</p>
        </div>
        <button type="button" disabled={busy || dur < 5 || !kind} onClick={() => void save()} className="ot-glow flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#c9a24a] text-lg font-extrabold text-[#0b2a2f] transition active:scale-[.98] disabled:opacity-50">{busy ? "بسجّل…" : "✓ سجّل الوقت"}</button>
        <p className="text-center text-[11px] text-[var(--muted)]">هيظهر للمدير في خطتك وتقرير الأسبوع</p>
      </section>}
    </div>

    {sum && sum.entries.length > 0 && <section className="rounded-[24px] border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between"><b className="text-[var(--navy)]">متسجّل {dayLabel(sum.day)}</b><span className="text-xs font-bold text-[var(--muted)]">{hrs(sum.minutes)} · المتوقع {sum.expected} زيارات</span></div>
      <ul className="space-y-1.5">{sum.entries.map(e => <li key={e.id} className="flex items-center gap-2 rounded-xl bg-[var(--bg)] px-3 py-2 text-sm">
        <span>{OFFICE_KINDS[e.kind]?.icon}</span><span className="min-w-0 flex-1 truncate font-bold">{OFFICE_KINDS[e.kind]?.label || e.kind}{e.note ? <span className="font-normal text-[var(--muted)]"> · {e.note}</span> : null}</span>
        <span className="shrink-0 text-xs font-bold text-[var(--navy)]">{e.from_time ? `${e.from_time}–${e.to_time}` : hrs(e.minutes)}</span>
        <button type="button" onClick={() => void remove(e.id)} aria-label="شيل" className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-red-50 hover:text-red-600">✕</button></li>)}</ul>
    </section>}
    <Style />
  </div>;
}

function Style() {
  return <style>{`
@keyframes ot-in{from{opacity:0;transform:translateX(-18px)}to{opacity:1;transform:none}}
@keyframes ot-burst{0%{transform:scale(.3);opacity:0}70%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
@keyframes ot-glow{0%,100%{box-shadow:0 8px 22px -8px rgba(201,162,74,.7)}50%{box-shadow:0 8px 30px -4px rgba(201,162,74,.95)}}
.ot-in{animation:ot-in .35s cubic-bezier(.2,.8,.2,1) both}.ot-burst{animation:ot-burst .5s ease-out both}.ot-glow{animation:ot-glow 2.4s ease-in-out infinite}
.ot-tap:active{transform:scale(.96)}
@media (prefers-reduced-motion:reduce){.ot-in,.ot-burst,.ot-glow{animation:none}}`}</style>;
}
