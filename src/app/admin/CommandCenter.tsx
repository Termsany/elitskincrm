"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type D = {
  greeting: string; name: string; today: string; summary: string; pendingTotal: number;
  inbox: Array<{ key: string; label: string; icon: string; href: string; count: number; items: Array<{ id: string; title: string; owner: string | null; at: string; href: string }> }>;
  pulse: { today: { visits: number; planned: number; done: number; active: number; reps: number; red: number }; quality: { week: number; lastWeek: number; visits: number; bands: { excellent: number; good: number; weak: number } };
    sales: { target: number; actual: number; forecast: number; pace: number; annual: number; ytd: number }; coverage: Array<{ cls: string; total: number; visited: number }> };
  team: Array<{ rep_id: string; rep_name: string; state: string; visits: number; planned: number; done: number; avgQuality: number | null; sinceMin: number | null; redFlags: number }>;
  daily: Array<{ day: string; visits: number; quality: number | null; red: number }>;
  insights: Array<{ tone: string; icon: string; title: string; text: string; href: string }>;
  activity: Array<{ kind: string; at: string; who: string; what: string; href: string }>;
};
const L = "ar-EG-u-nu-latn";
const card = "rounded-[28px] border border-[var(--border)] bg-white";
const short = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n));
const rel = (d: string) => { const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 1 ? "دلوقتي" : m < 60 ? `من ${m} د` : m < 1440 ? `من ${Math.floor(m / 60)} س` : m < 2880 ? "امبارح" : `من ${Math.floor(m / 1440)} يوم`; };
const qColor = (q: number | null) => q === null ? "#e2e8f0" : q >= 75 ? "#10b981" : q >= 50 ? "#f59e0b" : "#fb923c";
const STATE: Record<string, [string, string]> = { active: ["شغال", "bg-emerald-500"], paused: ["متوقف", "bg-amber-500"], done: ["خلّص ✓", "bg-sky-500"], idle: ["مسجلش", "bg-slate-300"] };
const TONE: Record<string, string> = { red: "border-r-red-500 bg-red-50/60", amber: "border-r-amber-400 bg-amber-50/60", green: "border-r-emerald-500 bg-emerald-50/60", blue: "border-r-sky-500 bg-sky-50/60" };
const ACT: Record<string, string> = { visit: "🩺", plan: "🗓️", file: "📄", sign: "🖋️", signreq: "📨" };

function useCount(v: number) {
  const [n, setN] = useState(0); const from = useRef(0);
  useEffect(() => { const s = from.current, start = performance.now(); let raf = 0; const step = (t: number) => { const p = Math.min(1, (t - start) / 700); const e = 1 - Math.pow(1 - p, 3); setN(Math.round(s + (v - s) * e)); if (p < 1) raf = requestAnimationFrame(step); else from.current = v; }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, [v]);
  return n;
}
const Num = ({ v, className = "" }: { v: number; className?: string }) => <span className={className}>{useCount(v)}</span>;
function Ring({ pct, size = 76, color = "#10484f", children }: { pct: number; size?: number; color?: string; children: React.ReactNode }) {
  const s = 7, r = (size - s) / 2, c = 2 * Math.PI * r;
  return <div className="relative shrink-0" style={{ width: size, height: size }}><svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f5" strokeWidth={s} /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={s} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)} style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)" }} /></svg><div className="absolute inset-0 flex flex-col items-center justify-center leading-none">{children}</div></div>;
}

export default function CommandCenter() {
  const [d, setD] = useState<D | null>(null); const [err, setErr] = useState(false); const [grp, setGrp] = useState<string>(""); const [hover, setHover] = useState<number | null>(null);
  const load = async () => { try { const r = await fetch("/api/admin/dashboard", { cache: "no-store" }); if (!r.ok) throw 0; const j = await r.json(); setD(j); setErr(false); } catch { setErr(true); } };
  useEffect(() => { void load(); const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 120000); return () => clearInterval(t); }, []);
  useEffect(() => { if (d && (!grp || !d.inbox.some(g => g.key === grp))) setGrp(d.inbox[0]?.key || ""); }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const openPalette = () => window.dispatchEvent(new Event("open-command-palette"));
  if (err && !d) return <div className={`${card} mt-4 p-8 text-center`}><div className="text-3xl">⚠️</div><div className="mt-2 font-bold">تعذر تحميل لوحة القيادة</div><button onClick={() => void load()} className="mt-3 rounded-xl bg-[var(--navy)] px-4 py-2 text-sm font-bold text-white">إعادة المحاولة</button></div>;
  if (!d) return <div className="mt-4 space-y-4"><div className="h-28 animate-pulse rounded-[28px] bg-white" /><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-40 animate-pulse rounded-[28px] bg-white" />)}</div><div className="h-72 animate-pulse rounded-[28px] bg-white" /></div>;

  const p = d.pulse; const g = d.inbox.find(x => x.key === grp);
  const salesPct = p.sales.target ? Math.round(p.sales.actual / p.sales.target * 100) : 0;
  const qDelta = p.quality.lastWeek ? p.quality.week - p.quality.lastWeek : 0;
  const maxDay = Math.max(1, ...d.daily.map(x => x.visits));
  const dateLabel = new Date(`${d.today}T12:00:00`).toLocaleDateString(L, { weekday: "long", day: "numeric", month: "long" });

  const header = <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div><div className="text-sm font-bold text-[var(--muted)]">{dateLabel}</div><h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[var(--navy)] sm:text-4xl">{d.greeting}، {d.name} <span className="inline-block origin-bottom-right animate-[wave_1.6s_ease-in-out_1]">👋</span></h1><p className="mt-2 text-sm text-[var(--muted)] sm:text-base">{d.summary}</p></div>
    <button onClick={openPalette} className="group flex h-12 w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 text-right shadow-sm transition hover:border-[var(--sky-border)] hover:shadow-md lg:w-[380px]"><span>🔎</span><span className="flex-1 text-sm text-[var(--muted)]">دوّر على أي حاجة أو اعمل أي حاجة…</span><kbd className="hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--muted)] sm:inline">Ctrl K</kbd></button>
    <style>{`@keyframes wave{0%,100%{transform:rotate(0)}20%{transform:rotate(-14deg)}40%{transform:rotate(10deg)}60%{transform:rotate(-8deg)}}`}</style>
  </section>;

  const pulse = <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
    <Link href="/visits" className={`${card} group p-4 transition hover:-translate-y-0.5 hover:shadow-lg sm:p-5`}>
      <div className="flex items-center justify-between"><span className="text-xs font-bold text-[var(--muted)]">النهارده</span>{p.today.active > 0 && <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />{p.today.active} شغال</span>}</div>
      <div className="mt-2 flex items-end gap-1.5"><Num v={p.today.visits} className="text-4xl font-extrabold text-[var(--navy)]" /><span className="pb-1.5 text-sm text-[var(--muted)]">زيارة</span></div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full bg-[var(--navy)] transition-all duration-1000" style={{ width: `${p.today.planned ? Math.min(100, p.today.done / p.today.planned * 100) : 0}%` }} /></div>
      <div className="mt-1.5 flex justify-between text-[11px] text-[var(--muted)]"><span>{p.today.planned ? `${p.today.done} من ${p.today.planned} في الخطة` : "مفيش خطة معتمدة النهارده"}</span>{p.today.red > 0 && <span className="font-bold text-red-600">🚩 {p.today.red}</span>}</div>
    </Link>
    <Link href="/visits?tab=insights" className={`${card} group flex flex-col items-start gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lg sm:flex-row sm:items-center sm:p-5`}>
      <Ring pct={p.quality.week} color={qColor(p.quality.visits ? p.quality.week : null)}><Num v={p.quality.week} className="text-xl font-extrabold text-[var(--navy)]" /><span className="text-[9px] text-[var(--muted)]">من 100</span></Ring>
      <div className="min-w-0"><div className="text-xs font-bold text-[var(--muted)]">جودة الزيارات</div><div className="text-[11px] text-[var(--muted)]">آخر 7 أيام · {p.quality.visits} زيارة</div>
        {p.quality.lastWeek > 0 && <div className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${qDelta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{qDelta >= 0 ? "▲" : "▼"} {Math.abs(qDelta)} عن الأسبوع اللي فات</div>}</div>
    </Link>
    <Link href="/sales" className={`${card} group flex flex-col items-start gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lg sm:flex-row sm:items-center sm:p-5`}>
      <Ring pct={salesPct} color={salesPct >= p.sales.pace ? "#10b981" : "#c8a24a"}><span className="text-xl font-extrabold text-[var(--navy)]">{p.sales.target ? <><Num v={salesPct} />%</> : "—"}</span><span className="text-[9px] text-[var(--muted)]">من الهدف</span></Ring>
      <div className="min-w-0"><div className="text-xs font-bold text-[var(--muted)]">مبيعات الشهر</div><div className="mt-0.5 text-sm font-extrabold text-[var(--navy)]">{short(p.sales.actual)} <span className="text-[11px] font-normal text-[var(--muted)]">/ {p.sales.target ? short(p.sales.target) : "مفيش هدف"}</span></div>
        <div className="mt-1 text-[11px] text-[var(--muted)]">الشهر عدّى {p.sales.pace}%{p.sales.forecast ? ` · التوقع ${short(p.sales.forecast)}` : ""}</div></div>
    </Link>
    <Link href="/doctors?tab=insights" className={`${card} group p-4 transition hover:-translate-y-0.5 hover:shadow-lg sm:p-5`}>
      <div className="text-xs font-bold text-[var(--muted)]">تغطية الأطباء الشهر ده</div>
      <div className="mt-3 space-y-2">{p.coverage.map(c => { const pc = c.total ? Math.round(c.visited / c.total * 100) : 0; return <div key={c.cls} className="flex items-center gap-2 text-[11px]"><span className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-extrabold ${c.cls === "A" ? "bg-emerald-100 text-emerald-800" : c.cls === "B" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"}`}>{c.cls}</span><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg)]"><div className={`h-full rounded-full transition-all duration-1000 ${c.cls === "A" ? "bg-emerald-500" : c.cls === "B" ? "bg-sky-500" : "bg-slate-400"}`} style={{ width: `${pc}%` }} /></div><span className="w-14 text-left font-bold">{c.visited}/{c.total}</span></div>; })}</div>
    </Link>
  </section>;

  const inbox = <section className={`${card} overflow-hidden`}>
    <div className="flex items-center justify-between p-5 pb-3"><div className="flex items-center gap-2"><h2 className="text-lg font-extrabold text-[var(--navy)]">محتاج قرارك</h2>{d.pendingTotal > 0 && <span className="rounded-full bg-[var(--navy)] px-2.5 py-0.5 text-xs font-bold text-white">{d.pendingTotal}</span>}</div>{g && <Link href={g.href} className="text-xs font-bold text-[var(--navy)] opacity-70 hover:opacity-100">افتح الكل ‹</Link>}</div>
    {!d.inbox.length ? <div className="px-5 pb-8 pt-4 text-center"><div className="text-5xl">🎉</div><div className="mt-2 font-extrabold text-[var(--navy)]">مفيش حاجة مستنياك</div><div className="text-sm text-[var(--muted)]">كل الخطط والطلبات والتوقيعات متراجعة</div></div> : <>
      <div className="flex gap-1.5 overflow-x-auto px-5 pb-3">{d.inbox.map(x => <button key={x.key} onClick={() => setGrp(x.key)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${grp === x.key ? "bg-[var(--navy)] text-white shadow" : "bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--navy)]"}`}><span>{x.icon}</span>{x.label}<span className={`rounded-full px-1.5 text-[10px] ${grp === x.key ? "bg-white/20" : "bg-white"}`}>{x.count}</span></button>)}</div>
      <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">{g?.items.map(it => <Link key={it.id} href={it.href} className="group flex items-center gap-3 px-5 py-3 transition hover:bg-[var(--sky-light)]/50">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--bg)] text-base">{g.icon}</span>
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-[var(--ink)]" dir="auto">{it.title}</div><div className="text-[11px] text-[var(--muted)]">{it.owner ? `${it.owner} · ` : ""}{rel(it.at)}</div></div>
        <span className="rounded-lg bg-[var(--navy)] px-2.5 py-1 text-[11px] font-bold text-white opacity-0 transition group-hover:opacity-100">راجع ‹</span>
      </Link>)}{g && g.count > g.items.length && <Link href={g.href} className="block px-5 py-2.5 text-center text-xs font-bold text-[var(--muted)] hover:text-[var(--navy)]">+ {g.count - g.items.length} كمان</Link>}</div>
    </>}
  </section>;

  const insights = <section className={`${card} p-5`}>
    <h2 className="mb-3 text-lg font-extrabold text-[var(--navy)]">يستاهل انتباهك</h2>
    {d.insights.length ? <div className="space-y-2">{d.insights.map((x, k) => <Link key={k} href={x.href} className={`block rounded-2xl border-r-4 p-3 transition hover:translate-x-[-2px] ${TONE[x.tone]}`}><div className="flex gap-2.5"><span className="text-lg leading-none">{x.icon}</span><div><div className="text-sm font-extrabold text-[var(--ink)]">{x.title}</div><div className="mt-0.5 text-[11px] leading-5 text-[var(--muted)]">{x.text}</div></div></div></Link>)}</div>
      : <div className="rounded-2xl bg-emerald-50 p-4 text-center text-sm font-bold text-emerald-800">✓ كله تمام — مفيش ملاحظات مهمة دلوقتي</div>}
  </section>;

  const team = <section className={`${card} p-5`}>
    <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold text-[var(--navy)]">الفريق النهارده</h2><Link href="/visits" className="text-xs font-bold text-[var(--navy)] opacity-70 hover:opacity-100">لوحة المتابعة ‹</Link></div>
    <div className="space-y-1">{d.team.map(t => { const [lbl, dot] = STATE[t.state] || STATE.idle; return <Link key={t.rep_id} href={`/visits?tab=visits&repId=${t.rep_id}`} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-[var(--bg)]">
      <div className="relative"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--navy)] to-[#1f7a7f] text-xs font-extrabold text-white">{t.rep_name.split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase()}</div><span className={`absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-white ${dot} ${t.state === "active" ? "animate-pulse" : ""}`} /></div>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-bold">{t.rep_name}</span>{t.redFlags > 0 && <span className="text-[10px] font-bold text-red-600">🚩{t.redFlags}</span>}</div>
        <div className="mt-1 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full bg-[var(--navy)] transition-all duration-1000" style={{ width: `${t.planned ? Math.min(100, t.done / t.planned * 100) : t.visits ? 100 : 0}%`, opacity: t.planned ? 1 : 0.35 }} /></div><span className="w-24 text-left text-[10px] text-[var(--muted)]">{t.visits} زيارة{t.planned ? ` · ${t.done}/${t.planned}` : ""}</span></div></div>
      <span className="hidden w-16 text-center text-[10px] text-[var(--muted)] sm:block">{lbl}</span>
      <span className="flex h-8 w-10 items-center justify-center rounded-lg text-xs font-extrabold" style={{ background: t.avgQuality === null ? "#f1f5f9" : `${qColor(t.avgQuality)}22`, color: t.avgQuality === null ? "#94a3b8" : qColor(t.avgQuality) }}>{t.avgQuality ?? "—"}</span>
    </Link>; })}</div>
  </section>;

  const trend = <section className={`${card} p-5`}>
    <div className="mb-1 flex items-center justify-between"><h2 className="text-lg font-extrabold text-[var(--navy)]">آخر 14 يوم</h2><div className="flex gap-2 text-[10px] text-[var(--muted)]"><span><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" /> ممتازة</span><span><span className="inline-block h-2 w-2 rounded-sm bg-amber-400" /> جيدة</span><span><span className="inline-block h-2 w-2 rounded-sm bg-orange-400" /> ضعيفة</span></div></div>
    <div className="h-6 text-[11px] text-[var(--muted)]">{hover !== null ? <span><b className="text-[var(--navy)]">{new Date(`${d.daily[hover].day}T12:00:00`).toLocaleDateString(L, { weekday: "long", day: "numeric", month: "short" })}</b> · {d.daily[hover].visits} زيارة{d.daily[hover].quality !== null ? ` · جودة ${d.daily[hover].quality}` : ""}{d.daily[hover].red ? ` · 🚩 ${d.daily[hover].red}` : ""}</span> : "مرّر على أي يوم للتفاصيل"}</div>
    <div className="flex h-40 items-end gap-1" onMouseLeave={() => setHover(null)}>{d.daily.map((x, k) => <Link key={x.day} href={`/visits?tab=visits&day=${x.day}`} onMouseEnter={() => setHover(k)} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
      <div className="relative w-full overflow-hidden rounded-t-lg transition-all duration-700" style={{ height: `${x.visits ? Math.max(6, x.visits / maxDay * 100) : 3}%`, background: x.visits ? qColor(x.quality) : "#eef2f5", opacity: hover === null || hover === k ? 1 : 0.45 }}>{x.red > 0 && <span className="absolute inset-x-0 top-0 h-1 bg-red-500" />}</div>
      <span className={`text-[9px] ${x.day === d.today ? "font-extrabold text-[var(--navy)]" : "text-[var(--muted)]"}`}>{x.day === d.today ? "النهارده" : new Date(`${x.day}T12:00:00`).toLocaleDateString(L, { day: "numeric" })}</span>
    </Link>)}</div>
    <div className="mt-2 text-[10px] text-[var(--muted)]">الخط الأحمر فوق العمود = فيه تنبيهات · اضغط على اليوم لزياراته</div>
  </section>;

  const activity = <section className={`${card} p-5`}>
    <h2 className="mb-3 text-lg font-extrabold text-[var(--navy)]">آخر النشاط</h2>
    <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">{d.activity.map((a, k) => <Link key={k} href={a.href} className={`items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-[var(--bg)] ${k >= 6 ? "hidden md:flex" : "flex"}`}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg)] text-sm">{ACT[a.kind] || "•"}</span><div className="min-w-0 flex-1 truncate text-sm"><span className="font-bold">{a.who}</span> <span className="text-[var(--muted)]" dir="auto">{a.what}</span></div><span className="shrink-0 text-[10px] text-[var(--muted)]">{rel(a.at)}</span></Link>)}</div>
  </section>;

  return <div className="mt-2 flex flex-col gap-4 pb-24 lg:gap-5 lg:pb-6">
    {header}
    <div className="order-2 lg:order-1">{pulse}</div>
    <div className="order-1 grid gap-4 lg:order-2 lg:gap-5 xl:grid-cols-[1.5fr_1fr]">{inbox}{insights}</div>
    <div className="order-3 grid gap-4 lg:gap-5 xl:grid-cols-[1.5fr_1fr]">{team}{trend}</div>
    <div className="order-4">{activity}</div>
  </div>;
}
