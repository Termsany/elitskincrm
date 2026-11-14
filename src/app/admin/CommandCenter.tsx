"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GlyphIcon, Icon } from "@/components/Icon";
import type { DaftraPulse } from "@/lib/dash-daftra";
import type { Gap } from "@/lib/data-gaps";
import type { Morning } from "@/lib/morning-summary";
import { GapsCard, InboxList } from "./HomeExtras";
import { HealthHero, KpiTile, QuickFab, Spark, StartHere } from "./DashParts";
import type { ActionIn, HealthIn } from "@/lib/dash-health";
import AdminSmartBoard from "@/components/smart/AdminSmartBoard";
import { UndoProvider } from "@/components/UndoToast";
import Sheet, { btnPrimary, btnGhost } from "@/components/Sheet";

type D = {
  greeting: string; name: string; today: string; summary: string; pendingTotal: number;
  inbox: Array<{ key: string; label: string; icon: string; href: string; count: number; bulk?: boolean; items: Array<{ id: string; title: string; owner: string | null; at: string; href: string; bulk?: boolean }> }>;
  gaps?: Gap[]; morning?: Morning | null;
  pulse: { today: { visits: number; planned: number; done: number; active: number; reps: number; red: number }; quality: { week: number; lastWeek: number; visits: number; bands: { excellent: number; good: number; weak: number } };
    sales: { target: number; actual: number; forecast: number; pace: number; annual: number; ytd: number }; coverage: Array<{ cls: string; total: number; visited: number }> };
  team: Array<{ rep_id: string; rep_name: string; state: string; visits: number; planned: number; done: number; avgQuality: number | null; sinceMin: number | null; redFlags: number }>;
  daily: Array<{ day: string; visits: number; quality: number | null; red: number }>;
  insights: Array<{ tone: string; icon: string; title: string; text: string; href: string }>;
  activity: Array<{ kind: string; at: string; who: string; what: string; href: string }>;
};
const L = "ar-EG-u-nu-latn";
const card = "rounded-[28px] border border-[var(--border)] bg-white";
const mins = (m: number) => m < 1 ? "دلوقتي" : m < 60 ? `من ${m} د` : m < 1440 ? `من ${Math.floor(m / 60)} س` : `من ${Math.floor(m / 1440)} يوم`;
const short = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n));
const rel = (d: string) => { const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 1 ? "دلوقتي" : m < 60 ? `من ${m} د` : m < 1440 ? `من ${Math.floor(m / 60)} س` : m < 2880 ? "امبارح" : `من ${Math.floor(m / 1440)} يوم`; };
const qColor = (q: number | null) => q === null ? "#dce5e6" : q >= 75 ? "#6cc0a8" : q >= 50 ? "#e6c27a" : "#e8b49c";
const STATE: Record<string, [string, string]> = { active: ["شغال", "bg-emerald-500"], paused: ["متوقف", "bg-amber-500"], done: ["خلّص ✓", "bg-sky-500"], idle: ["مسجلش", "bg-slate-300"] };
const TONE: Record<string, string> = { red: "border-r-[#c25550] bg-white", amber: "border-r-[#d39a3c] bg-white", green: "border-r-[#5cb89a] bg-white", blue: "border-r-[#5b9bd5] bg-white" };
const ACT: Record<string, string> = { visit: "🩺", plan: "🗓️", file: "📄", sign: "🖋️", signreq: "📨" };
const actIcon = (k: string) => ACT[k] ? <GlyphIcon g={ACT[k]} chip size={16} box={32} /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg)] text-sm">•</span>;

function useCount(v: number) {
  const [n, setN] = useState(0); const from = useRef(0);
  useEffect(() => { const s = from.current, start = performance.now(); let raf = 0; const step = (t: number) => { const p = Math.min(1, (t - start) / 700); const e = 1 - Math.pow(1 - p, 3); setN(Math.round(s + (v - s) * e)); if (p < 1) raf = requestAnimationFrame(step); else from.current = v; }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, [v]);
  return n;
}
const Num = ({ v, className = "", fmt = false }: { v: number; className?: string; fmt?: boolean }) => { const n = useCount(v); return <span className={className}>{fmt ? n.toLocaleString("en-US") : n}</span>; };
/* Calm look for the dashboard: one-colour soft icons, no looping or hover motion, short transitions only. */
const CALM = `
.calm .dz-ico{background:var(--sky-light)!important;color:var(--navy)!important}
.calm .dz-ico .es-ico-line>*{animation:none!important;stroke-dashoffset:0!important}
.calm .dz-ico .es-ico-duo{animation:none!important}
.calm .dz-live::after,.calm .animate-ping,.calm .dp-first{animation:none!important}
.calm .group:hover .es-ico,.calm .dz-tile:hover .es-ico{animation:none!important}
.calm .group:hover .dz-ico,.calm .dz-tile:hover .dz-ico{transform:none}
.calm .dz-in,.calm .dz-tile,.calm .es-card-in{animation-duration:.22s!important;animation-delay:0ms!important}
.calm .dz-bar,.calm .dz-grow-x,.calm .dz-reveal{animation-duration:.25s!important;animation-delay:0ms!important}
.calm .dz-card:hover,.calm .dz-tile:hover{transform:none;box-shadow:none}
.calm .dz-tile>span.absolute{background:var(--navy)!important}
.calm .dp-cta:hover{transform:none}
@media (prefers-reduced-motion:reduce){.calm *{animation:none!important;transition:none!important}}`;
const MON = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const mFull = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
/** Duotone icon in a soft tinted tile; its strokes draw in on load and it plays a small motion when the card is hovered. */
function AIco({ name, color, anim = "bob", live = false, box = 42, size = 20 }: { name: string; color: string; anim?: "bob" | "wiggle" | "pulse" | "rise" | "spin"; live?: boolean; box?: number; size?: number }) {
  return <span className={`dz-ico dz-${anim}`} style={{ width: box, height: box, color, background: `linear-gradient(140deg, ${color}2e, ${color}0f)` }}><Icon name={name} size={size} />{live && <span className="dz-live" style={{ background: color }} />}</span>;
}
/** Interactive 12-month area chart (newest on the left to read RTL); line draws in, hover shows each month. */
function Area({ data, labels, color, hover, setHover }: { data: number[]; labels: string[]; color: string; hover: number | null; setHover: (i: number | null) => void }) {
  const n = data.length, max = Math.max(1, ...data), min = Math.min(0, ...data), span = max - min || 1;
  const X = (i: number) => n < 2 ? 50 : 100 - i / (n - 1) * 100, Y = (v: number) => 4 + (1 - (v - min) / span) * 88;
  const pts = data.map((v, i) => [X(i), Y(v)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${pts[n - 1]?.[0] ?? 0},${Y(min)} L${pts[0]?.[0] ?? 100},${Y(min)} Z`;
  const gid = `g${color.slice(1)}`;
  return <div className="relative mb-6 mt-2 h-40 select-none" onMouseLeave={() => setHover(null)}>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".28" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient>
        <clipPath id={`c${gid}`}><rect className="dz-reveal" x="0" y="-5" width="100" height="110" /></clipPath></defs>
      {[25, 50, 75].map(y => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#eef2f5" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
      {min < 0 && <line x1="0" x2="100" y1={Y(0)} y2={Y(0)} stroke="#c92f36" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      <g clipPath={`url(#c${gid})`}><path d={area} fill={`url(#${gid})`} /><path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" /></g>
      {hover !== null && <line x1={X(hover)} x2={X(hover)} y1="0" y2="100" stroke={color} strokeOpacity=".35" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
    </svg>
    {hover !== null && pts[hover] && <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${pts[hover][0]}%`, top: `${pts[hover][1]}%`, background: color }} />}
    <div className="absolute inset-0 flex">{data.map((_, i) => <Link key={i} href="/sales?tab=sales" aria-label={labels[i]} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} className="h-full flex-1" />)}</div>
    <div className="absolute -bottom-5 inset-x-0 flex justify-between text-[9px] text-[var(--muted)]">{labels.map((l, i) => <span key={l} className={`w-0 whitespace-nowrap ${i % 2 ? "invisible sm:visible" : ""} ${hover === i ? "font-extrabold text-[var(--navy)]" : ""}`} style={{ direction: "rtl" }}>{MON[Number(l.slice(5, 7)) - 1].slice(0, 3)}</span>)}</div>
  </div>;
}
function Ring({ pct, size = 76, color = "#10484f", children }: { pct: number; size?: number; color?: string; children: React.ReactNode }) {
  const s = 7, r = (size - s) / 2, c = 2 * Math.PI * r;
  return <div className="relative shrink-0" style={{ width: size, height: size }}><svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f5" strokeWidth={s} /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={s} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)} style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)" }} /></svg><div className="absolute inset-0 flex flex-col items-center justify-center leading-none">{children}</div></div>;
}

export default function CommandCenter() { return <UndoProvider><Dash /></UndoProvider>; }

function Dash() {
  const [pop, setPop] = useState<"" | "visits" | "ar">(""); const [rep, setRep] = useState<D["team"][number] | null>(null);
  const [d, setD] = useState<D | null>(null); const [err, setErr] = useState(false); const [grp, setGrp] = useState<string>(""); const [hover, setHover] = useState<number | null>(null);
  const [f, setF] = useState<DaftraPulse | null>(null); const [ser, setSer] = useState("sales"); const [fh, setFh] = useState<number | null>(null);
  const load = async () => { try { const r = await fetch("/api/admin/dashboard", { cache: "no-store" }); if (!r.ok) throw 0; const j = await r.json(); setD(j); setErr(false); } catch { setErr(true); } };
  const loadF = async () => { try { const r = await fetch("/api/admin/dashboard/daftra", { cache: "no-store" }); if (r.ok) setF(await r.json()); else setF({ configured: false }); } catch { /* keep last */ } };
  const isMgr = !!(d as { manager?: boolean } | null)?.manager, known = !!d;
  const isMgrRef = useRef(false); useEffect(() => { isMgrRef.current = isMgr; }, [isMgr]);
  useEffect(() => { if (known && !isMgr) void loadF(); }, [known, isMgr]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); const t = setInterval(() => { if (document.visibilityState === "visible") { void load(); if (!isMgrRef.current) void loadF(); } }, 120000); return () => clearInterval(t); }, []);
  useEffect(() => { if (d && (!grp || !d.inbox.some(g => g.key === grp))) setGrp(d.inbox[0]?.key || ""); }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const [nx, setNx] = useState<number | null>(null);
  useEffect(() => { if (known) fetch("/api/smart", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => setNx(typeof j?.nextWeek?.withPlan === "number" ? j.nextWeek.withPlan : null)).catch(() => {}); }, [known]);
  const openPalette = () => window.dispatchEvent(new Event("open-command-palette"));
  if (err && !d) return <div className={`${card} mt-4 p-8 text-center`}><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500"><Icon name="warn" size={28} /></div><div className="mt-2 font-bold">تعذر تحميل لوحة القيادة</div><button onClick={() => void load()} className="mt-3 rounded-xl bg-[var(--navy)] px-4 py-2 text-sm font-bold text-white">إعادة المحاولة</button></div>;
  if (!d) return <div className="mt-4 space-y-4"><div className="h-28 animate-pulse rounded-[28px] bg-white" /><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-40 animate-pulse rounded-[28px] bg-white" />)}</div><div className="h-72 animate-pulse rounded-[28px] bg-white" /></div>;

  const p = d.pulse; const g = d.inbox.find(x => x.key === grp);
  const qDelta = p.quality.lastWeek ? p.quality.week - p.quality.lastWeek : 0;
  const maxDay = Math.max(1, ...d.daily.map(x => x.visits));
  const dateLabel = new Date(`${d.today}T12:00:00`).toLocaleDateString(L, { weekday: "long", day: "numeric", month: "long" });

  const header = <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div><div className="text-sm font-bold text-[var(--muted)]">{dateLabel}</div><h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[var(--navy)] sm:text-4xl">{d.greeting}، {d.name} <span className="inline-block origin-bottom-right animate-[wave_1.6s_ease-in-out_1]">👋</span></h1><p className="mt-2 text-sm text-[var(--muted)] sm:text-base">{d.summary}</p></div>
    <button onClick={openPalette} className="group flex h-12 w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 text-right shadow-sm transition hover:border-[var(--sky-border)] hover:shadow-md lg:w-[380px]"><span className="text-[var(--navy)]"><Icon name="search" size={20} /></span><span className="flex-1 text-sm text-[var(--muted)]">دوّر على أي حاجة أو اعمل أي حاجة…</span><kbd className="hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--muted)] sm:inline">Ctrl K</kbd></button>
    <style>{`@keyframes wave{0%,100%{transform:rotate(0)}20%{transform:rotate(-14deg)}40%{transform:rotate(10deg)}60%{transform:rotate(-8deg)}}`}</style>
  </section>;

  const mgr0 = !!(d as { manager?: boolean }).manager;
  const hIn: HealthIn = { salesPct: !mgr0 && f?.configured && f.plan?.target_revenue ? Math.round(f.mtd.sales / f.plan.target_revenue * 100) : null, expectedPct: f?.configured ? f.day / f.days_in_month * 100 : null, coverage: p.coverage, arOverdue: !mgr0 && f?.configured ? f.ar.overdue : 0, arTotal: !mgr0 && f?.configured ? f.ar.total : 0, quality: p.quality.visits ? p.quality.week : null };
  const aIn: ActionIn = { manager: mgr0, arOverdue: !mgr0 && f?.configured ? f.ar.overdue : 0, arInvoices: d.morning?.overdue.invoices || 0, ar60: !mgr0 && f?.configured ? f.ar.old60 : 0, reps: p.today.reps, withPlan: nx, pendingTotal: d.pendingTotal, insights: d.insights, morning: d.morning || null };

  /* ───────── KPI row ───────── */
  const mgr = !!(d as { manager?: boolean } | null)?.manager;
  const salesDelta = f?.configured && f.prev.sales ? Math.round((f.mtd.sales - f.prev.sales) / f.prev.sales * 100) : null;
  const planPct = f?.configured && f.plan?.target_revenue ? Math.round(f.mtd.sales / f.plan.target_revenue * 100) : null;
  const qSeries = d.daily.filter(x => x.quality !== null).map(x => x.quality as number);
  const arPct = f?.configured && f.ar.total ? Math.round(f.ar.overdue / f.ar.total * 100) : 0;
  const pulse = <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
    <KpiTile href={`/visits?tab=visits&day=${d.today}`} onOpen={() => setPop("visits")} color="#2e9d8f" tint="" label="زيارات النهارده" icon="visits" delay={0} live={p.today.active > 0}
      value={<><Num v={p.today.visits} className="text-4xl font-extrabold text-[var(--navy)]" /><span className="pb-1.5 text-sm text-[var(--muted)]"> زيارة</span></>}
      sub={p.today.active > 0 ? `${p.today.active} شغال دلوقتي` : p.today.planned ? `${p.today.done} من ${p.today.planned} في الخطة` : "مفيش خطة معتمدة"} chip={p.today.red > 0 ? { text: `${p.today.red} تنبيه`, tone: "red" } : undefined}
      spark={<Spark data={d.daily.map(x => x.visits)} color="#2e9d8f" />} />
    {!mgr && <KpiTile href="/sales?tab=sales" color="#165f66" tint="" label="مبيعات الشهر" icon="receipt" delay={70}
      value={f?.configured ? <><Num v={Math.round(f.mtd.sales)} fmt className="text-3xl font-extrabold text-[var(--navy)]" /><span className="pb-1 text-sm text-[var(--muted)]"> ر.س</span></> : <span className="text-3xl font-extrabold text-[var(--muted)]">—</span>}
      sub={f?.configured ? (planPct !== null ? `${planPct}% من المتوقع` : `${f.mtd.invoices} فاتورة · ${f.mtd.clients} عميل`) : f ? "دفترة مش مربوطة" : "بيحمّل…"}
      chip={salesDelta !== null ? { text: `${salesDelta >= 0 ? "▲" : "▼"} ${Math.abs(salesDelta)}%`, tone: salesDelta >= 0 ? "green" : "red" } : undefined}
      spark={f?.configured ? <Spark data={f.series.map(x => x.sales)} color="#165f66" /> : undefined} />}
    {!mgr && <KpiTile href="/sales?tab=ar" onOpen={f?.configured ? () => setPop("ar") : undefined} color="#c25550" tint="" label="ليك عند العملاء متأخر" icon="wallet" delay={140} live={!!(f?.configured && f.ar.overdue > 0)}
      value={f?.configured ? <><Num v={Math.round(f.ar.overdue)} fmt className={`text-3xl font-extrabold ${f.ar.overdue > 0 ? "text-[#a8443f]" : "text-[var(--navy)]"}`} /><span className="pb-1 text-sm text-[var(--muted)]"> ر.س</span></> : <span className="text-3xl font-extrabold text-[var(--muted)]">—</span>}
      sub={f?.configured ? `إجمالي ليك ${short(f.ar.total)}${f.ar.old60 > 0 ? ` · ${short(f.ar.old60)} أكتر من 60 يوم` : ""}` : ""}
      spark={f?.configured && f.ar.total > 0 ? <div className="mt-3"><div className="h-2.5 overflow-hidden rounded-full bg-white/80"><div className="dz-grow-x h-full rounded-full bg-[#c25550]" style={{ width: `${arPct}%` }} /></div><div className="mt-1 text-[10.5px] text-[var(--muted)]">{arPct}% من اللي ليك متأخر</div></div> : undefined} />}
    <KpiTile href="/visits?tab=insights" color="#5b8db8" tint="" label="جودة الزيارات" icon="reports" delay={210}
      value={<><Num v={p.quality.week} className="text-4xl font-extrabold text-[var(--navy)]" /><span className="pb-1.5 text-sm text-[var(--muted)]"> / 100</span></>}
      sub={`آخر 7 أيام · ${p.quality.visits} زيارة`} chip={p.quality.lastWeek > 0 ? { text: `${qDelta >= 0 ? "▲" : "▼"} ${Math.abs(qDelta)}`, tone: qDelta >= 0 ? "green" : "red" } : undefined}
      spark={<Spark data={qSeries} color="#5b8db8" />} />
  </section>;

  /* ───────── Visits panel ───────── */
  const visits = <section id="dash-visits" className={`${card} dz-in scroll-mt-24 p-5`} style={{ "--d": "260ms" } as React.CSSProperties}>
    <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2.5"><AIco name="visits" color="#10484f" anim="bob" box={38} size={19} /><div><h2 className="text-lg font-extrabold text-[var(--navy)]">الزيارات</h2><div className="text-[11px] text-[var(--muted)]">النهارده وآخر 14 يوم</div></div></div><Link href="/visits" className="text-xs font-bold text-[var(--navy)] opacity-70 hover:opacity-100">لوحة المتابعة ‹</Link></div>
    <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-[auto_1fr]">
      <div className="flex items-center gap-4 md:flex-col md:items-stretch">
        <Ring pct={p.today.planned ? p.today.done / p.today.planned * 100 : p.today.visits ? 100 : 0} size={116} color="#33b3a6"><Num v={p.today.visits} className="text-3xl font-extrabold text-[var(--navy)]" /><span className="mt-0.5 text-[10px] text-[var(--muted)]">{p.today.planned ? `من ${p.today.planned} مخطط` : "زيارة النهارده"}</span></Ring>
        <div className="grid flex-1 grid-cols-1 gap-1.5 text-[11.5px]">
          <Link href="/visits?tab=visits" className="flex items-center justify-between rounded-xl bg-emerald-50 px-2.5 py-1.5 font-bold text-emerald-800 hover:bg-emerald-100"><span className="flex items-center gap-1.5">{p.today.active > 0 && <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>}شغالين دلوقتي</span><span>{p.today.active}</span></Link>
          <Link href="/admin/reps" className="flex items-center justify-between rounded-xl bg-[var(--bg)] px-2.5 py-1.5 font-bold text-[var(--navy)] hover:bg-[var(--sky-light)]"><span>المناديب</span><span>{p.today.reps}</span></Link>
          <Link href="/visits?tab=insights" className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 font-bold ${p.today.red ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-[var(--bg)] text-[var(--muted)]"}`}><span className="flex items-center gap-1"><Icon name="flag" size={12} />تنبيهات</span><span>{p.today.red}</span></Link>
        </div>
      </div>
      <div className="min-w-0">
        <div className="h-5 text-[11px] text-[var(--muted)]">{hover !== null ? <span><b className="text-[var(--navy)]">{new Date(`${d.daily[hover].day}T12:00:00`).toLocaleDateString(L, { weekday: "long", day: "numeric", month: "short" })}</b> · {d.daily[hover].visits} زيارة{d.daily[hover].quality !== null ? ` · جودة ${d.daily[hover].quality}` : ""}{d.daily[hover].red ? ` · ${d.daily[hover].red} تنبيه` : ""}</span> : "مرّر على أي يوم — واضغط عشان تفتح زياراته"}</div>
        <div className="flex h-36 items-end gap-1" onMouseLeave={() => setHover(null)}>{d.daily.map((x, k) => <Link key={x.day} href={`/visits?tab=visits&day=${x.day}`} onMouseEnter={() => setHover(k)} onFocus={() => setHover(k)} className="flex h-full flex-1 flex-col items-center justify-end gap-1" aria-label={`${x.day}: ${x.visits} زيارة`}>
          <div className="dz-bar relative w-full max-w-7 overflow-hidden rounded-t-lg transition-opacity" style={{ height: `${x.visits ? Math.max(6, x.visits / maxDay * 100) : 3}%`, background: x.visits ? `linear-gradient(to top, ${qColor(x.quality)}, ${qColor(x.quality)}b3)` : "#eef2f5", opacity: hover === null || hover === k ? 1 : 0.45, "--d": `${300 + k * 35}ms` } as React.CSSProperties}>{x.red > 0 && <span className="absolute inset-x-0 top-0 h-1 bg-red-500" />}</div>
          <span className={`text-[9px] ${x.day === d.today ? "font-extrabold text-[var(--navy)]" : "text-[var(--muted)]"}`}>{x.day === d.today ? "النهارده" : new Date(`${x.day}T12:00:00`).toLocaleDateString(L, { day: "numeric" })}</span>
        </Link>)}</div>
        <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-[var(--muted)]"><span><i className="inline-block h-2 w-2 rounded-sm bg-emerald-500" /> ممتازة</span><span><i className="inline-block h-2 w-2 rounded-sm bg-amber-400" /> جيدة</span><span><i className="inline-block h-2 w-2 rounded-sm bg-orange-400" /> ضعيفة</span><span><i className="inline-block h-2 w-2 rounded-sm bg-red-500" /> فيها تنبيه</span></div>
      </div>
    </div>
    <Link href="/doctors?tab=insights" className="mt-4 grid grid-cols-1 gap-2 rounded-2xl bg-[var(--bg)] p-3 transition hover:bg-[var(--sky-light)] sm:grid-cols-3">{p.coverage.map(c => { const pc = c.total ? Math.round(c.visited / c.total * 100) : 0; return <div key={c.cls} className="flex items-center gap-2 text-[11px]"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold ${c.cls === "A" ? "bg-emerald-100 text-emerald-800" : c.cls === "B" ? "bg-sky-100 text-sky-800" : "bg-slate-200 text-slate-600"}`}>{c.cls}</span><div className="min-w-0 flex-1"><div className="flex justify-between"><span className="text-[var(--muted)]">تغطية الشهر</span><b>{c.visited}/{c.total}</b></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white"><div className={`dz-grow-x h-full rounded-full ${c.cls === "A" ? "bg-emerald-500" : c.cls === "B" ? "bg-sky-500" : "bg-slate-400"}`} style={{ width: `${pc}%` }} /></div></div></div>; })}</Link>
  </section>;

  /* ───────── Daftra sales panel ───────── */
  const SER: Record<string, [string, string]> = { sales: ["المبيعات", "#2e9d8f"], gross: ["مجمل الربح", "#15646a"], collected: ["التحصيل", "#5b8db8"] };
  const daftra = <section id="dash-money" className={`${card} dz-in scroll-mt-24 p-5`} style={{ "--d": "320ms" } as React.CSSProperties}>
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2.5"><AIco name="receipt" color="#2e9d8f" anim="rise" box={38} size={19} /><div><h2 className="text-lg font-extrabold text-[var(--navy)]">مبيعات دفترة</h2><div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">{f?.configured && <><span className={`h-1.5 w-1.5 rounded-full ${f.sync.running ? "animate-pulse bg-amber-500" : f.sync.ok === false ? "bg-red-500" : "bg-emerald-500"}`} />{f.sync.running ? "بيتحدث من دفترة…" : f.sync.at ? `آخر تحديث ${rel(f.sync.at)}` : "لسه ما اتحدثش"}</>}</div></div></div>
      <Link href="/sales" className="text-xs font-bold text-[var(--navy)] opacity-70 hover:opacity-100">افتح مبيعات دفترة ‹</Link></div>
    {!f ? <div className="mt-4 h-56 animate-pulse rounded-2xl bg-[var(--bg)]" /> : !f.configured ? <div className="mt-4 rounded-2xl bg-[var(--bg)] p-6 text-center text-sm text-[var(--muted)]">دفترة مش مربوطة على السيرفر.</div> : <>
      <div className="mt-3 flex gap-1 rounded-xl bg-[var(--bg)] p-1">{Object.entries(SER).map(([k, [l, c]]) => <button key={k} type="button" onClick={() => { setSer(k); setFh(null); }} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition ${ser === k ? "bg-white text-[var(--navy)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--navy)]"}`}><i className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</button>)}</div>
      <div className="mt-3 flex items-end justify-between gap-2"><div><div className="text-[11px] text-[var(--muted)]">{fh !== null ? mFull(f.series[fh].m) : "آخر 12 شهر"}</div><div className="text-2xl font-extrabold text-[var(--navy)]">{(fh !== null ? f.series[fh][ser as "sales"] : f.series.reduce((s, x) => s + x[ser as "sales"], 0)).toLocaleString("en-US", { maximumFractionDigits: 0 })} <span className="text-sm text-[var(--muted)]">ر.س</span></div></div>
        {f.year.margin !== null && <div className="text-left text-[11px] text-[var(--muted)]">هامش مجمل الربح<div className="text-base font-extrabold text-[var(--navy)]">{f.year.margin}%</div></div>}</div>
      {f.series.length >= 3 ? <Area key={ser} data={f.series.map(x => x[ser as "sales"])} labels={f.series.map(x => x.m)} color={SER[ser][1]} hover={fh} setHover={setFh} />
        : <div className="mt-3 rounded-2xl bg-gradient-to-l from-[var(--bg)] to-white p-4"><div className="grid grid-cols-3 gap-2">{([["sales", "المبيعات"], ["gross", "مجمل الربح"], ["collected", "التحصيل"]] as const).map(([key, lbl]) => { const v = f.series.reduce((a, x) => a + x[key], 0); const mx = Math.max(1, ...f.series.map(x => Math.max(x.sales, x.gross, x.collected))); return <div key={key}><div className="text-[11px] text-[var(--muted)]">{lbl}</div><div className="text-base font-extrabold text-[var(--navy)]">{short(v)}</div><div className="mt-1.5 flex h-16 items-end rounded-xl bg-white p-1"><div className="dz-bar w-full rounded-lg" style={{ height: `${Math.max(8, v / mx * 100)}%`, background: SER[key][1] }} /></div></div>; })}</div>
          <p className="mt-3 text-[11px] text-[var(--muted)]">الرسم الشهري هيظهر لما يتجمع 3 شهور من بداية الدفاتر ({f.series[0] ? mFull(f.series[0].m) : "الشهر ده"}).</p></div>}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href="/sales?tab=plan" className="group rounded-2xl border border-[var(--border)] p-3 transition hover:border-[var(--sky-border)] hover:bg-[var(--sky-light)]/50">
          <div className="flex items-center justify-between text-[11px] font-bold text-[var(--muted)]"><span>الشهر ده لحد النهارده</span><span className="dz-ico dz-spin !h-6 !w-6 !rounded-lg" style={{ color: "#10484f" }}><Icon name="plans" size={14} /></span></div>
          {f.plan?.target_revenue ? <><div className="mt-1 text-sm font-extrabold text-[var(--navy)]">{short(f.mtd.sales)} <span className="font-normal text-[var(--muted)]">من هدف {short(f.plan.target_revenue)}</span></div>
            <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className="dz-grow-x h-full rounded-full" style={{ width: `${Math.min(100, planPct || 0)}%`, background: (planPct || 0) >= f.day / f.days_in_month * 100 ? "#2e9d8f" : "#e99608" }} /><span className="absolute inset-y-0 w-0.5 bg-[var(--navy)]/60" style={{ right: `${f.day / f.days_in_month * 100}%` }} title="مكانك المفروض النهارده" /></div>
            <div className="mt-1 text-[10.5px] text-[var(--muted)]">الخط = المفروض توصل له النهارده · بنفس المعدل هتقفل {short(f.run_rate)}</div></>
            : <><div className="mt-1 text-sm font-extrabold text-[var(--navy)]">{short(f.mtd.sales)} <span className="font-normal text-[var(--muted)]">· بنفس المعدل {short(f.run_rate)}</span></div><div className="mt-1.5 text-[11px] font-bold text-[var(--sky-deep)]">اعمل خطة الشهر وحط هدف ‹</div></>}
        </Link>
        <div className="rounded-2xl border border-[var(--border)] p-3"><div className="mb-1.5 text-[11px] font-bold text-[var(--muted)]">الأكثر مبيعاً الشهر ده</div>
          {f.top_products.length ? <div className="space-y-1.5">{f.top_products.slice(0, 4).map((x, k) => <Link key={x.name} href="/sales?tab=sales" className="block text-[11px] hover:opacity-80"><div className="flex justify-between gap-2"><span className="truncate font-bold" dir="auto">{x.name}</span><span className="shrink-0 text-[var(--muted)]">{Math.round(x.qty)} حبة</span></div><div className="mt-0.5 h-1 overflow-hidden rounded-full bg-[var(--bg)]"><div className="dz-grow-x h-full rounded-full bg-[#2e9d8f]" style={{ width: `${x.net / (f.top_products[0].net || 1) * 100}%`, animationDelay: `${k * 80}ms` }} /></div></Link>)}</div>
            : <div className="py-3 text-center text-[11px] text-[var(--muted)]">لسه مفيش فواتير الشهر ده</div>}</div>
      </div>
    </>}
  </section>;

  /* ───────── System shortcuts (everything one tap away) ───────── */
  const inbox = <section id="inbox" className={`${card} dz-in scroll-mt-24 overflow-hidden`} style={{ "--d": "360ms" } as React.CSSProperties}>
    <div className="flex items-center justify-between p-5 pb-3"><div className="flex items-center gap-2"><h2 className="text-lg font-extrabold text-[var(--navy)]">محتاج قرارك</h2>{d.pendingTotal > 0 && <span className="rounded-full bg-[var(--navy)] px-2.5 py-0.5 text-xs font-bold text-white">{d.pendingTotal}</span>}</div>{g && <Link href={g.href} className="text-xs font-bold text-[var(--navy)] opacity-70 hover:opacity-100">افتح الكل ‹</Link>}</div>
    {!d.inbox.length ? <div className="px-5 pb-8 pt-4 text-center"><div className="es-pop mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Icon name="sparkle" size={30} /></div><div className="mt-2 font-extrabold text-[var(--navy)]">مفيش حاجة مستنياك</div><div className="text-sm text-[var(--muted)]">كل الخطط والطلبات والتوقيعات متراجعة</div></div> : <>
      <div className="flex gap-1.5 overflow-x-auto px-5 pb-3">{d.inbox.map(x => <button key={x.key} onClick={() => setGrp(x.key)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${grp === x.key ? "bg-[var(--navy)] text-white shadow" : "bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--navy)]"}`}><GlyphIcon g={x.icon} size={14} />{x.label}<span className={`rounded-full px-1.5 text-[10px] ${grp === x.key ? "bg-white/20" : "bg-white"}`}>{x.count}</span></button>)}</div>
      {g && <InboxList key={g.key} g={g} onDone={() => void load()} />}
    </>}
  </section>;

  const firstRed = d.insights.find(x => x.tone === "red");
  const shownInsights = d.insights.filter(x => x !== firstRed);
  const insights = <section className={`${card} dz-in p-5`} style={{ "--d": "380ms" } as React.CSSProperties}>
    <h2 className="mb-3 text-lg font-extrabold text-[var(--navy)]">يستاهل انتباهك</h2>
    {shownInsights.length ? <div className="space-y-2">{shownInsights.map((x, k) => <Link key={k} href={x.href} className={`block rounded-2xl border-r-4 p-3 transition hover:translate-x-[-2px] ${TONE[x.tone]}`}><div className="flex items-center gap-3"><GlyphIcon g={x.icon} chip size={18} box={34} /><div><div className="text-sm font-extrabold text-[var(--ink)]">{x.title}</div><div className="mt-0.5 text-[11px] leading-5 text-[var(--muted)]">{x.text}</div></div></div></Link>)}</div>
      : <div className="rounded-2xl bg-emerald-50 p-4 text-center text-sm font-bold text-emerald-800">✓ كله تمام — مفيش ملاحظات مهمة دلوقتي</div>}
  </section>;

  const team = <section className={`${card} p-5`}>
    <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold text-[var(--navy)]">الفريق النهارده</h2><Link href="/visits" className="text-xs font-bold text-[var(--navy)] opacity-70 hover:opacity-100">لوحة المتابعة ‹</Link></div>
    <div className="space-y-1">{d.team.map(t => { const [lbl, dot] = STATE[t.state] || STATE.idle; return <button type="button" key={t.rep_id} onClick={() => setRep(t)} className="w-full text-right flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-[var(--bg)]">
      <div className="relative"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--sky-light)] text-xs font-extrabold text-[var(--navy)]">{t.rep_name.split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase()}</div><span className={`absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-white ${dot} ${t.state === "active" ? "animate-pulse" : ""}`} /></div>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-bold">{t.rep_name}</span>{t.redFlags > 0 && <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-600"><Icon name="flag" size={11} />{t.redFlags}</span>}</div>
        <div className="mt-1 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full bg-[var(--navy)] transition-all duration-1000" style={{ width: `${t.planned ? Math.min(100, t.done / t.planned * 100) : t.visits ? 100 : 0}%`, opacity: t.planned ? 1 : 0.35 }} /></div><span className="w-24 text-left text-[10px] text-[var(--muted)]">{t.visits} زيارة{t.planned ? ` · ${t.done}/${t.planned}` : ""}</span></div></div>
      <span className="hidden w-16 text-center text-[10px] text-[var(--muted)] sm:block">{lbl}</span>
      <span className="flex h-8 w-10 items-center justify-center rounded-lg text-xs font-extrabold" style={{ background: t.avgQuality === null ? "#edf2f3" : `${qColor(t.avgQuality)}22`, color: t.avgQuality === null ? "#889799" : qColor(t.avgQuality) }}>{t.avgQuality ?? "—"}</span>
    </button>; })}</div>
  </section>;

  const activity = <section className={`${card} dz-in p-5`} style={{ "--d": "460ms" } as React.CSSProperties}>
    <h2 className="mb-3 text-lg font-extrabold text-[var(--navy)]">آخر النشاط</h2>
    <div className="grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">{d.activity.map((a, k) => <Link key={k} href={a.href} className={`min-w-0 items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-[var(--bg)] ${k >= 6 ? "hidden md:flex" : "flex"}`}>{actIcon(a.kind)}<div className="min-w-0 flex-1 truncate text-sm"><span className="font-bold">{a.who}</span> <span className="text-[var(--muted)]" dir="auto">{a.what}</span></div><span className="shrink-0 text-[10px] text-[var(--muted)]">{rel(a.at)}</span></Link>)}</div>
  </section>;

  const gapsCard = d.gaps && d.gaps.length > 0 ? <GapsCard gaps={d.gaps} onDone={() => void load()} /> : null;
  const decisions = d.inbox.length
    ? <div className="grid gap-4 lg:gap-5 xl:grid-cols-[1.5fr_1fr]">{inbox}<div className="flex flex-col gap-4 lg:gap-5">{gapsCard}{insights}</div></div>
    : <div className="flex flex-col gap-4 lg:gap-5">
        <div id="inbox" className="flex scroll-mt-24 items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-extrabold text-emerald-800 ring-1 ring-emerald-200"><Icon name="sparkle" size={18} />محتاج قرارك: كل حاجة متراجعة ✨<span className="mr-auto text-[11px] font-normal text-emerald-700/80">خطط وطلبات وتوقيعات</span></div>
        <div className={`grid gap-4 lg:gap-5 ${gapsCard ? "xl:grid-cols-2" : ""}`}>{gapsCard}{insights}</div>
      </div>;

  const repCard = rep && <Sheet title={rep.rep_name} onClose={() => setRep(null)} footer={<><Link href={`/admin/rep/${rep.rep_id}`} className={`${btnPrimary} flex flex-1 items-center justify-center`}>صفحة المندوب</Link><button type="button" className={btnGhost} onClick={() => setRep(null)}>إغلاق</button></>}>
    <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-[var(--sky-light)] p-4 text-[14px]">{([["الحالة", (STATE[rep.state] || STATE.idle)[0]], ["زيارات النهارده", String(rep.visits)], ["من خطة النهارده", rep.planned ? `${rep.done} من ${rep.planned}` : "مفيش خطة"], ["جودة الزيارات", rep.avgQuality === null ? "—" : `${rep.avgQuality}/100`], ["آخر نشاط", rep.sinceMin === null ? "لسه" : mins(rep.sinceMin)], ["تنبيهات", rep.redFlags ? `${rep.redFlags} زيارة عليها علامة` : "مفيش"]] as const).map(([a, b]) => <div key={a}><dt className="text-[12px] text-[var(--muted)]">{a}</dt><dd className="font-bold">{b}</dd></div>)}</dl>
    <div className="mt-4 grid grid-cols-2 gap-2"><Link href={`/visits?tab=visits&repId=${rep.rep_id}`} className="rounded-2xl border border-[var(--border)] px-3 py-3 text-center text-[13.5px] font-bold text-[var(--navy)] hover:bg-[var(--sky-light)]">زياراته</Link><Link href={`/plans?repId=${rep.rep_id}`} className="rounded-2xl border border-[var(--border)] px-3 py-3 text-center text-[13.5px] font-bold text-[var(--navy)] hover:bg-[var(--sky-light)]">خطته</Link></div>
  </Sheet>;
  const visitsPop = pop === "visits" && <Sheet title="زيارات النهارده" onClose={() => setPop("")} footer={<><Link href={`/visits?tab=visits&day=${d.today}`} className={`${btnPrimary} flex flex-1 items-center justify-center`}>كل زيارات النهارده</Link><button type="button" className={btnGhost} onClick={() => setPop("")}>إغلاق</button></>}>
    <p className="mb-3 text-[13px] text-[var(--muted)]">{p.today.visits} زيارة، و{p.today.active} مندوب شغال دلوقتي{p.today.planned ? `، ${p.today.done} من ${p.today.planned} في الخطة` : ""}</p>
    <ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)]">{d.team.map(t => <li key={t.rep_id}><button type="button" onClick={() => { setPop(""); setRep(t); }} className="flex w-full items-center gap-3 px-4 py-3 text-right hover:bg-[var(--sky-light)]">
      <span className={`h-2.5 w-2.5 rounded-full ${(STATE[t.state] || STATE.idle)[1]}`} /><span className="min-w-0 flex-1 truncate font-bold">{t.rep_name}</span><span className="text-[13px] text-[var(--muted)]">{t.visits} زيارة</span>{t.planned > 0 && <b className="text-[13px]">{t.done}/{t.planned}</b>}</button></li>)}</ul>
  </Sheet>;
  const arPop = pop === "ar" && f?.configured && <Sheet title="ليك عند العملاء" onClose={() => setPop("")} footer={<><Link href="/sales?tab=ar" className={`${btnPrimary} flex flex-1 items-center justify-center`}>كل العملاء والفواتير</Link><button type="button" className={btnGhost} onClick={() => setPop("")}>إغلاق</button></>}>
    <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-[var(--sky-light)] p-4 text-center">{([["الإجمالي", f.ar.total], ["متأخر", f.ar.overdue], ["أكتر من 60 يوم", f.ar.old60]] as const).map(([a, b]) => <div key={a}><dt className="text-[11.5px] text-[var(--muted)]">{a}</dt><dd className="text-[16px] font-extrabold text-[var(--navy)]">{short(b)}</dd></div>)}</dl>
    <h3 className="mb-2 mt-4 text-[14px] font-extrabold">أكبر العملاء المتأخرين</h3>
    <ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)]">{f.ar.top.map(x => <li key={x.name} className="flex items-center gap-3 px-4 py-3"><span className="min-w-0 flex-1"><b className="block truncate" dir="auto">{x.name}</b><span className="text-[12px] text-[var(--muted)]">أقدم فاتورة متأخرة {x.days} يوم</span></span><b className="shrink-0">{Math.round(x.unpaid).toLocaleString("en-US")} ر.س</b></li>)}</ul>
  </Sheet>;

  return <div className="calm mt-2 flex flex-col gap-4 pb-24 lg:gap-5 lg:pb-6">
    <style>{CALM}</style>{repCard}{visitsPop}{arPop}
    {header}
    <HealthHero h={hIn} />
    <StartHere input={aIn} today={d.today} onDone={() => void load()} />
    {pulse}
    <AdminSmartBoard />
    <div className={`grid gap-4 lg:gap-5 ${mgr ? "" : "xl:grid-cols-[1.25fr_1fr]"}`}>{visits}{!mgr && daftra}</div>
    {decisions}
    {team}
    {activity}
    <QuickFab mgr={mgr} />
  </div>;
}
