"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";

type Tone = "good" | "warn" | "bad" | "info";
type Pulse = {
  range: { from: string; to: string; prevFrom: string; prevTo: string };
  cards: {
    sales: { value: number; target: number; pct: number | null; prev: number; unassigned: number; tone: Tone };
    visits: { value: number; prev: number; delta: number | null; tone: Tone };
    coverage: { pct: number | null; active: number; overdue: number; never: number; tone: Tone };
    plan: { pct: number | null; planned: number; done: number; tone: Tone };
    collections: { total: number; overdue: number; old: number; invoices: number; share: number | null; tone: Tone };
    expenses: { value: number; pending: number; pending_n: number; tone: Tone };
  };
  team: Array<{ id: string; name: string; product: string | null; sales: number; target: number; sales_pct: number | null; sales_tone: Tone; visits: number; visits_prev: number;
    planned: number; plan_done: number; plan_pct: number | null; plan_tone: Tone; overdue: number; expenses: number; expenses_pending: number }>;
};

const TONE: Record<Tone, { ring: string; soft: string; text: string; label: string }> = {
  good: { ring: "#1aa865", soft: "#1aa8651a", text: "text-emerald-700", label: "ممتاز" },
  warn: { ring: "#e99608", soft: "#e996081f", text: "text-amber-700", label: "محتاج متابعة" },
  bad: { ring: "#c92f36", soft: "#c92f361a", text: "text-red-700", label: "محتاج تدخل" },
  info: { ring: "#3b90e8", soft: "#3b90e81a", text: "text-sky-700", label: "للعلم" },
};
const money = (n: number) => `${Math.round(n).toLocaleString("en-US")}`;
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Counts up to the value (ease-out) — makes numbers feel alive without slowing anyone down. */
function useCount(v: number, ms = 1100) {
  const [n, setN] = useState(0); const from = useRef(0);
  useEffect(() => {
    if (reduced()) { setN(v); return; }
    const a = from.current, t0 = performance.now(); let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); setN(a + (v - a) * e); if (k < 1) raf = requestAnimationFrame(step); else from.current = v; };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [v, ms]);
  return n;
}

function Ring({ pct, color, size = 76 }: { pct: number | null; color: string; size?: number }) {
  const [on, setOn] = useState(false); useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id); }, []);
  const r = 30, L = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct ?? 0)), shown = useCount(pct ?? 0);
  return <svg viewBox="0 0 76 76" width={size} height={size} className="shrink-0 -rotate-90" aria-hidden="true">
    <circle cx="38" cy="38" r={r} fill="none" stroke="var(--bg)" strokeWidth="8" />
    <circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={L} strokeDashoffset={on ? L * (1 - p / 100) : L} style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)" }} />
    <text x="38" y="38" transform="rotate(90 38 38)" textAnchor="middle" dominantBaseline="central" fontSize={pct === null || Math.abs(pct) < 100 ? 17 : Math.abs(pct) < 1000 ? 14 : 11.5} fontWeight="800" fill={color}>{pct === null ? "—" : `${Math.round(shown)}%`}</text>
  </svg>;
}

function Bar({ pct, color }: { pct: number | null; color: string }) {
  const [on, setOn] = useState(false); useEffect(() => { const id = setTimeout(() => setOn(true), 60); return () => clearTimeout(id); }, []);
  return <div className="h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full" style={{ width: on ? `${Math.max(2, Math.min(100, pct ?? 0))}%` : "0%", background: color, transition: "width 1.1s cubic-bezier(.2,.8,.2,1)" }} /></div>;
}

function Num({ v, suffix }: { v: number; suffix?: string }) { const n = useCount(v); return <>{money(n)}{suffix && <span className="mr-1 text-sm font-bold text-[var(--muted)]">{suffix}</span>}</>; }

type CardP = { i: number; tone: Tone; icon: string; title: string; ring?: number | null; big: React.ReactNode; sub: React.ReactNode; cta: string; onClick?: () => void; href?: string; badge?: React.ReactNode };
function PulseCard({ i, tone, icon, title, ring, big, sub, cta, onClick, href, badge }: CardP) {
  const T = TONE[tone];
  const body = <>
    <span className="es-pulse-glow" style={{ background: `radial-gradient(220px 120px at 85% 0%, ${T.soft}, transparent 70%)` }} />
    <div className="relative flex items-start justify-between gap-2">
      <div className="flex items-center gap-2"><span className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: T.soft, color: T.ring }}><Icon name={icon} size={19} /></span>
        <div><div className="text-xs font-bold text-[var(--muted)]">{title}</div><span className={`text-[10.5px] font-extrabold ${T.text}`}>● {T.label}</span></div></div>
      {badge}
    </div>
    <div className="relative mt-3 flex items-center justify-between gap-3">
      <div className="min-w-0"><div className="text-[26px] font-extrabold leading-tight text-[var(--navy)]">{big}</div><div className="mt-1 text-[11.5px] leading-5 text-[var(--muted)]">{sub}</div></div>
      {ring !== undefined && <Ring pct={ring} color={T.ring} />}
    </div>
    <div className="relative mt-3 flex items-center gap-1 text-[11.5px] font-bold text-[var(--sky-deep)] opacity-70 transition group-hover:gap-2 group-hover:opacity-100">{cta}<span aria-hidden="true">‹</span></div>
  </>;
  const cls = "es-card-in group relative block overflow-hidden rounded-[26px] border border-[var(--border)] bg-white p-4 text-right shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-dashed";
  const style = { animationDelay: `${i * 70}ms`, borderTop: `3px solid ${T.ring}` } as React.CSSProperties;
  return href ? <Link href={href} className={cls} style={style}>{body}</Link> : <button type="button" onClick={onClick} className={cls} style={style}>{body}</button>;
}

/** Top of the reports page: the whole system at a glance; every card opens its detailed report. */
export default function PulseBoard({ from, to, repId, onOpen, onRep }: { from: string; to: string; repId: string; onOpen: (type: string) => void; onRep: (id: string) => void }) {
  const [d, setD] = useState<Pulse | null>(null); const [err, setErr] = useState(false);
  useEffect(() => {
    let on = true; setErr(false);
    const qs = new URLSearchParams({ from, to }); if (repId) qs.set("repId", repId);
    fetch(`/api/admin/reports/pulse?${qs}`, { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject()).then(j => on && setD(j)).catch(() => on && setErr(true));
    return () => { on = false; };
  }, [from, to, repId]);
  if (err) return <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">تعذر تحميل لوحة المتابعة — جرّب تحديث الصفحة.</div>;
  if (!d) return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="es-shimmer h-[170px] rounded-[26px]" />)}</div>;
  const c = d.cards, prevPct = c.sales.prev ? Math.round((c.sales.value - c.sales.prev) / c.sales.prev * 100) : null;
  const hit = c.sales.pct !== null && c.sales.pct >= 100;
  return <section aria-label="لوحة المتابعة" className="space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h2 className="text-lg font-extrabold text-[var(--navy)]">لوحة المتابعة</h2><p className="text-xs text-[var(--muted)]">السستم كله في نظرة — اضغط على أي كارت يفتح تقريره بالتفصيل. المقارنة مع {d.range.prevFrom} ← {d.range.prevTo}.</p></div>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <PulseCard i={0} tone={c.sales.tone} icon="sales" title="المبيعات من دفترة" ring={c.sales.pct} big={<Num v={c.sales.value} suffix="ر.س" />}
        sub={<>الهدف {money(c.sales.target)} ر.س{prevPct !== null && <> · <b className={prevPct >= 0 ? "text-emerald-700" : "text-red-700"}>{prevPct >= 0 ? "▲" : "▼"} {Math.abs(prevPct)}%</b> عن اللي فاتت</>}{c.sales.unassigned > 0 && <><br /><span className="text-amber-700">{money(c.sales.unassigned)} ر.س لأصناف من غير مندوب</span></>}</>}
        badge={hit ? <span className="es-pop rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700 ring-1 ring-emerald-200">🎉 الهدف اتحقق</span> : undefined}
        cta="تقرير المبيعات والأهداف" onClick={() => onOpen("sales")} />
      <PulseCard i={1} tone={c.visits.tone} icon="visits" title="الزيارات المكتملة" big={<Num v={c.visits.value} suffix="زيارة" />}
        sub={c.visits.delta === null ? "مفيش فترة سابقة للمقارنة" : <><b className={c.visits.delta >= 0 ? "text-emerald-700" : "text-red-700"}>{c.visits.delta >= 0 ? "▲" : "▼"} {Math.abs(c.visits.delta)}%</b> عن الفترة اللي فاتت ({c.visits.prev})</>}
        cta="نشاط المناديب يوم بيوم" onClick={() => onOpen("daily")} />
      <PulseCard i={2} tone={c.coverage.tone} icon="doctors" title="تغطية الأطباء" ring={c.coverage.pct} big={<><Num v={c.coverage.active - c.coverage.overdue - c.coverage.never} /><span className="text-sm text-[var(--muted)]"> / {c.coverage.active}</span></>}
        sub={<><b className="text-red-700">{c.coverage.overdue}</b> متأخر عن ميعاده · <b className="text-amber-700">{c.coverage.never}</b> ما اتزاروش ولا مرة</>}
        cta="الأطباء المتأخرين" onClick={() => onOpen("overdue")} />
      <PulseCard i={3} tone={c.plan.tone} icon="plans" title="الالتزام بالخطة" ring={c.plan.pct} big={<><Num v={c.plan.done} /><span className="text-sm text-[var(--muted)]"> / {c.plan.planned}</span></>}
        sub={c.plan.planned ? "زيارة من الخطة المعتمدة اتنفذت في ميعادها" : "مفيش خطط معتمدة في الفترة دي"}
        cta="تقرير الالتزام بالخطة" onClick={() => onOpen("compliance")} />
      <PulseCard i={4} tone={c.collections.tone} icon="wallet" title="التحصيل المتأخر" ring={c.collections.share} big={<Num v={c.collections.overdue} suffix="ر.س" />}
        sub={<>من {money(c.collections.total)} ر.س مستحقة · <b className="text-red-700">{money(c.collections.old)}</b> أقدم من 60 يوم</>}
        cta="المديونيات في دفترة" href="/daftra-sales?tab=ar" />
      <PulseCard i={5} tone={c.expenses.tone} icon="fuel" title="مصروفات المناديب" big={<Num v={c.expenses.value} suffix="ر.س" />}
        sub={c.expenses.pending_n ? <><b className="text-amber-700">{c.expenses.pending_n}</b> طلب مستني اعتمادك ({money(c.expenses.pending)} ر.س)</> : "مفيش طلبات مستنية اعتماد ✓"}
        cta="المصروفات" href="/expenses" />
    </div>

    <div className="es-card-in overflow-hidden rounded-[26px] border border-[var(--border)] bg-white" style={{ animationDelay: "420ms" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] p-4"><div><h3 className="font-extrabold text-[var(--navy)]">المناديب في الفترة</h3><p className="text-[11.5px] text-[var(--muted)]">اضغط على أي مندوب يتفلتر التقرير عليه</p></div></div>
      {!d.team.length ? <p className="p-6 text-center text-sm text-[var(--muted)]">مفيش مناديب نشطين</p> :
        <div className="divide-y divide-[var(--border)]">{d.team.map((r, i) => <button key={r.id} type="button" onClick={() => onRep(r.id)} className="es-card-in grid w-full grid-cols-1 gap-3 p-4 text-right transition hover:bg-[var(--sky-light)]/60 sm:grid-cols-[1.2fr_2fr_1fr_1fr_1fr] sm:items-center" style={{ animationDelay: `${480 + i * 60}ms` }}>
          <div className="flex items-center gap-2.5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-xs font-extrabold text-white">{r.name.split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase()}</span><div className="min-w-0"><b className="block truncate text-[var(--navy)]">{r.name}</b><span className="text-[11px] text-[var(--muted)]">{r.product || "—"}</span></div></div>
          <div><div className="mb-1 flex justify-between text-[11.5px]"><span className="text-[var(--muted)]">المبيعات</span><b className={TONE[r.sales_tone].text}>{money(r.sales)}{r.target ? ` / ${money(r.target)}` : ""} ر.س{r.sales_pct !== null ? ` · ${r.sales_pct}%` : ""}</b></div><Bar pct={r.target ? r.sales_pct : 0} color={TONE[r.sales_tone].ring} /></div>
          <div className="text-[11.5px]"><span className="block text-[var(--muted)]">زيارات</span><b className="text-base text-[var(--navy)]">{r.visits}</b>{r.visits_prev ? <span className={r.visits >= r.visits_prev ? "text-emerald-700" : "text-red-700"}> {r.visits >= r.visits_prev ? "▲" : "▼"}</span> : null}</div>
          <div className="text-[11.5px]"><span className="block text-[var(--muted)]">الخطة</span><b className={`text-base ${TONE[r.plan_tone].text}`}>{r.plan_pct === null ? "—" : `${r.plan_pct}%`}</b><span className="text-[var(--muted)]"> {r.planned ? `${r.plan_done}/${r.planned}` : ""}</span></div>
          <div className="text-[11.5px]"><span className="block text-[var(--muted)]">أطباء متأخرين</span><b className={`text-base ${r.overdue ? "text-red-700" : "text-emerald-700"}`}>{r.overdue}</b></div>
        </button>)}</div>}
    </div>
  </section>;
}
