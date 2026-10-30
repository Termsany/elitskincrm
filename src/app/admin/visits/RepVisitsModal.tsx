"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DaySummary = { day: string; total: number; completed: number };
type DayVisit = { id: string; day: string; visited_at: string; status: string; doctor_name: string; clinic_name: string; city: string };
type VisitDetail = {
  id: string; visited_at: string; created_at: string; status: string; notes: string | null;
  lat: number | null; lng: number | null; accuracy_m: number | null;
  follow_up_at: string | null; follow_up_note: string | null;
  rep_id: string; rep_name: string;
  doctor_id: string; doctor_name: string; clinic_name: string | null; city: string | null; specialty: string | null;
  classification: string | null; phone: string | null;
  items: Array<{ id: string; product_name: string; kind: string; quantity: number; approval_status: string | null; approval_note: string | null; sample_purpose: string | null }>;
  presented: Array<{ product_name: string; reaction: string }>;
  attachments: Array<{ id: string; file_name: string; mime_type: string; size_bytes: number }>;
};

const TZ = "Asia/Riyadh";
const LOC = "ar-EG-u-nu-latn";
const WEEK = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const STATUS: Record<string, { label: string; cls: string }> = {
  completed: { label: "مكتملة", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  planned: { label: "مجدولة", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  cancelled: { label: "ملغاة", cls: "bg-red-50 text-red-800 border-red-200" },
  follow_up: { label: "متابعة", cls: "bg-sky-50 text-sky-800 border-sky-200" },
};
const REACTION: Record<string, { label: string; cls: string }> = {
  interested: { label: "مهتم", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  neutral: { label: "محايد", cls: "bg-slate-50 text-slate-700 border-slate-200" },
  not_interested: { label: "غير مهتم", cls: "bg-red-50 text-red-800 border-red-200" },
};
const APPROVAL: Record<string, string> = { pending: "بانتظار الموافقة", approved: "معتمد", rejected: "مرفوض" };

const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const monthLabel = (m: string) => new Intl.DateTimeFormat(LOC, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T12:00:00Z`));
const dayLabel = (d: string) => new Intl.DateTimeFormat(LOC, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const timeLabel = (t: string) => new Intl.DateTimeFormat(LOC, { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(t));
const dateTimeLabel = (t: string) => new Intl.DateTimeFormat(LOC, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(t));
const shiftMonth = (m: string, by: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] || { label: status, cls: "bg-slate-50 text-slate-700 border-slate-200" };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-[var(--border)] bg-white p-4"><div className="text-xs font-bold text-[var(--muted)] mb-2">{title}</div>{children}</div>;
}

const DAY_RE = /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const addDays = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const monthEnd = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };

export default function RepVisitsModal({ rep, onClose, initialDay = "" }: { rep: { id: string; name: string }; onClose: () => void; initialDay?: string }) {
  const startDay = DAY_RE.test(initialDay) ? initialDay : "";
  const [month, setMonth] = useState(() => (startDay || todayKey()).slice(0, 7));
  const [wanted, setWanted] = useState(startDay);
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [visits, setVisits] = useState<DayVisit[] | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VisitDetail | null>(null);
  const [error, setError] = useState("");

  // Lock page scroll + Escape steps back (details → day → close).
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  const back = useCallback(() => { if (visitId) setVisitId(null); else onClose(); }, [visitId, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") back(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  // Month → days with visits; auto-pick the latest active day.
  useEffect(() => {
    let alive = true; setDays(null); setError(""); setVisitId(null);
    fetch(`/api/admin/visits/timeline?repId=${rep.id}&month=${month}`).then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { if (!alive) return; const ds: DaySummary[] = j.days || []; setDays(ds); setDay(ds.find(d => d.day === wanted)?.day ?? ds[0]?.day ?? null); setWanted(""); })
      .catch(() => alive && (setDays([]), setError("تعذر تحميل أيام الزيارات")));
    return () => { alive = false; };
  }, [rep.id, month]);

  // Day → its visits.
  useEffect(() => {
    if (!day) { setVisits(null); return; }
    let alive = true; setVisits(null); setVisitId(null);
    fetch(`/api/admin/visits/timeline?repId=${rep.id}&day=${day}`).then(r => r.ok ? r.json() : Promise.reject())
      .then(j => alive && setVisits(j.visits || []))
      .catch(() => alive && (setVisits([]), setError("تعذر تحميل زيارات اليوم")));
    return () => { alive = false; };
  }, [rep.id, day]);

  // Visit → full details.
  useEffect(() => {
    if (!visitId) { setDetail(null); return; }
    let alive = true; setDetail(null);
    fetch(`/api/admin/visits/detail?id=${visitId}`).then(r => r.ok ? r.json() : Promise.reject())
      .then(j => alive && setDetail(j.visit))
      .catch(() => alive && setError("تعذر تحميل تفاصيل الزيارة"));
    return () => { alive = false; };
  }, [visitId]);

  const byDay = useMemo(() => new Map((days || []).map(d => [d.day, d])), [days]);
  const totals = useMemo(() => (days || []).reduce((a, d) => ({ v: a.v + d.total, c: a.c + d.completed }), { v: 0, c: 0 }), [days]);
  const maxDay = useMemo(() => Math.max(1, ...(days || []).map(d => d.total)), [days]);
  const cells = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)] as Array<string | null>;
  }, [month]);
  const today = todayKey();
  const anchor = day || (month === today.slice(0, 7) ? today : `${month}-01`);
  const weekFrom = addDays(anchor, -new Date(`${anchor}T12:00:00Z`).getUTCDay());
  const xl = (from: string, to: string) => `/api/admin/visits/export?repId=${rep.id}&from=${from}&to=${to}`;
  const idx = visits && visitId ? visits.findIndex(v => v.id === visitId) : -1;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={`زيارات ${rep.name}`}>
      <div dir="rtl" className="w-full max-w-5xl h-[92vh] sm:h-[86vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--bg)] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 justify-between bg-white border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs text-[var(--muted)]">زيارات المندوب</div>
            <div className="font-extrabold text-lg text-[var(--navy)] truncate">{rep.name}</div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-xl bg-[var(--bg)] px-3 py-1.5"><b className="text-sm">{totals.v}</b> زيارة</span>
            <span className="rounded-xl bg-[var(--bg)] px-3 py-1.5"><b className="text-sm">{totals.c}</b> مكتملة</span>
            <span className="rounded-xl bg-[var(--bg)] px-3 py-1.5"><b className="text-sm">{days?.length ?? 0}</b> يوم عمل</span>
            <button onClick={onClose} className="rounded-xl border border-[var(--border)] w-9 h-9 text-lg leading-none hover:bg-[var(--bg)]" aria-label="إغلاق">×</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-white border-b border-[var(--border)] px-4 py-2 text-xs">
          <span className="font-bold text-[var(--muted)]">تقرير Excel:</span>
          {day
            ? <a href={xl(day, day)} className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-2.5 py-1 font-bold hover:bg-emerald-100">اليوم ({day.slice(8)}/{day.slice(5, 7)})</a>
            : <span className="rounded-lg border border-[var(--border)] px-2.5 py-1 opacity-40">اليوم</span>}
          <a href={xl(weekFrom, addDays(weekFrom, 6))} className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-2.5 py-1 font-bold hover:bg-emerald-100">الأسبوع ({weekFrom.slice(8)}/{weekFrom.slice(5, 7)} – {addDays(weekFrom, 6).slice(8)}/{addDays(weekFrom, 6).slice(5, 7)})</a>
          <a href={xl(`${month}-01`, monthEnd(month))} className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-2.5 py-1 font-bold hover:bg-emerald-100">الشهر ({monthLabel(month)})</a>
        </div>
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Calendar */}
          <aside className={`md:w-[320px] shrink-0 border-b md:border-b-0 md:border-l border-[var(--border)] bg-white p-4 overflow-y-auto ${visitId ? "hidden md:block" : ""}`}>
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-lg border border-[var(--border)] w-8 h-8 hover:bg-[var(--bg)]" aria-label="الشهر السابق">›</button>
              <div className="font-extrabold text-[var(--navy)]">{monthLabel(month)}</div>
              <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= today.slice(0, 7)} className="rounded-lg border border-[var(--border)] w-8 h-8 hover:bg-[var(--bg)] disabled:opacity-30" aria-label="الشهر التالي">‹</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEK.map(w => <div key={w} className="text-[10px] text-[var(--muted)] pb-1">{w}</div>)}
              {cells.map((c, i) => {
                if (!c) return <div key={`e${i}`} />;
                const s = byDay.get(c); const on = c === day; const n = Number(c.slice(8));
                const shade = s ? 0.15 + 0.85 * (s.total / maxDay) : 0;
                return (
                  <button key={c} disabled={!s} onClick={() => setDay(c)} title={s ? `${s.total} زيارة · ${s.completed} مكتملة` : "لا زيارات"}
                    className={`relative aspect-square rounded-lg text-xs font-bold transition ${on ? "ring-2 ring-[var(--navy)] ring-offset-1" : ""} ${s ? "hover:scale-105 cursor-pointer" : "text-[var(--muted)]/50 cursor-default"} ${c === today ? "underline" : ""}`}
                    style={s ? { background: `rgba(16,72,79,${shade})`, color: shade > 0.5 ? "#fff" : "var(--ink)" } : undefined}>
                    {n}
                    {s && <span className="absolute bottom-0.5 inset-x-0 text-[9px] font-normal opacity-90">{s.total}</span>}
                  </button>
                );
              })}
            </div>
            {days && !days.length && <div className="text-sm text-[var(--muted)] mt-4 text-center">لا توجد زيارات في هذا الشهر</div>}
            {!days && <div className="text-sm text-[var(--muted)] mt-4 text-center">جاري التحميل…</div>}
            <Link href={`/visits/log?repId=${rep.id}`} onClick={onClose} className="block mt-4 text-center text-xs font-bold text-[var(--navy)] hover:underline">عرض في سجل الزيارات الكامل</Link>
          </aside>

          {/* Day visits / Visit details */}
          <main className="flex-1 min-w-0 overflow-y-auto p-4">
            {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">{error}</div>}

            {!visitId && (
              <>
                {day && <div className="flex items-center justify-between mb-3"><div className="font-extrabold text-[var(--navy)]">{dayLabel(day)}</div><div className="text-xs text-[var(--muted)]">{visits ? `${visits.length} زيارة` : ""}</div></div>}
                {!day && days && <div className="text-sm text-[var(--muted)] text-center mt-10">اختر يوماً من التقويم</div>}
                {day && !visits && <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-16 rounded-2xl bg-white animate-pulse" />)}</div>}
                <div className="space-y-2">
                  {visits?.map(v => (
                    <button key={v.id} onClick={() => setVisitId(v.id)} className="w-full text-right flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-3 hover:border-[var(--navy-3)] hover:shadow-sm transition">
                      <div className="w-14 shrink-0 text-center font-extrabold text-[var(--navy)] text-sm" dir="ltr">{timeLabel(v.visited_at)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate">{v.doctor_name}</div>
                        <div className="text-xs text-[var(--muted)] truncate">{[v.clinic_name, v.city].filter(Boolean).join(" · ")}</div>
                      </div>
                      <StatusBadge status={v.status} />
                      <span className="text-[var(--muted)]">‹</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {visitId && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <button onClick={() => setVisitId(null)} className="rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-bold hover:bg-[var(--bg)]">› زيارات {day ? dayLabel(day) : "اليوم"}</button>
                  {visits && visits.length > 1 && (
                    <div className="flex items-center gap-1 text-xs">
                      <button disabled={idx <= 0} onClick={() => setVisitId(visits[idx - 1].id)} className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 disabled:opacity-30">السابقة</button>
                      <span className="text-[var(--muted)] px-1">{idx + 1} / {visits.length}</span>
                      <button disabled={idx >= visits.length - 1} onClick={() => setVisitId(visits[idx + 1].id)} className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 disabled:opacity-30">التالية</button>
                    </div>
                  )}
                </div>
                {!detail && <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-24 rounded-2xl bg-white animate-pulse" />)}</div>}
                {detail && <VisitDetails v={detail} />}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function VisitDetails({ v }: { v: VisitDetail }) {
  const late = new Date(v.created_at).getTime() - new Date(v.visited_at).getTime() > 2 * 3600 * 1000;
  const samples = v.items.filter(i => i.kind === "sample");
  const orders = v.items.filter(i => i.kind === "order");
  const phone = (v.phone || "").replace(/\s/g, "");
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/doctors/${v.doctor_id}`} className="font-extrabold text-lg text-[var(--navy)] hover:underline">{v.doctor_name}</Link>
              {v.classification && <span className="rounded-md bg-[var(--sky-soft)] text-[var(--navy)] px-1.5 text-xs font-bold">{v.classification}</span>}
            </div>
            <div className="text-sm text-[var(--muted)] mt-0.5">{[v.specialty, v.clinic_name, v.city].filter(Boolean).join(" · ")}</div>
            {phone && <a href={`tel:${phone}`} className="text-sm text-[var(--navy)] hover:underline mt-1 inline-block" dir="ltr">{v.phone}</a>}
          </div>
          <StatusBadge status={v.status} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 text-xs">
          <div className="rounded-xl bg-[var(--bg)] p-2"><div className="text-[var(--muted)]">وقت الزيارة</div><div className="font-bold mt-0.5">{dateTimeLabel(v.visited_at)}</div></div>
          <div className="rounded-xl bg-[var(--bg)] p-2"><div className="text-[var(--muted)]">وقت التسجيل</div><div className="font-bold mt-0.5">{dateTimeLabel(v.created_at)}{late && <span className="mr-1 text-[var(--warn)]">· متأخر</span>}</div></div>
          <div className="rounded-xl bg-[var(--bg)] p-2"><div className="text-[var(--muted)]">الموقع</div><div className="font-bold mt-0.5">
            {v.lat != null && v.lng != null
              ? <a href={`https://www.google.com/maps?q=${v.lat},${v.lng}`} target="_blank" rel="noreferrer" className="text-[var(--navy)] hover:underline">فتح الخريطة{v.accuracy_m != null ? ` (±${Math.round(v.accuracy_m)}م)` : ""}</a>
              : <span className="text-[var(--muted)]">بدون موقع</span>}
          </div></div>
        </div>
      </div>

      <Section title="الملاحظات">
        <div className="text-sm whitespace-pre-wrap leading-7">{v.notes?.trim() || <span className="text-[var(--muted)]">لا توجد ملاحظات</span>}</div>
      </Section>

      <div className="grid md:grid-cols-2 gap-3">
        <Section title={`المنتجات المعروضة (${v.presented.length})`}>
          {v.presented.length ? <div className="space-y-1.5">{v.presented.map((p, i) => { const r = REACTION[p.reaction] || REACTION.neutral; return <div key={i} className="flex items-center justify-between gap-2 text-sm"><span className="font-bold">{p.product_name}</span><span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${r.cls}`}>{r.label}</span></div>; })}</div> : <div className="text-sm text-[var(--muted)]">لا يوجد</div>}
        </Section>
        <Section title={`العينات (${samples.length})`}>
          {samples.length ? <div className="space-y-1.5">{samples.map(s => <div key={s.id} className="flex items-center justify-between gap-2 text-sm"><span className="font-bold">{s.product_name}{s.sample_purpose ? <span className="font-normal text-[var(--muted)]"> · {s.sample_purpose}</span> : null}</span><span className="rounded-lg bg-[var(--bg)] px-2 font-bold">×{s.quantity}</span></div>)}</div> : <div className="text-sm text-[var(--muted)]">لا يوجد</div>}
        </Section>
        <Section title={`الأوردرات (${orders.length})`}>
          {orders.length ? <div className="space-y-1.5">{orders.map(o => <div key={o.id} className="text-sm"><div className="flex items-center justify-between gap-2"><span className="font-bold">{o.product_name}</span><span className="rounded-lg bg-[var(--bg)] px-2 font-bold">×{o.quantity}</span></div><div className="text-xs text-[var(--muted)]">{APPROVAL[o.approval_status || ""] || o.approval_status}{o.approval_note ? ` — ${o.approval_note}` : ""}</div></div>)}</div> : <div className="text-sm text-[var(--muted)]">لا يوجد</div>}
        </Section>
        <Section title="المتابعة القادمة">
          {v.follow_up_at ? <div className="text-sm"><div className="font-bold">{new Intl.DateTimeFormat(LOC, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${v.follow_up_at}T12:00:00Z`))}</div>{v.follow_up_note && <div className="text-[var(--muted)] mt-1">{v.follow_up_note}</div>}</div> : <div className="text-sm text-[var(--muted)]">لا توجد متابعة</div>}
        </Section>
      </div>

      <Section title={`المرفقات (${v.attachments.length})`}>
        {v.attachments.length ? <div className="flex flex-wrap gap-2">{v.attachments.map(a => <a key={a.id} href={`/api/visits/${v.id}/attachments/${a.id}`} target="_blank" rel="noreferrer" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--bg)]"><span className="font-bold">{a.file_name}</span> <span className="text-xs text-[var(--muted)]">{kb(a.size_bytes)}</span></a>)}</div> : <div className="text-sm text-[var(--muted)]">لا توجد مرفقات</div>}
      </Section>
    </div>
  );
}
