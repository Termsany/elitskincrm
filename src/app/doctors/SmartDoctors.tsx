"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { HubDoctor } from "@/lib/doctors-hub";
import type { ClinicBalance } from "@/lib/clinic-balances";
import type { Prio, Tag, Tone } from "@/lib/doctor-priority";
import { sar } from "@/lib/fmt";

const short = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
const TONE: Record<Tone, string> = { red: "text-red-700", amber: "text-amber-800", teal: "text-teal-700", gold: "text-amber-700", slate: "text-slate-600", navy: "text-[var(--navy)]", green: "text-emerald-700" };
const RX: Record<string, [string, string]> = { interested: ["👍", "bg-emerald-50 text-emerald-800"], neutral: ["😐", "bg-slate-100 text-slate-700"], not_interested: ["👎", "bg-red-50 text-red-700"] };

/** Last 6 calendar months, oldest first, as YYYY-MM. */
export function last6(today: string) {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  return Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(y, m - 6 + i, 1)).toISOString().slice(0, 7));
}

export type TileDef = { tag: Tag; label: string; sub: string; icon: string; tone: string; on: string };
export const TILES: TileDef[] = [
  { tag: "a_late", label: "A متأخرين", sub: "عدّى ميعادهم", icon: "⚠️", tone: "text-red-600", on: "bg-red-600 text-white border-red-600" },
  { tag: "followup", label: "متابعات مستحقة", sub: "النهارده أو فاتت", icon: "↻", tone: "text-amber-700", on: "bg-amber-600 text-white border-amber-600" },
  { tag: "hot", label: "مهتمين وما اشتروش", sub: "اتشرح لهم ومفيش طلب", icon: "🔥", tone: "text-teal-700", on: "bg-teal-600 text-white border-teal-600" },
  { tag: "reorder", label: "عيادات جه ميعاد طلبها", sub: "حسب عادتها في دفترة", icon: "📦", tone: "text-amber-700", on: "bg-[#c9a24a] text-white border-[#c9a24a]" },
  { tag: "never", label: "ما اتزاروش خالص", sub: "فرص جديدة", icon: "✨", tone: "text-slate-600", on: "bg-slate-700 text-white border-slate-700" },
  { tag: "debt", label: "عليهم متأخرات", sub: "اسأل عن السداد الأول", icon: "💰", tone: "text-red-600", on: "bg-red-50 text-red-800 border-red-400 ring-2 ring-red-200" },
];

export function SmartTiles({ counts, active, onPick, loading }: { counts: Record<string, number>; active: Tag | ""; onPick: (t: Tag | "") => void; loading: boolean }) {
  return (
    <section aria-label="النهارده" className="-mx-1">
      <div className="mb-2 flex items-baseline gap-2 px-1"><h2 className="text-base font-extrabold text-[var(--navy)]">النهارده</h2><span className="text-[11px] text-[var(--muted)]">دوس على أي كارت يفلتر القايمة</span>
        {active && <button type="button" onClick={() => onPick("")} className="mr-auto text-xs font-bold text-[var(--navy)] underline-offset-2 hover:underline">مسح الفلتر ✕</button>}</div>
      <div className="flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {TILES.map((t, i) => { const on = active === t.tag; const n = counts[t.tag] ?? 0; return (
          <button key={t.tag} type="button" onClick={() => onPick(on ? "" : t.tag)} aria-pressed={on} style={{ animationDelay: `${i * 45}ms` }}
            className={`es-card-in min-w-[168px] snap-start rounded-[20px] border p-3 text-right shadow-sm transition hover:-translate-y-0.5 ${on ? t.on : "border-[var(--border)] bg-white"} ${!n && !on ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between gap-2"><span className="text-sm font-extrabold">{t.icon} {t.label}</span><b className={`text-2xl leading-none ${on ? "" : t.tone}`}>{loading ? "…" : n}</b></div>
            <div className={`mt-1 text-[10.5px] ${on ? "opacity-90" : "text-[var(--muted)]"}`}>{t.sub}</div>
          </button>); })}
      </div>
    </section>
  );
}

export function SmartCard({ d, p, b, months, today, fav, toggleFav, onOpen, selected, isAdmin, checked, onCheck, onTomorrow, added, onPause, onEdit, monthName }: {
  d: HubDoctor; p: Prio; b: ClinicBalance | null | undefined; months: string[]; today: string; fav: boolean; toggleFav: () => void; onOpen: () => void; selected: boolean; isAdmin: boolean;
  checked: boolean; onCheck: () => void; onTomorrow: () => void; added: boolean; onPause?: (v: boolean) => void; onEdit: () => void; monthName: string;
}) {
  const [more, setMore] = useState(false);
  const phone = (d.phone || "").replace(/\s/g, "");
  const seen = new Set(d.months6 || []);
  const money = !b ? null : b.overdue > 0 ? ["text-red-700", `💰 العيادة: متأخر ${sar(b.overdue)}`] : b.due ? ["text-amber-700", "📦 العيادة جه ميعاد طلبها"]
    : b.last_order ? ["text-emerald-700", `📈 آخر طلب للعيادة من ${Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${b.last_order}T12:00:00Z`)) / 864e5))} يوم`] : null;
  return (
    <article className={`rounded-[26px] border bg-white shadow-sm transition ${selected ? "border-teal-400 ring-2 ring-teal-100" : "border-[var(--border)] hover:shadow-md"} ${d.paused ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3 p-4 pb-3">
        <input type="checkbox" checked={checked} onChange={onCheck} aria-label={`تحديد ${d.name}`} className="mt-1 h-5 w-5 shrink-0 accent-[var(--navy)]" />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-right">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-extrabold ${d.classification === "A" ? "bg-[var(--navy)] text-white" : d.classification === "B" ? "bg-[var(--sky-soft)] text-[var(--navy)]" : "bg-slate-100 text-slate-600"}`}>{d.classification || "—"}</span>
            <span className="truncate text-base font-extrabold text-[var(--navy)]" dir="auto">{d.name}</span>
            {d.in_plan_next && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">🗓 {short(d.in_plan_next)}</span>}
            {fav && <span className="text-amber-500">★</span>}
          </div>
          <div className="mt-0.5 truncate text-xs text-[var(--muted)]" dir="auto">{[d.specialty, d.clinic_name, d.city].filter(Boolean).join(" · ")}</div>
          <div className={`mt-2 text-[13px] font-bold leading-6 ${TONE[p.tone]}`}>{p.icon} {p.reason}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="flex items-center gap-1" aria-label="زيارات آخر 6 شهور">{months.map((m, i) => { const on = seen.has(m); const cur = i === months.length - 1; return <span key={m} title={m} className={`h-2.5 w-2.5 rounded-full ${on ? "bg-teal-500" : cur ? "bg-slate-200" : d.days_since === null ? "bg-slate-200" : "bg-white ring-2 ring-red-300"}`} />; })}</span>
            <span className="text-[11px] text-[var(--muted)]">{d.days_since === null ? "لم تتم زيارة" : d.days_since === 0 ? "اتزار النهارده" : `آخر زيارة من ${d.days_since} يوم`}</span>
          </div>
          {(d.reactions?.length > 0 || money) && <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {(d.reactions || []).slice(0, 3).map(r => { const [ic, c] = RX[r.reaction] || RX.neutral; return <span key={r.name} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c}`} dir="auto">{ic} {r.name}</span>; })}
            {money && <span className={`mr-auto text-[11.5px] font-bold ${money[0]}`}>{money[1]}</span>}
          </div>}
        </button>
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--border)] px-3 py-2.5">
        {!isAdmin ? <Link href={`/visits/new?doctorId=${d.id}`} className="flex min-h-10 items-center rounded-xl bg-[var(--navy)] px-4 text-sm font-bold text-white">▶ سجل زيارة</Link>
          : <Link href={`/doctors/${d.id}`} className="flex min-h-10 items-center rounded-xl bg-[var(--navy)] px-4 text-sm font-bold text-white">الملف</Link>}
        <button type="button" onClick={onTomorrow} disabled={added} className={`flex min-h-10 items-center rounded-xl border px-3 text-sm font-bold transition ${added ? "es-pop border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[var(--border)] text-[var(--navy)] hover:border-teal-400"}`}>{added ? "✓ مضاف لبكرة" : "＋ بكرة"}</button>
        {phone && <a href={`tel:${phone}`} aria-label="اتصال" className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)]">📞</a>}
        <button type="button" onClick={() => setMore(x => !x)} aria-expanded={more} aria-label="خيارات أكتر" className="mr-auto grid h-10 w-10 place-items-center rounded-xl text-lg text-[var(--muted)] hover:bg-[var(--bg)]">⋯</button>
      </div>
      {more && <div className="es-pop flex flex-wrap gap-1.5 border-t border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-xs font-bold">
        <button type="button" onClick={toggleFav} className="rounded-lg bg-white px-3 py-2">{fav ? "★ شيل من المفضلة" : "☆ أضف للمفضلة"}</button>
        {onPause && <button type="button" onClick={() => onPause(!d.paused)} className="rounded-lg bg-white px-3 py-2">{d.paused ? `▶ Active لشهر ${monthName}` : `⏸ Inactive لشهر ${monthName}`}</button>}
        <button type="button" onClick={onEdit} className="rounded-lg bg-white px-3 py-2">{isAdmin ? "تعديل البيانات" : "طلب تعديل"}</button>
        <Link href={`/doctors/${d.id}`} className="rounded-lg bg-white px-3 py-2">الملف الكامل</Link>
      </div>}
    </article>
  );
}

/** Rep: how many good candidates there are per city, and one tap to draft next week's plan from them. */
export function PlanWeekCard({ list, prio }: { list: HubDoctor[]; prio: Map<string, Prio> }) {
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const cand = list.filter(d => !d.paused && !d.in_plan_next && (prio.get(d.id)?.score ?? 0) >= 20);
  const byCity = [...cand.reduce((m, d) => m.set(d.city || "غير محدد", (m.get(d.city || "غير محدد") || 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!cand.length) return null;
  async function run() {
    setBusy(true); setMsg("");
    const r = await fetch("/api/plans/auto", { method: "POST" }); const j = await r.json().catch(() => null); setBusy(false);
    if (!r.ok) { setMsg(j?.error || "تعذر عمل الخطة"); return; }
    const made = Array.isArray(j?.created) ? j.created.length : Number(j?.created || 0);
    setMsg(made ? "✓ اتعملت مسودة خطة الأسبوع الجاي — راجعها وابعتها للاعتماد" : "عندك خطة للأسبوع الجاي بالفعل — افتحها وعدّل عليها");
  }
  return (
    <section className="es-card-in rounded-[26px] border border-[var(--border)] bg-gradient-to-l from-[var(--sky-light)] to-white p-4 shadow-sm">
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-lg shadow-sm">🎯</span>
        <div className="min-w-0 flex-1"><div className="font-extrabold text-[var(--navy)]">خطط أسبوعك</div>
          <div className="mt-0.5 text-xs leading-5 text-[var(--muted)]">عندك <b className="text-[var(--navy)]">{cand.length}</b> طبيب محتاجين زيارة ومش في خطتك: {byCity.map(([c, n]) => `${n} في ${c}`).join("، ")}</div></div></div>
      {msg ? <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--navy)]">{msg}<Link href="/plans" className="rounded-lg bg-[var(--navy)] px-3 py-1.5 text-white">افتح الخطة ‹</Link></div>
        : <button type="button" onClick={() => void run()} disabled={busy} className="mt-3 min-h-10 w-full rounded-xl bg-[var(--navy)] text-sm font-bold text-white disabled:opacity-50">{busy ? "بيرتّب…" : "رتّبهم على أيام الأسبوع الجاي ←"}</button>}
    </section>
  );
}

/** Admin: each rep's coverage of A/B/C doctors in the period (doctors the rep visited ÷ all active doctors of the class). */
export function TeamCoverage({ rows, reps }: { rows: HubDoctor[]; reps: Array<{ id: string; name: string }> }) {
  const tot = (c: string) => rows.filter(d => d.classification === c && !d.paused).length || 1;
  if (!reps.length) return null;
  return (
    <section className="rounded-[26px] border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="mb-3 font-extrabold text-[var(--navy)]">👥 تغطية الفريق <span className="text-[11px] font-normal text-[var(--muted)]">(في الفترة)</span></div>
      <div className="space-y-3">{reps.map(r => <div key={r.id}>
        <div className="mb-1 text-xs font-bold" dir="auto">{r.name}</div>
        <div className="grid grid-cols-3 gap-2">{["A", "B", "C"].map(c => { const n = rows.filter(d => d.classification === c && (d.reps || "").split("، ").includes(r.name)).length; const pct = Math.round(n / tot(c) * 100); return (
          <div key={c}><div className="flex justify-between text-[10px] text-[var(--muted)]"><span>{c}</span><b className="text-[var(--ink)]">{pct}%</b></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg)]"><div className={`es-grow h-full rounded-full ${pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-400"}`} style={{ width: `${Math.max(3, pct)}%` }} /></div></div>); })}</div>
      </div>)}</div>
    </section>
  );
}

type Acc = { balance: { unpaid: number; overdue: number; oldest: number | null }; orders: { last: string | null; days_since: number | null; next_expected: string | null }; products: Array<{ item: string; net: number }>; branches?: string[] };
/** Doctor preview: the clinic's Daftra account in three lines. */
export function ClinicMini({ clinicId, clinicName }: { clinicId: string | null; clinicName: string | null }) {
  const [a, setA] = useState<Acc | null | undefined>(undefined);
  useEffect(() => {
    let on = true; setA(undefined);
    const qs = clinicId ? `id=${clinicId}` : clinicName ? `name=${encodeURIComponent(clinicName)}` : "";
    if (!qs) { setA(null); return; }
    fetch(`/api/clinics/account?${qs}`).then(r => r.ok ? r.json() : null).then(j => { if (on) setA(j?.account || null); }).catch(() => { if (on) setA(null); });
    return () => { on = false; };
  }, [clinicId, clinicName]);
  if (a === undefined) return <div className="es-shimmer h-20 rounded-2xl" />;
  if (!a) return null;
  const b = a.balance;
  return (
    <div className="rounded-2xl border border-[var(--border)] p-3 text-sm">
      <div className="mb-1.5 flex items-center justify-between"><b className="text-[var(--navy)]">حساب العيادة</b>{a.branches?.length ? <span className="text-[10.5px] text-[var(--muted)]">🏢 مشترك مع {a.branches.length} فروع</span> : null}</div>
      <div className={`text-[12.5px] font-bold ${b.overdue > 0 ? "text-red-700" : b.unpaid > 0 ? "text-sky-800" : "text-emerald-700"}`}>{b.overdue > 0 ? `متأخر ${sar(b.overdue)}${b.oldest ? ` من ${b.oldest} يوم` : ""} — اسأل عن السداد الأول` : b.unpaid > 0 ? `عليها ${sar(b.unpaid)} لسه ما جاش ميعادها` : "✓ مفيش مديونية"}</div>
      <div className="mt-1 text-[11.5px] text-[var(--muted)]">{a.orders.last ? `آخر طلب من ${a.orders.days_since} يوم${a.orders.next_expected ? ` · المتوقع ${short(a.orders.next_expected)}` : ""}` : "لسه ما طلبتش"}</div>
      {a.products.length > 0 && <div className="mt-1.5 truncate text-[11.5px]" dir="auto">بتشتري: {a.products.slice(0, 3).map(p => p.item).join(" · ")}</div>}
    </div>
  );
}
