"use client";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { RepWeek } from "@/lib/plan-week";

const L = "ar-EG-u-nu-latn";
const card = "es-card-in rounded-[28px] border border-[var(--border)] bg-white shadow-sm";
export type TaskRow = { id: string; title: string; due: string | null; late: boolean };
export type RecentRow = { id: string; doctor_id: string; doctor: string; clinic: string; at: string; status: string };

const TONE: Record<string, { bg: string; fg: string; bar: string }> = {
  red: { bg: "from-red-50 to-white border-red-200", fg: "#c43636", bar: "#d64545" },
  amber: { bg: "from-amber-50 to-white border-amber-200", fg: "#a8700f", bar: "#e9a23b" },
  green: { bg: "from-emerald-50 to-white border-emerald-200", fg: "#13804f", bar: "#1aa865" },
  blue: { bg: "from-sky-50 to-white border-sky-200", fg: "#1f6fc4", bar: "#3b82f6" },
};
const toneOf = (t: string) => TONE[/red|danger|bad/.test(t) ? "red" : /amber|warn|orange|yellow/.test(t) ? "amber" : /green|ok|good/.test(t) ? "green" : "blue"];
const dayName = (d: string, w: "short" | "long" = "short") => new Intl.DateTimeFormat(L, { weekday: w, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const dnum = (d: string) => Number(d.slice(8, 10));

/** Gold glow + pulse used by the primary CTA; disabled for reduced-motion. */
export function RepStyles() {
  return <style>{`
@keyframes rp-glow{0%,100%{box-shadow:0 8px 22px -8px rgba(201,162,74,.7)}50%{box-shadow:0 8px 30px -4px rgba(201,162,74,.95)}}
@keyframes rp-pop{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
.rp-glow{animation:rp-glow 2.4s ease-in-out infinite}
.rp-pop{animation:rp-pop .5s cubic-bezier(.2,.8,.2,1) both}
@media (prefers-reduced-motion:reduce){.rp-glow,.rp-pop{animation:none}}
`}</style>;
}

export function SmartStrip({ week }: { week: RepWeek | null }) {
  const s = week?.suggestions.slice(0, 4) || [];
  if (!s.length) return null;
  return <section className={`${card} p-4 sm:p-5`} style={{ animationDelay: "40ms" }}>
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--sky-light)] text-[var(--navy)]"><Icon name="sparkle" size={19} /></span>
      <h2 className="flex-1 text-[17px] font-extrabold text-[var(--navy)]">اقتراحات ذكية ليك</h2>
      <Link href="/plans" className="text-[11.5px] font-bold text-[var(--sky-deep)]">الخطة ‹</Link>
    </div>
    <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-4">
      {s.map((x, i) => { const t = toneOf(x.tone);
        return <Link key={x.doctor_id} href={`/visits/new?doctorId=${x.doctor_id}`} className={`rp-pop relative flex min-w-[240px] snap-start flex-col gap-1 overflow-hidden rounded-2xl border bg-gradient-to-l p-3 pr-4 transition hover:-translate-y-0.5 hover:shadow-md active:scale-[.98] sm:min-w-0 ${t.bg}`} style={{ animationDelay: `${i * 70}ms` }}>
          <span className="absolute inset-y-0 right-0 w-1.5" style={{ background: t.bar }} />
          <b className="truncate text-sm text-[var(--navy)]" dir="auto">{x.name}{x.cls ? <span className="mr-1.5 rounded-md bg-white/70 px-1.5 text-[10px]">{x.cls}</span> : null}</b>
          <span className="truncate text-[11px] text-[var(--muted)]" dir="auto">{[x.clinic, x.city].filter(Boolean).join(" · ")}</span>
          <span className="line-clamp-2 min-h-[2.4em] text-[11.5px] font-bold" style={{ color: t.fg }}>{x.reason}</span>
          <span className="mt-1 flex items-center justify-between text-[11px] font-extrabold text-[var(--navy)]"><span>{x.day ? `يُفضّل ${dayName(x.day, "long")}` : "زيارة"}</span><span>زيارة ‹</span></span>
        </Link>; })}
    </div>
  </section>;
}

export function WeekStrip({ week }: { week: RepWeek | null }) {
  if (!week || !week.days.length) return null;
  const k = week.kpi;
  return <section className={`${card} p-4 sm:p-5`} style={{ animationDelay: "90ms" }}>
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--sky-light)] text-[var(--navy)]"><Icon name="calendar" size={19} /></span>
      <h2 className="flex-1 text-[17px] font-extrabold text-[var(--navy)]">أسبوعي</h2>
      <span className="text-[11.5px] text-[var(--muted)]">{k.done} من {k.planned} اتعملت{k.missed ? ` · ${k.missed} فاتت` : ""}</span>
    </div>
    <div className="grid grid-cols-5 gap-2">
      {week.days.slice(0, 7).map(d => { const today = d.date === week.today, past = d.date < week.today, pct = d.count ? Math.round(d.done / d.count * 100) : 0;
        return <Link key={d.date} href={`/plans?start=${week.start}`} className={`flex flex-col items-center gap-1 rounded-2xl border px-1 py-2.5 transition hover:-translate-y-0.5 ${today ? "border-[var(--navy)] bg-[var(--navy)] text-white shadow-md" : "border-[var(--border)] bg-white"} ${past && !today ? "opacity-70" : ""}`}>
          <span className={`text-[10.5px] font-bold ${today ? "text-white/80" : "text-[var(--muted)]"}`}>{dayName(d.date)}</span>
          <b className="text-lg leading-none">{dnum(d.date)}</b>
          <span className={`text-[10.5px] font-bold ${today ? "text-white" : d.count ? "text-[var(--navy)]" : "text-[var(--muted)]"}`}>{d.count ? `${d.count} زيارة` : "فاضي"}</span>
          <span className={`h-1 w-8 overflow-hidden rounded-full ${today ? "bg-white/25" : "bg-[var(--bg)]"}`}><span className="block h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: today ? "#c9a24a" : "#1aa865" }} /></span>
        </Link>; })}
    </div>
  </section>;
}

export function TasksCard({ tasks, open }: { tasks: TaskRow[]; open: number }) {
  if (!tasks.length) return null;
  return <section className={`${card} p-4`} style={{ animationDelay: "200ms" }}>
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--sky-light)] text-[var(--navy)]"><Icon name="tasks" size={19} /></span>
      <h2 className="flex-1 text-[17px] font-extrabold text-[var(--navy)]">مهامي</h2>
      <Link href="/work" className="text-[11.5px] font-bold text-[var(--sky-deep)]">الكل ({open}) ‹</Link>
    </div>
    <ul className="space-y-1.5">{tasks.map(t => <li key={t.id}><Link href="/work" className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] px-3 py-2.5 transition hover:bg-[var(--bg)]">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.late ? "bg-[#d64545]" : "bg-[#3b82f6]"}`} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-bold" dir="auto">{t.title}</span>
      {t.due && <span className={`shrink-0 text-[10.5px] font-bold ${t.late ? "text-[#d64545]" : "text-[var(--muted)]"}`}>{t.late ? "متأخرة" : new Intl.DateTimeFormat(L, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${t.due.slice(0, 10)}T12:00:00Z`))}</span>}
    </Link></li>)}</ul>
  </section>;
}

export function RecentVisits({ rows }: { rows: RecentRow[] }) {
  if (!rows.length) return null;
  return <section className={`${card} p-4`} style={{ animationDelay: "240ms" }}>
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--sky-light)] text-[var(--navy)]"><Icon name="visits" size={19} /></span>
      <h2 className="flex-1 text-[17px] font-extrabold text-[var(--navy)]">آخر زياراتي</h2>
      <Link href="/visits" className="text-[11.5px] font-bold text-[var(--sky-deep)]">الكل ‹</Link>
    </div>
    <ul className="space-y-1.5">{rows.map(r => <li key={r.id}><Link href={`/doctors/${r.doctor_id}`} className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-[var(--bg)]">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${r.status === "follow_up" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{r.status === "follow_up" ? "↻" : "✓"}</span>
      <span className="min-w-0 flex-1"><b className="block truncate text-[13px]" dir="auto">{r.doctor}</b><span className="block truncate text-[11px] text-[var(--muted)]" dir="auto">{r.clinic}</span></span>
      <span className="shrink-0 text-[10.5px] text-[var(--muted)]">{new Intl.DateTimeFormat(L, { day: "numeric", month: "short", timeZone: "Asia/Riyadh" }).format(new Date(r.at))}</span>
    </Link></li>)}</ul>
  </section>;
}
