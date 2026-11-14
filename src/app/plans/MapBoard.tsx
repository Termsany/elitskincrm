"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { planDays } from "./AreaBoard";
import { addDays, DAY_AR, weekday } from "@/lib/plan-week-core";

type Rep = { id: string; name: string; cities: string[]; assigned: boolean };
type City = { city: string; doctors: number; a: number; owners: string[]; aUnseenCount: number; aUnseen: Array<{ id: string; name: string; clinic: string }>; cells: Record<string, { required: number; done: number }> };
type Map_ = { month: string; reps: Rep[]; cities: City[] };
const key = (c: string) => c.trim().toLowerCase();
const cellTone = (c?: { required: number; done: number }) => !c ? "" : !c.required ? "bg-slate-50 text-slate-500" : c.done / c.required >= 0.8 ? "bg-emerald-50 text-emerald-700" : c.done / c.required >= 0.5 ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());

/** Admin: city × rep coverage this month, each rep's cities, and A doctors nobody visited yet (one tap into a rep's plan). */
export default function MapBoard() {
  const toast = useToast();
  const [m, setM] = useState<Map_ | null>(null);
  const [edit, setEdit] = useState<{ id: string; cities: string[] } | null>(null);
  const [open, setOpen] = useState(""); const [busy, setBusy] = useState(false);
  const [give, setGive] = useState<{ city: string; rep: string } | null>(null);
  const load = useCallback(() => { fetch("/api/plans/map").then(r => r.ok ? r.json() : null).then(j => j ? setM(j) : toast("تعذر تحميل التغطية", "error")).catch(() => toast("تعذر تحميل التغطية", "error")); }, [toast]);
  useEffect(() => { load(); }, [load]);

  async function saveCities() {
    if (!edit) return; setBusy(true);
    const r = await fetch("/api/plans/territory", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ repId: edit.id, cities: edit.cities }) });
    const j = await r.json().catch(() => null); setBusy(false);
    if (!r.ok) { toast(j?.error || "تعذر الحفظ", "error"); return; }
    toast("اتحفظت المدن ✓", "success"); setEdit(null); load();
  }
  async function assign(c: City, repId: string, date: string) {
    setBusy(true); let ok = 0, fail = 0;
    for (const d of c.aUnseen) { const r = await fetch("/api/agenda/plan-items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date, doctorId: d.id, repId }) }); if (r.ok) ok++; else fail++; }
    setBusy(false); setGive(null);
    toast(`${ok} اتضافوا لخطة ${m?.reps.find(r => r.id === repId)?.name}${fail ? ` · ${fail} فشلوا` : ""}`, fail && !ok ? "error" : "success"); load();
  }

  if (!m) return <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="es-shimmer h-28 rounded-[26px]" />)}</div>;
  const orphan = m.cities.filter(c => c.doctors && !c.owners.length && !m.reps.some(r => r.cities.some(x => key(x) === key(c.city))));
  const t = today(), days = planDays(t);
  const allCities = m.cities.map(c => c.city).filter(c => c !== "بدون مدينة");
  const lbl = (d: string) => d === t ? "النهارده" : d === addDays(t, 1) ? "بكرة" : DAY_AR[weekday(d)];

  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
      <div className="rounded-[22px] border border-[var(--border)] bg-white p-3.5 shadow-sm"><div className="text-[11px] text-[var(--muted)]">أطباء A ما اتزاروش الشهر ده</div><div className="text-2xl font-extrabold text-red-600">{m.cities.reduce((a, c) => a + c.aUnseenCount, 0)}</div></div>
      <div className="rounded-[22px] border border-[var(--border)] bg-white p-3.5 shadow-sm"><div className="text-[11px] text-[var(--muted)]">مدن مالهاش مندوب</div><div className={`text-2xl font-extrabold ${orphan.length ? "text-amber-700" : "text-emerald-700"}`}>{orphan.length}</div></div>
      <div className="col-span-2 rounded-[22px] border border-[var(--border)] bg-white p-3.5 shadow-sm lg:col-span-1"><div className="text-[11px] text-[var(--muted)]">مدن كل مندوب</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">{m.reps.map(r => <button key={r.id} type="button" onClick={() => setEdit({ id: r.id, cities: r.cities })} className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-bold hover:border-teal-400" dir="auto">✎ {r.name} ({r.cities.length}){!r.assigned && r.cities.length ? " · تلقائي" : ""}</button>)}</div></div>
    </div>

    {edit && <section className="es-pop rounded-[26px] border border-teal-200 bg-white p-4 shadow-sm">
      <h3 className="font-extrabold text-[var(--navy)]" dir="auto">مدن {m.reps.find(r => r.id === edit.id)?.name}</h3>
      <div className="mt-3 flex flex-wrap gap-1.5">{allCities.map(c => { const on = edit.cities.some(x => key(x) === key(c)); return <button key={c} type="button" onClick={() => setEdit({ ...edit, cities: on ? edit.cities.filter(x => key(x) !== key(c)) : [...edit.cities, c] })}
        className={`rounded-full px-3 py-1.5 text-xs font-bold ${on ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)] text-[var(--muted)]"}`} dir="auto">{c}</button>; })}</div>
      <div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={() => void saveCities()} className="h-10 rounded-xl bg-[var(--navy)] px-4 text-sm font-bold text-white disabled:opacity-50">حفظ</button>
        <button type="button" onClick={() => setEdit({ ...edit, cities: [] })} className="h-10 rounded-xl border border-[var(--border)] px-3 text-sm font-bold">تلقائي (حسب شغله)</button>
        <button type="button" onClick={() => setEdit(null)} className="h-10 px-3 text-sm font-bold text-[var(--muted)]">إلغاء</button></div>
    </section>}

    <section className="overflow-x-auto rounded-[26px] border border-[var(--border)] bg-white shadow-sm">
      <table className="w-full min-w-[640px] text-sm">
        <thead><tr className="border-b border-[var(--border)] text-[11px] text-[var(--muted)]"><th className="p-3 text-right">المدينة</th><th className="p-3">أطباء</th>
          {m.reps.map(r => <th key={r.id} className="p-3" dir="auto">{r.name}</th>)}<th className="p-3">A ما اتزاروش</th></tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{m.cities.map(c => <Fragment key={c.city}><tr className={!c.owners.length && c.doctors ? "bg-amber-50/40" : ""}>
          <td className="p-3 font-bold" dir="auto">{c.city}</td><td className="p-3 text-center text-xs">{c.doctors} <span className="text-[var(--muted)]">· A {c.a}</span></td>
          {m.reps.map(r => { const x = c.cells[r.id]; return <td key={r.id} className="p-2 text-center">{x ? <span className={`inline-block min-w-14 rounded-lg px-2 py-1 text-xs font-bold ${cellTone(x)}`}>{x.done}/{x.required}</span> : <span className="text-[var(--muted)]">—</span>}</td>; })}
          <td className="p-2 text-center">{c.aUnseenCount ? <button type="button" onClick={() => setOpen(open === c.city ? "" : c.city)} className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{c.aUnseenCount} {open === c.city ? "▴" : "▾"}</button> : <span className="text-xs text-emerald-600">✓</span>}</td>
        </tr>
        {open === c.city && <tr><td colSpan={m.reps.length + 3} className="bg-[var(--bg)]/60 p-3">
          <div className="flex flex-wrap gap-1.5">{c.aUnseen.map(d => <Link key={d.id} href={`/doctors/${d.id}`} className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-[var(--navy)]" dir="auto">{d.name}{d.clinic ? ` · ${d.clinic}` : ""}</Link>)}</div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5"><span className="text-xs font-bold">ضيفهم لخطة:</span>
            {[...m.reps].sort((a, b) => Number(c.owners.includes(b.id)) - Number(c.owners.includes(a.id))).map(r => <button key={r.id} type="button" onClick={() => setGive({ city: c.city, rep: r.id })}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold ${give?.city === c.city && give.rep === r.id ? "bg-[var(--navy)] text-white" : "bg-white"}`} dir="auto">{r.name}</button>)}</div>
          {give?.city === c.city && <div className="es-pop mt-2 flex flex-wrap gap-1.5">{days.map(d => <button key={d} type="button" disabled={busy} onClick={() => void assign(c, give.rep, d)} className="rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">{lbl(d)} {Number(d.slice(8, 10))}/{Number(d.slice(5, 7))}</button>)}</div>}
        </td></tr>}</Fragment>)}</tbody>
      </table>
    </section>
  </div>;
}
