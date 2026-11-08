"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import RepSmartCard from "@/components/smart/RepSmartCard";
import HrHomeCard from "@/components/hr/HrHomeCard";
import CollectionsCard from "./CollectionsCard";
import { QuickFab } from "./admin/DashParts";
import type { RepWeek } from "@/lib/plan-week";
import { RepStyles, SmartStrip, WeekStrip, TasksCard, RecentVisits, type TaskRow, type RecentRow } from "./RepParts";

type PlanItem = { id: string; doctor_id: string; doctor_name: string; clinic_name: string | null; city: string | null; phone: string | null; classification: string | null; note: string | null; done: boolean; done_at: string | null };
type Home = {
  today: string; name: string; plan: PlanItem[]; followups: number; lateA: number; lateCount: number;
  late: Array<{ id: string; name: string; clinic: string; city: string; classification: string; overdue_days: number }>;
  pace: { target: number; mtd: number; projected: number; pct: number | null; day: number; days: number } | null;
  trend: Array<{ month: string; value: number }>; byProduct: Array<{ name: string; value: number }>;
  tasks: { open: number; late: number };
  nextBrief: { doctor_id: string; days: number | null; note: string | null; why: string | null } | null; taskList: TaskRow[]; recent: RecentRow[]; nextWeek: { start: string; plan: { id: string; status: string; visits: number } | null };
};
const k = (n: number) => Math.round(n).toLocaleString("en-US");
const L = "ar-EG-u-nu-latn";
const PRI: Record<string, { box: string; btn: string; bar: string }> = {
  A: { box: "border-red-200 bg-gradient-to-l from-red-50 to-white", btn: "bg-[#d64545] shadow-[0_8px_18px_-8px_#d64545]", bar: "#d64545" },
  B: { box: "border-amber-200 bg-gradient-to-l from-amber-50 to-white", btn: "bg-[#e9a23b] shadow-[0_8px_18px_-8px_#e9a23b]", bar: "#e9a23b" },
};
const PRI_DEFAULT = { box: "border-sky-200 bg-gradient-to-l from-sky-50 to-white", btn: "bg-[#3b82f6] shadow-[0_8px_18px_-8px_#3b82f6]", bar: "#3b82f6" };
const CLS: Record<string, string> = { A: "bg-emerald-50 text-emerald-700", B: "bg-sky-50 text-sky-700", C: "bg-amber-50 text-amber-800" };
const card = "es-card-in rounded-[28px] border border-[var(--border)] bg-white shadow-sm";

function useCount(v: number, ms = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(v); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const p = Math.min(1, (t - t0) / ms); setN(v * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [v, ms]);
  return n;
}
function Ring({ done, total }: { done: number; total: number }) {
  const size = 132, sw = 11, r = (size - sw) / 2, c = 2 * Math.PI * r, p = total ? done / total : 0;
  const [on, setOn] = useState(false); useEffect(() => { const t = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(t); }, []);
  return <div className="relative shrink-0" style={{ width: size, height: size }}>
    <svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={sw} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#33b3a6" strokeWidth={sw} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={on ? c * (1 - p) : c} style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)" }} /></svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center leading-none text-white"><b className="text-4xl font-extrabold">{done}</b><span className="mt-1 text-[11px] text-white/70">من {total}</span></div>
  </div>;
}
const Title = ({ icon, t, right }: { icon: string; t: string; right?: React.ReactNode }) => <div className="mb-3 flex items-center gap-2.5">
  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--sky-light)] text-[var(--navy)]"><Icon name={icon} size={19} /></span>
  <h2 className="min-w-0 flex-1 truncate text-[17px] font-extrabold text-[var(--navy)]">{t}</h2>{right}</div>;

/** Rep home: the day at a glance, today's route, smart suggestions, month target, collections, late doctors; leave & next week on the side. */
export default function RepHome() {
  const toast = useToast();
  const [d, setD] = useState<Home | null>(null); const [err, setErr] = useState(false);
  const [week, setWeek] = useState<RepWeek | null>(null);
  const [allPlan, setAllPlan] = useState(false); const [added, setAdded] = useState<string[]>([]); const [busy, setBusy] = useState("");
  const load = () => fetch("/api/my/home", { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject()).then(setD).catch(() => setErr(true));
  useEffect(() => { void load(); fetch("/api/plans/week", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(setWeek).catch(() => {}); }, []);

  const groups = useMemo(() => {
    const g = new Map<string, PlanItem[]>(); for (const p of d?.plan || []) { const c = p.city || "بدون مدينة"; g.set(c, [...(g.get(c) || []), p]); }
    return [...g.entries()];
  }, [d]);
  const mtd = useCount(d?.pace?.mtd || 0);
  if (err && !d) return <div className={`${card} p-8 text-center text-sm`}>تعذر تحميل يومك <button onClick={() => { setErr(false); void load(); }} className="mr-2 rounded-xl bg-[var(--navy)] px-3 py-1.5 font-bold text-white">إعادة المحاولة</button></div>;
  if (!d) return <div className="space-y-4"><div className="es-shimmer h-56 rounded-[28px]" /><div className="es-shimmer h-72 rounded-[28px]" /></div>;

  const total = d.plan.length, done = d.plan.filter(p => p.done).length, next = d.plan.find(p => !p.done);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", hour12: false }).format(new Date()));
  const hello = hour < 12 ? "صباح الخير" : hour < 17 ? "مساء النور" : "مساء الخير";
  const dateLabel = new Intl.DateTimeFormat(L, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d.today}T12:00:00Z`));
  const p = d.pace, pct = p?.pct ?? null, tone = pct === null ? "#3b90e8" : pct >= 100 ? "#1aa865" : pct >= 85 ? "#e99608" : "#ef4b4e";
  const maxT = Math.max(1, ...d.trend.map(t => t.value));
  const visibleIds = new Set((allPlan ? d.plan : [...d.plan.filter(x => !x.done).slice(0, 4), ...d.plan.filter(x => x.done)].slice(0, 4)).map(x => x.id));
  const wd = new Date(`${d.today}T12:00:00Z`).getUTCDay();

  async function addToPlan(doc: Home["late"][number]) {
    // next working day (Sun–Thu)
    let t = new Date(`${d!.today}T12:00:00Z`); do { t = new Date(t.getTime() + 864e5); } while (t.getUTCDay() === 5 || t.getUTCDay() === 6);
    setBusy(doc.id);
    const r = await fetch("/api/agenda/plan-items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doctorId: doc.id, date: t.toISOString().slice(0, 10) }) });
    const j = await r.json().catch(() => null); setBusy("");
    if (!r.ok && r.status !== 202) { toast(j?.error || "تعذر الإضافة", "error"); return; }
    if (r.status === 202) { setAdded(a => [...a, doc.id]); toast("خطتك معتمدة — اتبعت طلب للمدير يضيفه", "info"); return; }
    setAdded(a => [...a, doc.id]); toast(`اتضاف ${doc.name} لخطة ${new Intl.DateTimeFormat(L, { weekday: "long", timeZone: "UTC" }).format(t)} ✓`, "success");
  }
  async function draftWeek() {
    setBusy("week"); const r = await fetch("/api/plans/auto", { method: "POST" }); const j = await r.json().catch(() => null); setBusy("");
    const c = j?.created?.[0]; if (c) { toast(`اتجهزت مسودة ${c.visits} زيارة ✓`, "success"); location.assign(`/plans?planId=${c.plan_id}`); } else toast(j?.skipped?.[0]?.why || "تعذر تجهيز الخطة", "error");
  }

  /* ───── hero ───── */
  const hero = <section className="es-card-in relative overflow-hidden rounded-[28px] bg-gradient-to-bl from-[#0b2a2f] via-[#10484f] to-[#156067] p-5 text-white shadow-lg sm:p-6">
    <span className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full border-[40px] border-white/[0.04]" />
    <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4 sm:flex-1">
        {total ? <Ring done={done} total={total} /> : <span className="flex h-[96px] w-[96px] shrink-0 items-center justify-center rounded-full border-[10px] border-white/10 text-white/80"><Icon name="calendar" size={34} /></span>}
        <div className="min-w-0">
          <div className="text-[12px] font-bold text-white/60">يومك في نظرة</div>
          <div className="mt-1 text-xl font-extrabold leading-8 sm:text-2xl">{!total ? "مفيش خطة معتمدة النهارده" : done === total ? "خلّصت خطة النهارده 🎉" : `${done} اتعملت، ولسه قدامك ${total - done}`}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {d.followups > 0 && <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-bold">{d.followups} متابعة مستحقة</span>}
            {d.lateA > 0 && <a href="#late-doctors" className="rounded-full border border-amber-300/40 bg-amber-300/15 px-2.5 py-1 text-[11px] font-bold text-amber-100">{d.lateA} طبيب فئة A متأخر</a>}
            {d.tasks.open > 0 && <Link href="/work" className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-bold">{d.tasks.open} مهمة{d.tasks.late ? ` · ${d.tasks.late} متأخرة` : ""}</Link>}
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 pt-4 sm:w-[300px] sm:border-r sm:border-t-0 sm:pr-5 sm:pt-0">
        {next ? <>
          <div className="text-[11px] font-bold text-white/60">الزيارة الجاية</div>
          <div className="mt-0.5 truncate text-lg font-extrabold" dir="auto">{next.doctor_name}</div>
          <div className="truncate text-[12px] text-white/70" dir="auto">{[next.clinic_name, next.city].filter(Boolean).join(" · ")}</div>
          {d.nextBrief && d.nextBrief.doctor_id === next.doctor_id && (d.nextBrief.why || d.nextBrief.days !== null || d.nextBrief.note) && <div className="mt-2 rounded-xl bg-white/10 px-3 py-2 text-[11.5px] leading-5 text-white/85">
            {d.nextBrief.days !== null && <div>آخر زيارة من <b>{d.nextBrief.days}</b> يوم</div>}
            {d.nextBrief.why && <div className="font-bold text-amber-200">{d.nextBrief.why}</div>}
            {d.nextBrief.note && <div className="line-clamp-2 text-white/70" dir="auto">«{d.nextBrief.note}»</div>}</div>}
          <div className="mt-3 flex gap-2">
            <Link href={`/visits/new?doctorId=${next.doctor_id}`} className="rp-glow flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#c9a24a] px-4 text-sm font-extrabold text-[#0b2a2f] transition hover:-translate-y-0.5 hover:brightness-110 active:scale-95">ابدأ الزيارة ‹</Link>
            {next.phone && <a href={`tel:${next.phone}`} aria-label={`اتصل بـ ${next.doctor_name}`} className="flex min-h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-white/10 transition hover:bg-white/20 active:scale-95"><Icon name="phone" size={19} /></a>}
          </div>
        </> : <>
          <div className="text-[12px] text-white/70">{total ? "كل زيارات الخطة اتعملت" : "تقدر تسجّل زيارة أو تجهّز خطتك"}</div>
          <Link href="/visits/new" className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#c9a24a] px-4 text-sm font-extrabold text-[#0b2a2f] shadow-md transition hover:-translate-y-0.5">＋ سجّل زيارة</Link>
        </>}
        <a href={total ? "#today-plan" : "/plans"} className="mt-2 flex min-h-11 items-center justify-center rounded-2xl border border-white/20 text-sm font-bold text-white/90 transition hover:bg-white/10">{total ? "خطة اليوم" : "افتح الخطة"}</a>
      </div>
    </div>
  </section>;

  /* ───── today's plan ───── */
  const plan = total > 0 && <section id="today-plan" className={`${card} scroll-mt-24 p-4 sm:p-5`} style={{ animationDelay: "60ms" }}>
    <Title icon="calendar" t="خطة النهارده" right={<span className="text-[11.5px] text-[var(--muted)]">{total} زيارات · {groups.map(g => g[0]).join(" و")}</span>} />
    {groups.map(([city, rows]) => { const shown = rows.filter(r => visibleIds.has(r.id)); if (!shown.length) return null;
      return <div key={city} className="mb-1">
        {groups.length > 1 && <div className="mb-1 mt-2 flex items-center gap-2 text-[11px] font-extrabold text-[var(--muted)]"><Icon name="map" size={13} />{city}<span className="h-px flex-1 bg-[var(--border)]" /></div>}
        <ol className="relative space-y-1 before:absolute before:bottom-3 before:right-[19px] before:top-3 before:w-0.5 before:bg-[var(--border)]">
          {shown.map(r => { const isNext = next?.id === r.id;
            return <li key={r.id} className={`relative flex items-center gap-3 rounded-2xl px-1.5 py-2 transition ${isNext ? "bg-[var(--sky-light)] ring-1 ring-[var(--sky-border)]" : ""} ${r.done ? "opacity-60" : ""}`}>
              <span className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-extrabold ${r.done ? "border-emerald-500 bg-emerald-500 text-white" : isNext ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--border)] bg-white text-[var(--muted)]"}`}>{r.done ? "✓" : d.plan.indexOf(r) + 1}</span>
              <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><b className="truncate text-sm" dir="auto">{r.doctor_name}</b>{r.classification && <span className={`shrink-0 rounded-md px-1.5 text-[10px] font-extrabold ${CLS[r.classification] || "bg-slate-100"}`}>{r.classification}</span>}</div>
                <div className="truncate text-[11.5px] text-[var(--muted)]" dir="auto">{r.done ? `اتعملت ${r.done_at || ""}` : isNext ? "الجاية" : r.clinic_name}{r.done || isNext ? ` · ${r.clinic_name || ""}` : ""}</div></div>
              {!r.done && <Link href={`/visits/new?doctorId=${r.doctor_id}`} className={`shrink-0 rounded-xl px-3 py-2 text-[11.5px] font-bold transition ${isNext ? "bg-[var(--navy)] text-white" : "border border-[var(--border)] text-[var(--navy)] hover:border-[var(--navy)]"}`}>زيارة</Link>}
            </li>; })}
        </ol>
      </div>; })}
    {total > 4 && <button type="button" onClick={() => setAllPlan(!allPlan)} className="mt-2 w-full border-t border-[var(--border)] pt-3 text-center text-xs font-bold text-[var(--sky-deep)]">{allPlan ? "أقل ▴" : `عرض الكل (${total}) ▾`}</button>}
  </section>;

  /* ───── month target ───── */
  const target = <section className={`${card} p-4 sm:p-5`} style={{ animationDelay: "120ms" }}>
    <Title icon="trophy" t="هدفي الشهر ده" right={<Link href="/sales" className="text-[11.5px] font-bold text-[var(--sky-deep)]">التفاصيل ‹</Link>} />
    <div className="flex flex-wrap items-baseline gap-x-2"><b className="text-3xl font-extrabold text-[var(--navy)]">{k(mtd)}</b><span className="text-sm text-[var(--muted)]">ر.س{p?.target ? ` من ${k(p.target)}` : ""}</span></div>
    {p && p.target > 0 ? <>
      <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-[var(--bg)]">
        <div className="absolute inset-y-0 right-0 rounded-full opacity-25 transition-all duration-1000" style={{ width: `${Math.min(100, p.projected / p.target * 100)}%`, background: tone }} />
        <div className="absolute inset-y-0 right-0 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, p.mtd / p.target * 100)}%`, background: tone }} />
        <div className="absolute inset-y-0 w-0.5 bg-[var(--navy)]" style={{ right: `${Math.round(p.day / p.days * 100)}%` }} title="مكانك المفروض النهارده" />
      </div>
      <div className="mt-2 text-[12.5px] font-bold" style={{ color: tone }}>{pct !== null && pct >= 100 ? `على السرعة دي هتقفل على ${k(p.projected)} ر.س (${pct}%) 🎉` : `على السرعة دي هتقفل على ${k(p.projected)} ر.س (${pct}%) — محتاج ${k(Math.max(0, p.target - p.mtd))} كمان`}</div>
    </> : <div className="mt-2 text-[12px] text-[var(--muted)]">لسه ما اتحددلكش هدف الشهر ده</div>}
    <div className="mt-4 flex h-16 items-end gap-1.5" aria-label="مبيعات آخر 6 شهور">{d.trend.map((t, i) => <div key={t.month} className="group flex flex-1 flex-col items-center gap-1" title={`${k(t.value)} ر.س`}>
      <div className="w-full rounded-t-lg transition-all duration-700" style={{ height: `${Math.max(4, t.value / maxT * 52)}px`, background: i === d.trend.length - 1 ? "#33b3a6" : "#cfe7e4" }} />
      <span className="text-[9.5px] text-[var(--muted)]">{new Intl.DateTimeFormat(L, { month: "short", timeZone: "UTC" }).format(new Date(`${t.month}-15T12:00:00Z`))}</span></div>)}</div>
    {d.byProduct.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{d.byProduct.map(b => <span key={b.name} className="rounded-full bg-[var(--bg)] px-2.5 py-1 text-[11px]">{b.name} <b className="text-[var(--navy)]">{k(b.value)}</b></span>)}</div>}
  </section>;

  /* ───── late doctors ───── */
  const late = d.late.length > 0 && <section id="late-doctors" className={`${card} scroll-mt-24 p-4 sm:p-5`} style={{ animationDelay: "180ms" }}>
    <Title icon="doctors" t="أطباء محتاجين زيارة" right={<Link href="/doctors?tag=late" className="text-[11.5px] font-bold text-[var(--sky-deep)]">الكل ({d.lateCount}) ‹</Link>} />
    <ul className="grid gap-2.5 sm:grid-cols-2">{d.late.map(x => { const pr = PRI[x.classification] || PRI_DEFAULT; return <li key={x.id} className={`relative flex items-center gap-2.5 overflow-hidden rounded-2xl border p-2.5 pr-3.5 transition hover:-translate-y-0.5 hover:shadow-md ${pr.box}`}><span className="absolute inset-y-0 right-0 w-1.5" style={{ background: pr.bar }} />
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--sky-light)] text-sm font-extrabold text-[var(--navy)]">{x.name.replace(/^د\.?\s*/, "").trim()[0] || "د"}</span>
      <div className="min-w-0 flex-1"><b className="block truncate text-sm" dir="auto">{x.name}</b><span className="block truncate text-[11px] text-[var(--muted)]" dir="auto">{[x.clinic, x.city].filter(Boolean).join(" · ")}</span>
        <span className="text-[11px] font-bold" style={{ color: pr.bar }}>متأخر {x.overdue_days} يوم{x.classification ? ` · فئة ${x.classification}` : ""}</span></div>
      <button type="button" disabled={busy === x.id || added.includes(x.id)} onClick={() => void addToPlan(x)} title="ضيفه لخطة أول يوم شغل جاي" aria-label={`ضيف ${x.name} للخطة`}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold transition ${added.includes(x.id) ? "bg-emerald-50 text-emerald-700" : "bg-[var(--bg)] text-[var(--navy)] hover:bg-[var(--sky-light)]"}`}>{added.includes(x.id) ? "✓" : "＋"}</button>
      <Link href={`/visits/new?doctorId=${x.id}`} className={`shrink-0 rounded-xl px-3.5 py-2.5 text-[12px] font-extrabold text-white transition active:scale-95 ${pr.btn}`}>زيارة</Link>
    </li>; })}</ul>
  </section>;

  /* ───── next week ───── */
  const nw = d.nextWeek.plan, nwCard = (nw || (wd >= 3 && wd <= 6)) && <section className={`${card} p-4`} style={{ animationDelay: "240ms" }}>
    <Title icon="plans" t="الأسبوع الجاي" />
    {nw?.status === "draft" ? <><p className="text-[12.5px] text-[var(--ink-soft)]">مسودة خطة الأسبوع الجاي جاهزة — <b>{nw.visits} زيارة</b> متوزعة حسب المنطقة</p>
      <Link href={`/plans?planId=${nw.id}`} className="mt-3 flex min-h-11 items-center justify-center rounded-2xl bg-[var(--navy)] text-sm font-bold text-white">راجعها وابعتها ‹</Link></>
      : nw ? <p className="text-[12.5px] text-[var(--ink-soft)]">خطتك للأسبوع الجاي ({nw.visits} زيارة) <b>{nw.status === "approved" ? "معتمدة ✓" : "مستنية الاعتماد"}</b> <Link href={`/plans?planId=${nw.id}`} className="font-bold text-[var(--sky-deep)]">افتحها ‹</Link></p>
      : <><p className="text-[12.5px] text-[var(--ink-soft)]">لسه ما عملتش خطة الأسبوع الجاي. أجهّزهالك من الأطباء المتأخرين والعيادات اللي قرّب طلبها؟</p>
        <button type="button" disabled={busy === "week"} onClick={() => void draftWeek()} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-2xl bg-[var(--navy)] text-sm font-bold text-white disabled:opacity-60">{busy === "week" ? "بجهّز…" : "جهّز لي الخطة"}</button></>}
  </section>;

  return <div className="space-y-4 pb-24 lg:pb-6">
    <RepStyles />
    <div className="es-card-in flex items-end justify-between gap-3">
      <div><div className="text-[12px] font-bold text-[var(--muted)]">{dateLabel}</div><h1 className="mt-0.5 text-2xl font-extrabold text-[var(--navy)] sm:text-3xl">{hello}، {d.name} 👋</h1></div>
    </div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
      <div className="min-w-0 space-y-4">
        {hero}
        {plan}
        <SmartStrip week={week} />
        <WeekStrip week={week} />
        <RepSmartCard hidePace hidePlan />
        <div className="grid gap-4 xl:grid-cols-2 xl:[&>*:only-child]:col-span-2">{target}<CollectionsCard /></div>
        {late}
      </div>
      <aside className="min-w-0 space-y-4">
        <HrHomeCard />
        {nwCard}
        <TasksCard tasks={d.taskList} open={d.tasks.open} />
        <RecentVisits rows={d.recent} />
      </aside>
    </div>
    <QuickFab rep />
  </div>;
}
