"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import WeekBoard, { PLAN_STATUS } from "./WeekBoard";
import { addDays, DAY_AR, weekday } from "@/lib/plan-week-core";

type Team = {
  start: string; end: string; today: string;
  kpi: { reps: number; approved: number; pending: number; exec: number; planned: number; done: number; aPlanned: number; aDone: number; unplanned: number };
  board: Array<{ id: string; name: string; last: string | null; status: string; done: number; missed: number; planned: number; projected: number; rate: number; label: string; aPlanned: number; aDone: number; unplanned: number; cancelRate: number; heat: Array<{ date: string; planned: number; done: number; past: boolean }>; emptyDays: string[] }>;
  plansPending: Array<{ id: string; user_id: string; name: string; ps: string; pe: string; period: string; visits: number; checks: Array<{ ok: boolean; text: string }> }>;
  requests: Array<{ id: string; plan_id: string; name: string; note: string; what: string; created_at: string }>;
  smart: Array<{ kind: string; rep_id: string; rep: string; text: string; sub: string; action: string | null; doctors?: string[]; days?: string[]; date?: string }>;
  trend: Array<{ day: string; planned: number; done: number }>;
};
const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
const range = (a: string, b: string) => `${Number(a.slice(8, 10))}–${Number(b.slice(8, 10))} ${new Intl.DateTimeFormat("ar-EG", { month: "long", timeZone: "UTC" }).format(new Date(`${b}T12:00:00Z`))}`;
const ago = (t: string | null) => { if (!t) return "مفيش زيارات"; const m = Math.round((Date.now() - Date.parse(t)) / 6e4); return m < 60 ? `آخر زيارة من ${Math.max(1, m)} دقيقة` : m < 1440 ? `آخر زيارة من ${Math.round(m / 60)} ساعة` : `آخر زيارة من ${Math.round(m / 1440)} يوم`; };
const initials = (n: string) => n.split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase();
const PACE: Record<string, [string, string]> = { ok: ["على الطريق", "text-emerald-700"], behind: ["متأخر", "text-amber-700"], risk: ["خطر", "text-red-600"], none: ["مفيش خطة", "text-slate-500"] };

function Kpi({ label, value, sub, tone = "text-[var(--navy)]", action }: { label: string; value: string; sub: string; tone?: string; action?: React.ReactNode }) {
  return <div className="es-card-in rounded-[22px] border border-[var(--border)] bg-white p-3.5 shadow-sm"><div className="flex items-center justify-between text-[11px] text-[var(--muted)]"><span>{label}</span>{action}</div>
    <div className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</div><div className="text-[10.5px] text-[var(--muted)]">{sub}</div></div>;
}

/** Admin: the team's week — decisions waiting, each rep's execution, smart suggestions, last 7 working days. */
export default function TeamBoard() {
  const toast = useToast();
  const [start, setStart] = useState(""); const [t, setT] = useState<Team | null>(null);
  const [rep, setRep] = useState<{ id: string; name: string } | null>(null);
  const [ask, setAsk] = useState<{ id: string; note: string } | null>(null); const [busy, setBusy] = useState("");
  const load = useCallback(() => { fetch(`/api/plans/team${start ? `?start=${start}` : ""}`).then(r => r.ok ? r.json() : null).then(j => j ? setT(j) : toast("تعذر تحميل خطط الفريق", "error")).catch(() => toast("تعذر تحميل خطط الفريق", "error")); }, [start, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!rep) return; const k = (e: KeyboardEvent) => e.key === "Escape" && setRep(null); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [rep]);

  async function decide(id: string, status: "approved" | "needs_revision", note = "") {
    setBusy(id); const r = await fetch(`/api/plans/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, admin_note: note }) });
    const j = await r.json().catch(() => null); setBusy(""); setAsk(null);
    if (r.ok) { toast(status === "approved" ? "اتعتمدت ✓" : "اتبعت طلب التعديل للمندوب", "success"); load(); } else toast(j?.error || "تعذر", "error");
  }
  async function review(id: string, ok: boolean) {
    setBusy(id); const r = await fetch(`/api/agenda/requests/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: ok ? "approved" : "rejected" }) });
    const j = await r.json().catch(() => null); setBusy("");
    if (r.ok) { toast(ok ? "اتوافق على الطلب ✓" : "اترفض الطلب", "success"); load(); } else toast(j?.error || "تعذر", "error");
  }
  async function act(s: Team["smart"][number]) {
    if (!s.doctors?.length) return; setBusy(s.text); let ok = 0, fail = 0;
    for (let i = 0; i < s.doctors.length; i++) {
      const date = s.date || s.days?.[i] || addDays(t!.start, 7);
      const r = await fetch("/api/agenda/plan-items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date, doctorId: s.doctors[i], repId: s.rep_id }) });
      if (r.ok) ok++; else fail++;
    }
    setBusy(""); toast(`${ok} اتضافوا لخطة ${s.rep}${fail ? ` · ${fail} فشلوا` : ""}`, fail && !ok ? "error" : "success"); load();
  }

  if (!t) return <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="es-shimmer h-28 rounded-[26px]" />)}</div>;
  const k = t.kpi; const maxTrend = Math.max(1, ...t.trend.map(x => x.planned));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-extrabold text-[var(--navy)]">خطط الفريق</h2>
        <div className="mr-auto flex items-center rounded-2xl border border-[var(--border)] bg-white">
          <button type="button" aria-label="الأسبوع اللي فات" onClick={() => setStart(addDays(t.start, -7))} className="grid h-10 w-10 place-items-center">›</button>
          <span className="px-2 text-sm font-bold">{t.start <= t.today && t.today <= addDays(t.start, 6) ? "الأسبوع ده" : t.start > t.today ? "الأسبوع الجاي" : "أسبوع فات"} · {range(t.start, t.end)}</span>
          <button type="button" aria-label="الأسبوع الجاي" onClick={() => setStart(addDays(t.start, 7))} className="grid h-10 w-10 place-items-center">‹</button></div></div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="الخطط المعتمدة" value={`${k.approved}/${k.reps}`} sub="خطة الأسبوع" />
        <Kpi label="محتاج قرارك" value={String(k.pending)} sub="خطط وطلبات تعديل" tone={k.pending ? "text-amber-700" : "text-[var(--navy)]"} action={k.pending ? <a href="#decide" className="font-bold text-teal-700">راجع</a> : null} />
        <Kpi label="تنفيذ الفريق" value={`${k.exec}%`} sub={`${k.done} من ${k.planned} زيارة`} />
        <Kpi label="تغطية A" value={`${k.aDone}/${k.aPlanned}`} sub="دكاترة A في الخطط" />
        <Kpi label="زيارات من برّه الخطة" value={String(k.unplanned)} sub="اتعملت ومش متخططة" tone={k.unplanned ? "text-red-600" : "text-[var(--navy)]"} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.8fr)]">
        <div className="min-w-0 space-y-4">
          <section id="decide" className="rounded-[26px] border border-[var(--border)] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-50">⚡</span><h3 className="font-extrabold text-[var(--navy)]">محتاج قرارك</h3>{k.pending > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">{k.pending}</span>}</div>
            {!t.plansPending.length && !t.requests.length && <div className="rounded-2xl border border-dashed border-[var(--border-strong)] p-6 text-center text-sm text-[var(--muted)]">✓ مفيش حاجة مستنياك</div>}
            <div className="space-y-2.5">
              {t.plansPending.map(p => <article key={p.id} className="es-card-in rounded-2xl border border-[var(--border)] p-3.5">
                <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--sky-soft)] text-xs font-extrabold text-[var(--navy)]">{initials(p.name)}</span>
                  <div className="min-w-0 flex-1"><div className="font-extrabold" dir="auto">{p.name}</div><div className="text-[11px] text-[var(--muted)]">{p.period === "daily" ? "خطة يوم" : "خطة أسبوع"} {dm(p.ps)}{p.pe !== p.ps ? `–${dm(p.pe)}` : ""} · {p.visits} زيارة</div>
                    <div className="mt-2 flex flex-wrap gap-1">{p.checks.map(c => <span key={c.text} className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${c.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{c.ok ? "✓" : "⚠️"} {c.text}</span>)}</div></div>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">مستنية الاعتماد</span></div>
                {ask?.id === p.id ? <div className="es-pop mt-3 space-y-2"><textarea value={ask.note} onChange={e => setAsk({ id: p.id, note: e.target.value })} rows={2} className="w-full rounded-xl border border-[var(--border)] p-2 text-sm" />
                  <div className="flex gap-2"><button type="button" disabled={busy === p.id || ask.note.trim().length < 3} onClick={() => void decide(p.id, "needs_revision", ask.note.trim())} className="min-h-9 flex-1 rounded-xl bg-[var(--navy)] text-xs font-bold text-white disabled:opacity-50">ابعت طلب التعديل</button><button type="button" onClick={() => setAsk(null)} className="min-h-9 rounded-xl border border-[var(--border)] px-3 text-xs font-bold">إلغاء</button></div></div>
                  : <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy === p.id} onClick={() => void decide(p.id, "approved")} className="min-h-9 rounded-xl bg-[var(--navy)] px-4 text-xs font-bold text-white">✓ اعتمد</button>
                    <button type="button" onClick={() => setAsk({ id: p.id, note: p.checks.filter(c => !c.ok).map(c => c.text).join(" — ") ? `محتاج تعديل: ${p.checks.filter(c => !c.ok).map(c => c.text).join("، ")}` : "" })} className="min-h-9 rounded-xl border border-[var(--border)] px-3 text-xs font-bold">✎ اطلب تعديل</button>
                    <Link href={`/plans?view=list&planId=${p.id}`} className="flex min-h-9 items-center px-2 text-xs font-bold text-teal-700">شوف الخطة ←</Link></div>}
              </article>)}
              {t.requests.map(r => <article key={r.id} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] p-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--sky-soft)] text-xs font-extrabold text-[var(--navy)]">{initials(r.name)}</span>
                <div className="min-w-0 flex-1"><div className="text-sm font-bold" dir="auto">{r.name}: {r.what || "تعديل خطة"}</div>{r.note && <div className="truncate text-[11px] text-[var(--muted)]" dir="auto">السبب: {r.note}</div>}</div>
                <button type="button" aria-label="وافق" disabled={busy === r.id} onClick={() => void review(r.id, true)} className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">✓</button>
                <button type="button" aria-label="ارفض" disabled={busy === r.id} onClick={() => void review(r.id, false)} className="grid h-9 w-9 place-items-center rounded-xl bg-red-50 text-red-600">✕</button>
              </article>)}
            </div>
          </section>

          <section className="rounded-[26px] border border-[var(--border)] bg-white shadow-sm">
            <div className="p-4 pb-2"><h3 className="font-extrabold text-[var(--navy)]">👥 لوحة الفريق</h3><p className="text-[11px] text-[var(--muted)]">دوس على أي مندوب تشوف أسبوعه يوم بيوم</p></div>
            <ul className="divide-y divide-[var(--border)]">{t.board.map(b => { const [pl, pc] = PACE[b.label] || PACE.none; const [sl, sc] = PLAN_STATUS[b.status] || PLAN_STATUS.none; return (
              <li key={b.id}><button type="button" onClick={() => setRep({ id: b.id, name: b.name })} className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 py-3 text-right transition hover:bg-[var(--bg)] md:grid-cols-[auto_minmax(0,1.4fr)_repeat(3,minmax(0,.6fr))_auto]">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--sky-soft)] text-xs font-extrabold text-[var(--navy)]">{initials(b.name)}</span>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><b dir="auto">{b.name}</b><span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${sc}`}>{sl}</span></div>
                  <div className="mt-1.5 flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full bg-teal-500 transition-all duration-700" style={{ width: `${b.planned ? b.done / b.planned * 100 : 0}%` }} /></div><span className="text-[10.5px] text-[var(--muted)]">{b.done}/{b.planned}</span></div>
                  <div className="mt-1 text-[10.5px] text-[var(--muted)] md:hidden">A {b.aDone}/{b.aPlanned} · فاتت {b.missed} · <span className={`font-bold ${pc}`}>{pl}</span> · {ago(b.last)}</div></div>
                <div className="hidden text-center md:block"><div className="text-[10px] text-[var(--muted)]">تغطية A</div><b className="text-sm">{b.aDone}/{b.aPlanned}</b></div>
                <div className="hidden text-center md:block"><div className="text-[10px] text-[var(--muted)]">فاتت</div><b className={`text-sm ${b.missed ? "text-red-600" : ""}`}>{b.missed}</b></div>
                <div className="hidden text-center md:block"><b className={`text-xs ${pc}`}>{pl}</b><div className="text-[10px] text-[var(--muted)]">{ago(b.last)}</div></div>
                <div className="hidden gap-1 md:flex" aria-label="أيام الأسبوع">{b.heat.map(h => { const r = h.planned ? h.done / h.planned : 0; return <span key={h.date} title={`${DAY_AR[weekday(h.date)]}: ${h.done}/${h.planned}`}
                  className={`h-6 w-3 rounded ${!h.planned ? "bg-slate-100" : !h.past ? "bg-[var(--sky-soft)]" : r >= 0.8 ? "bg-teal-500" : r >= 0.5 ? "bg-teal-300" : r > 0 ? "bg-amber-300" : "bg-red-300"}`} />; })}</div>
              </button></li>); })}</ul>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-[26px] border border-[var(--border)] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-50">✨</span><div><h3 className="font-extrabold text-[var(--navy)]">اقتراحات ذكية</h3><p className="text-[11px] text-[var(--muted)]">من التنفيذ الفعلي والدكاترة المحتاجين زيارة</p></div></div>
            {!t.smart.length && <p className="text-center text-sm text-[var(--muted)]">✓ مفيش اقتراحات الأسبوع ده</p>}
            <ul className="space-y-2">{t.smart.map(s => <li key={s.text} className="rounded-2xl border border-[var(--border)] p-3">
              <div className="flex items-start gap-2.5"><span>💡</span><div className="min-w-0 flex-1"><div className="text-xs font-bold leading-5 text-[var(--navy)]" dir="auto">{s.text}</div><div className="truncate text-[11px] text-[var(--muted)]" dir="auto">{s.sub}</div></div>
                {s.action ? <button type="button" disabled={busy === s.text} onClick={() => void act(s)} className="shrink-0 rounded-xl bg-teal-50 px-2.5 py-1.5 text-[11px] font-bold text-teal-800">{busy === s.text ? "…" : s.action}</button>
                  : s.rep_id ? <button type="button" onClick={() => setRep({ id: s.rep_id, name: s.rep })} className="shrink-0 rounded-xl bg-[var(--bg)] px-2.5 py-1.5 text-[11px] font-bold">شوف</button>
                  : s.kind === "reorder" ? <Link href="/doctors?tag=reorder" className="shrink-0 rounded-xl bg-[var(--bg)] px-2.5 py-1.5 text-[11px] font-bold">شوفهم</Link> : null}</div>
            </li>)}</ul>
          </section>
          <section className="rounded-[26px] border border-[var(--border)] bg-white p-4 shadow-sm">
            <h3 className="font-extrabold text-[var(--navy)]">صحة التنفيذ <span className="text-[11px] font-normal text-[var(--muted)]">آخر 7 أيام شغل · الخطط المعتمدة</span></h3>
            {!t.trend.length ? <p className="mt-3 text-center text-sm text-[var(--muted)]">لسه مفيش بيانات</p> : <div className="mt-4 flex h-36 items-end gap-2">{t.trend.map(x => { const pct = x.planned ? Math.round(x.done / x.planned * 100) : 0; return (
              <div key={x.day} className="flex flex-1 flex-col items-center gap-1"><span className="text-[10px] font-bold">{pct}%</span>
                <div className="relative w-full overflow-hidden rounded-t-lg bg-[var(--bg)]" style={{ height: `${Math.max(8, x.planned / maxTrend * 100)}px` }}><div className="absolute inset-x-0 bottom-0 rounded-t-lg bg-teal-400 transition-all duration-700" style={{ height: `${pct}%` }} /></div>
                <span className="text-[10px] text-[var(--muted)]">{DAY_AR[weekday(x.day)].replace("ال", "").slice(0, 3)}</span></div>); })}</div>}
          </section>
        </div>
      </div>

      {rep && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[60] bg-[var(--navy)]/25 backdrop-blur-[2px]" onClick={() => setRep(null)}>
          <section dir="rtl" role="dialog" aria-modal="true" aria-label={`خطة ${rep.name}`} onClick={e => e.stopPropagation()} className="es-drawer-in absolute inset-y-0 right-0 w-[min(720px,100vw)] overflow-y-auto bg-[var(--bg)] p-4 shadow-2xl sm:p-5">
            <div className="mb-3 flex items-center gap-2"><h2 className="text-lg font-extrabold text-[var(--navy)]" dir="auto">أسبوع {rep.name}</h2><button type="button" onClick={() => setRep(null)} aria-label="إغلاق" className="mr-auto grid h-9 w-9 place-items-center rounded-full bg-white">✕</button></div>
            <WeekBoard repId={rep.id} isAdmin embedded initialStart={t.start} />
          </section>
          <style>{`.es-drawer-in{animation:esIn .3s cubic-bezier(.2,.8,.2,1)}@keyframes esIn{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}`}</style>
        </div>, document.body)}
    </div>
  );
}
