"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { DaftraPulse } from "@/lib/dash-daftra";
import type { Gap } from "@/lib/data-gaps";
import { GapsCard } from "./HomeExtras";
import { QuickFab } from "./DashParts";
import { healthScore, toneOf, type HealthIn } from "@/lib/dash-health";
import AdminSmartBoard from "@/components/smart/AdminSmartBoard";
import { UndoProvider } from "@/components/UndoToast";
import Priorities, { type Extra } from "./Priorities";

type D = {
  greeting: string; name: string; today: string; pendingTotal: number; manager?: boolean;
  inbox: Array<{ key: string; label: string; icon: string; href: string; count: number }>;
  gaps?: Gap[];
  pulse: { today: { visits: number; planned: number; done: number; active: number; reps: number; red: number }; quality: { week: number; lastWeek: number }; coverage: Array<{ cls: string; total: number; visited: number }> };
  team: Array<{ rep_id: string; rep_name: string; state: string; visits: number; planned: number; done: number; avgQuality: number | null; sinceMin: number | null; redFlags: number }>;
  insights: Array<{ tone: string; icon: string; title: string; text: string; href: string }>;
  activity: Array<{ kind: string; at: string; who: string; what: string; href: string }>;
};
type K = { label: string; sales: null | { value: number; delta: number | null; target: number | null }; collection: null | { value: number; delta: number | null; open: number; overdue: number };
  visits: { done: number; planned: number; total: number; delta: number | null }; targets: { onTrack: number; reps: number; behind: string[] } };
const L = "ar-EG-u-nu-latn";
const PERIODS: Array<[string, string]> = [["today", "النهارده"], ["week", "الأسبوع"], ["month", "الشهر"], ["quarter", "الربع"]];
const k = (n: number) => Math.round(n).toLocaleString("en-US");
const ago = (m: number | null) => m === null ? "لسه" : m < 60 ? `من ${m} د` : m < 1440 ? `من ${Math.floor(m / 60)} س` : `من ${Math.floor(m / 1440)} يوم`;
const since = (at: string) => Math.round((Date.now() - new Date(at).getTime()) / 60000);
const STATE: Record<string, [string, string]> = { active: ["شغال", "bg-emerald-500"], paused: ["متوقف", "bg-amber-500"], done: ["خلّص", "bg-sky-500"], idle: ["مسجلش", "bg-slate-300"] };

/** Admin home: priorities first, then the period's numbers, then the team. */
export default function CommandCenter() { return <UndoProvider><Home /></UndoProvider>; }

function Home() {
  const [d, setD] = useState<D | null>(null); const [err, setErr] = useState(false);
  const [f, setF] = useState<DaftraPulse | null>(null);
  const [period, setPeriod] = useState("month"); const [kp, setKp] = useState<K | null>(null);
  const load = async () => { try { const r = await fetch("/api/admin/dashboard", { cache: "no-store" }); if (!r.ok) throw 0; setD(await r.json()); setErr(false); } catch { setErr(true); } };
  const mgr = !!d?.manager, known = !!d;
  const mgrRef = useRef(false); useEffect(() => { mgrRef.current = mgr; }, [mgr]);
  useEffect(() => { if (known && !mgr) fetch("/api/admin/dashboard/daftra", { cache: "no-store" }).then(r => r.ok ? r.json() : { configured: false }).then(setF).catch(() => {}); }, [known, mgr]);
  useEffect(() => { void load(); const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 120000); return () => clearInterval(t); }, []);
  useEffect(() => { try { const s = sessionStorage.getItem("admin:period"); if (s) setPeriod(s); } catch { /* private mode */ } }, []);
  useEffect(() => { let alive = true; setKp(null); fetch(`/api/admin/kpis?period=${period}`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => { if (alive) setKp(j); }).catch(() => {}); try { sessionStorage.setItem("admin:period", period); } catch { /* ignore */ } return () => { alive = false; }; }, [period]);

  if (err && !d) return <div className="mt-4 rounded-[28px] border border-[var(--border)] bg-white p-8 text-center"><div className="font-bold">تعذر تحميل الصفحة</div><button onClick={() => void load()} className="mt-3 rounded-xl bg-[var(--navy)] px-4 py-2 font-bold text-white">إعادة المحاولة</button></div>;
  if (!d) return <div className="mt-4 space-y-4"><div className="h-20 animate-pulse rounded-[28px] bg-white" /><div className="h-72 animate-pulse rounded-[28px] bg-white" /><div className="h-40 animate-pulse rounded-[28px] bg-white" /></div>;

  const p = d.pulse;
  const hIn: HealthIn = { salesPct: !mgr && f?.configured && f.plan?.target_revenue ? Math.round(f.mtd.sales / f.plan.target_revenue * 100) : null, expectedPct: f?.configured ? f.day / f.days_in_month * 100 : null,
    coverage: p.coverage, arOverdue: !mgr && f?.configured ? f.ar.overdue : 0, arTotal: !mgr && f?.configured ? f.ar.total : 0, quality: p.quality.week || null };
  const h = healthScore(hIn);
  const dateLabel = new Date(`${d.today}T12:00:00`).toLocaleDateString(L, { weekday: "long", day: "numeric", month: "long" });
  const extras: Extra[] = [
    ...d.insights.filter(i => (i.tone === "red" || i.tone === "amber") && !i.title.includes("محتاجة مراجعة")).slice(0, 2).map((i, n) => ({ key: `i${n}`, tone: i.tone === "red" ? "red" as const : "amber" as const, count: i.icon, unit: "", title: i.title, reason: i.text, href: i.href, cta: "افتح" })),
    ...d.inbox.filter(g => g.count > 0 && g.key !== "plans").map(g => ({ key: `g${g.key}`, tone: "teal" as const, count: String(g.count), unit: "طلب", title: g.label, reason: "مستنية موافقتك أو ردّك", href: g.href, cta: "افتح" })),
  ];
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", hour12: false }).format(new Date()));

  return <div className="space-y-5 pb-24 lg:pb-8">
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-[13px] font-bold text-[var(--muted)]">{dateLabel}</p>
        <h1 className="mt-1 font-display text-[28px] font-extrabold leading-tight text-[var(--navy)] md:text-[32px]">{d.greeting}، {d.name}</h1>
        {h.score !== null && <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[13.5px] text-[var(--muted)]">
          <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: toneOf(h.score) }}><span className="h-2 w-2 rounded-full" style={{ background: toneOf(h.score) }} />صحة الشغل {h.score}</span>
          {h.weakest && h.weakest.score < 70 && <span>أضعف نقطة: <b className="text-[var(--ink)]">{h.weakest.label}</b> ({h.weakest.value}%)</span>}</p>}
      </div>
      <div role="radiogroup" aria-label="الفترة" className="grid grid-cols-4 rounded-2xl border border-[var(--border)] bg-white p-1 md:flex">
        {PERIODS.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={period === v} onClick={() => setPeriod(v)}
          className={`min-h-10 rounded-xl px-4 text-[14px] font-bold transition-colors duration-150 ${period === v ? "bg-[var(--sky-soft)] text-[var(--navy)]" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}>{l}</button>)}
      </div>
    </header>

    <Priorities manager={mgr} extras={extras} />

    <section aria-label="المؤشرات" className={`grid overflow-hidden rounded-[28px] border border-[var(--border)] bg-white sm:grid-cols-2 ${mgr ? "" : "lg:grid-cols-4"}`}>
      {!kp ? [0, 1, 2, 3].slice(0, mgr ? 2 : 4).map(i => <div key={i} className="m-5 h-32 animate-pulse rounded-2xl bg-[var(--bg)]" />) : <>
        {kp.sales && <Kpi label="المبيعات" period={kp.label} value={k(kp.sales.value)} unit="ر.س" delta={kp.sales.delta} href="/daftra-sales?tab=sales"
          sub={kp.sales.target ? `${Math.round(kp.sales.value / kp.sales.target * 100)}% من هدف الشهر (${k(kp.sales.target)})` : "من فواتير دفترة"} bar={kp.sales.target ? kp.sales.value / kp.sales.target * 100 : undefined} />}
        {kp.collection && <Kpi label="التحصيل" period={kp.label} value={k(kp.collection.value)} unit="ر.س" delta={kp.collection.delta} href="/daftra-sales?tab=ar"
          sub={`ليك عند العملاء ${k(kp.collection.open)}، منهم ${k(kp.collection.overdue)} متأخر`} bar={kp.collection.open ? 100 - kp.collection.overdue / kp.collection.open * 100 : undefined} />}
        <Kpi label="الزيارات" period={kp.label} value={`${kp.visits.done} من ${kp.visits.planned}`} delta={kp.visits.delta} href="/plans?tab=review"
          sub={kp.visits.planned ? `تنفيذ الخطة ${Math.round(kp.visits.done / kp.visits.planned * 100)}%، و${kp.visits.total} زيارة كلها` : `${kp.visits.total} زيارة، مفيش خطة معتمدة`} bar={kp.visits.planned ? kp.visits.done / kp.visits.planned * 100 : undefined} deltaLabel="في عدد الزيارات" />
        <Kpi label="الأهداف" period="الشهر ده" value={kp.targets.reps ? `${kp.targets.onTrack} من ${kp.targets.reps}` : "—"} href="/sales?tab=targets" gold
          sub={kp.targets.reps ? (kp.targets.behind.length ? `متأخرين: ${kp.targets.behind.slice(0, 2).join("، ")}` : "كل المناديب ماشيين على هدفهم") : "مفيش أهداف متحددة"} bar={kp.targets.reps ? kp.targets.onTrack / kp.targets.reps * 100 : undefined} />
      </>}
    </section>

    <section aria-labelledby="team-h" className="overflow-hidden rounded-[28px] border border-[var(--border)] bg-white">
      <div className="flex items-center justify-between px-5 py-4 md:px-6"><h2 id="team-h" className="text-lg font-extrabold text-[var(--navy)]">الفريق النهارده</h2><Link href="/plans?tab=review" className="text-[13.5px] font-bold text-[var(--sky-deep)]">خطط الفريق ‹</Link></div>
      <table className="hidden w-full text-[14px] md:table">
        <thead><tr className="border-y border-[var(--border)] bg-[var(--sky-light)] text-right text-[12.5px] text-[var(--muted)]"><th className="px-6 py-2.5 font-bold">المندوب</th><th className="px-3 font-bold">الحالة</th><th className="px-3 font-bold">خطة النهارده</th><th className="px-3 font-bold">جودة الزيارات</th><th className="px-6 font-bold">آخر نشاط</th></tr></thead>
        <tbody>{d.team.map(t => { const flag = teamFlag(t, hour); const [sl, sc] = STATE[t.state] || STATE.idle;
          return <tr key={t.rep_id} className="cursor-pointer border-b border-[var(--border)] transition-colors duration-150 last:border-0 hover:bg-[var(--sky-light)]" onClick={() => location.assign(`/admin/rep/${t.rep_id}`)}>
            <td className="px-6 py-3"><Link href={`/admin/rep/${t.rep_id}`} className="flex items-center gap-2 font-bold text-[var(--ink)]" onClick={e => e.stopPropagation()}>{flag && <span title={flag.text} className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: flag.color }} />}{t.rep_name}</Link>{flag && <span className="block text-[11.5px]" style={{ color: flag.color }}>{flag.text}</span>}</td>
            <td className="px-3"><span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold"><span className={`h-2 w-2 rounded-full ${sc}`} />{sl}</span></td>
            <td className="px-3"><div className="flex items-center gap-2.5"><span className="w-12 font-bold">{t.done}/{t.planned}</span><span className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--sky-soft)]"><span className="block h-full rounded-full bg-[var(--sky)]" style={{ width: `${t.planned ? t.done / t.planned * 100 : 0}%` }} /></span></div></td>
            <td className="px-3">{t.avgQuality ?? "—"}</td><td className="px-6 text-[var(--muted)]">{ago(t.sinceMin)}</td></tr>; })}</tbody>
      </table>
      <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)] md:hidden">{d.team.map(t => { const flag = teamFlag(t, hour); return <li key={t.rep_id}><Link href={`/admin/rep/${t.rep_id}`} className="flex items-center gap-3 px-5 py-3.5">
        {flag ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: flag.color }} /> : <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${(STATE[t.state] || STATE.idle)[1]}`} />}
        <span className="min-w-0 flex-1"><b className="block truncate">{t.rep_name}</b><span className="text-[12px]" style={{ color: flag?.color || "var(--muted)" }}>{flag?.text || ago(t.sinceMin)}</span></span>
        <b className="shrink-0">{t.done}/{t.planned}</b></Link></li>; })}</ul>
    </section>

    {d.gaps && d.gaps.length > 0 && <GapsCard gaps={d.gaps} onDone={() => void load()} />}
    <AdminSmartBoard />
    {d.activity.length > 0 && <details className="rounded-[28px] border border-[var(--border)] bg-white px-5 py-4 md:px-6">
      <summary className="cursor-pointer text-[15px] font-extrabold text-[var(--navy)]">آخر نشاط في الفريق</summary>
      <ul className="mt-3 space-y-1">{d.activity.map((a, i) => <li key={i}><Link href={a.href} className="flex items-center gap-3 rounded-xl px-2 py-2 text-[13.5px] hover:bg-[var(--bg)]"><Icon name="visits" size={16} /><span className="min-w-0 flex-1 truncate"><b>{a.who}</b> {a.what}</span><span className="shrink-0 text-[11.5px] text-[var(--muted)]">{ago(since(a.at))}</span></Link></li>)}</ul>
    </details>}
    <QuickFab mgr={mgr} />
  </div>;
}

function teamFlag(t: D["team"][number], hour: number) {
  if (t.redFlags > 0) return { color: "#c92f36", text: `${t.redFlags} زيارة عليها علامة` };
  if (t.planned > 0 && hour >= 13 && t.done / t.planned < 0.5) return { color: "#e99608", text: `متأخر عن خطته (${t.done} من ${t.planned})` };
  if (t.state === "idle" && hour >= 11) return { color: "#e99608", text: "مسجلش أي زيارة النهارده" };
  return null;
}

function Kpi({ label, period, value, unit, sub, href, delta, bar, gold, deltaLabel }: { label: string; period: string; value: string; unit?: string; sub: string; href: string; delta?: number | null; bar?: number; gold?: boolean; deltaLabel?: string }) {
  return <div className="flex flex-col gap-2 border-[var(--border)] p-5 max-lg:border-b sm:[&:nth-child(odd)]:border-l lg:border-l lg:last:border-l-0">
    <div className="flex items-center justify-between text-[13px]"><span className="font-bold text-[var(--ink)]">{label}</span><span className="text-[var(--muted)]">{period}</span></div>
    <div className="flex flex-wrap items-baseline gap-x-2"><b className="font-display text-[26px] font-extrabold text-[var(--navy)]">{value}</b>{unit && <span className="text-[12.5px] text-[var(--muted)]">{unit}</span>}
      {delta !== undefined && delta !== null && <span className={`text-[12.5px] font-bold ${delta >= 0 ? "text-[#1e7a5a]" : "text-[#c92f36]"}`} title={`مقارنة بنفس الفترة اللي فاتت${deltaLabel ? ` ${deltaLabel}` : ""}`}>{delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}%</span>}</div>
    {bar !== undefined && <span className="h-2 overflow-hidden rounded-full bg-[var(--sky-soft)]"><span className="block h-full rounded-full transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(100, bar))}%`, background: gold ? "#c9a24a" : "#33b3a6" }} /></span>}
    <div className="mt-auto flex items-end justify-between gap-2 pt-1 text-[12.5px]"><span className="text-[var(--muted)]">{sub}</span><Link href={href} className="shrink-0 font-bold text-[var(--sky-deep)]">التفاصيل ‹</Link></div>
  </div>;
}
