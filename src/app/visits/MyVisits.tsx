"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { REACTION_LABELS } from "@/lib/visit-entry";
import { canEditVisit } from "@/lib/visit-workflow";
import type { OpenFollowup } from "@/lib/followups";
import { FollowupRow } from "@/components/FollowupRow";

type Item = { id: string; product_id: string; product_name: string; kind: "sample" | "order"; quantity: number; approval_status: string | null };
type V = { id: string; visited_at: string; day: string; notes: string; status: string; sales_rep_id: string; doctor_id: string; doctor_name: string; clinic_name: string | null; city: string | null; cls: string | null;
  follow_up_at: string | null; follow_up_note: string; follow_up_open: boolean; items: Item[]; presented: Array<{ product_id: string; product_name: string; reaction: string }>; attachments: Array<{ id: string; file_name: string }> };
type Stats = { today: string; visits: number; result: number };
type Flag = "" | "followup" | "order" | "sample" | "noresult" | "cancelled";
const FLAGS: Array<[Flag, string]> = [["", "الكل"], ["followup", "محتاجة متابعة"], ["order", "فيها طلب"], ["sample", "فيها عينات"], ["noresult", "من غير نتيجة"], ["cancelled", "ملغية"]];
const PERIODS: Array<[string, string]> = [["week", "الأسبوع ده"], ["month", "الشهر ده"], ["all", "الكل"]];
const PAGE = 40;
const add = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dayTitle = (d: string, today: string) => d === today ? "النهارده" : d === add(today, -1) ? "امبارح" : new Intl.DateTimeFormat("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const time = (s: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date(s));
const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
const RX: Record<string, string> = { interested: "bg-emerald-50 text-emerald-700", neutral: "bg-slate-100 text-slate-600", not_interested: "bg-red-50 text-red-700" };
const CLS: Record<string, string> = { A: "bg-[var(--navy)] text-white", B: "bg-[var(--sky-soft)] text-[var(--navy)]" };

/** The rep's visits: open follow-ups first, then visits grouped by day with everything that happened and one-tap next steps. */
export default function MyVisits() {
  const toast = useToast();
  const [rows, setRows] = useState<V[]>([]); const [more, setMore] = useState(false); const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(""); const [flag, setFlag] = useState<Flag>(""); const [period, setPeriod] = useState("month");
  const [stats, setStats] = useState<Stats | null>(null); const [fu, setFu] = useState<OpenFollowup[]>([]); const [showFu, setShowFu] = useState(false);
  const [open, setOpen] = useState(""); const [edit, setEdit] = useState<{ v: V; notes: string; status: string; follow: string } | null>(null);
  const today = stats?.today || new Date().toISOString().slice(0, 10);
  const seq = useRef(0);

  const params = useCallback((offset: number) => {
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (q.trim()) p.set("q", q.trim());
    if (flag === "cancelled") p.set("status", "cancelled"); else if (flag) p.set("flag", flag);
    if (period !== "all") p.set("from", `${period === "week" ? add(today, -new Date(`${today}T12:00:00Z`).getUTCDay()) : `${today.slice(0, 7)}-01`}T00:00:00+03:00`);
    return p;
  }, [q, flag, period, today]);
  const load = useCallback(async (append = false) => {
    const n = ++seq.current; setLoading(true);
    const j = await fetch(`/api/visits?${params(append ? rows.length : 0)}`).then(r => r.ok ? r.json() : null).catch(() => null);
    if (n !== seq.current) return; setLoading(false);
    if (!j) { toast("تعذر تحميل الزيارات", "error"); return; }
    setRows(r => append ? [...r, ...j.visits] : j.visits); setMore(j.visits.length === PAGE);
  }, [params, rows.length, toast]);
  const loadSide = useCallback(() => {
    fetch("/api/my/visit-stats").then(r => r.ok ? r.json() : null).then(j => j && setStats(j)).catch(() => {});
    fetch("/api/my/followups").then(r => r.ok ? r.json() : null).then(j => j && setFu(j.followups)).catch(() => {});
  }, []);
  useEffect(() => { loadSide(); }, [loadSide]);
  // search waits for typing to stop; chips apply at once
  useEffect(() => { const t = setTimeout(() => void load(), q ? 350 : 0); return () => clearTimeout(t); }, [q, flag, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => { const m = new Map<string, V[]>(); for (const v of rows) m.set(v.day, [...(m.get(v.day) || []), v]); return [...m.entries()]; }, [rows]);
  const overdue = fu.filter(f => f.due < today).length, dueNow = fu.filter(f => f.due <= today).length;
  const refresh = () => { void load(); loadSide(); };

  async function saveEdit() {
    if (!edit) return;
    if (edit.notes.trim().length < 10) { toast("الملاحظات 10 حروف على الأقل", "error"); return; }
    const r = await fetch(`/api/visits/${edit.v.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ notes: edit.notes, status: edit.status, follow_up_at: edit.follow }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) { toast(j?.error || "تعذر الحفظ", "error"); return; }
    toast("اتحفظ ✓", "success"); setEdit(null); refresh();
  }
  async function upload(id: string, file: File) {
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch(`/api/visits/${id}/attachments`, { method: "POST", body: fd });
    toast(r.ok ? "اترفع ✓" : "تعذر الرفع", r.ok ? "success" : "error"); if (r.ok) void load();
  }

  const card = (v: V) => {
    const samples = v.items.filter(i => i.kind === "sample"), orders = v.items.filter(i => i.kind === "order");
    const best = v.presented.find(p => p.reaction === "interested")?.product_id || v.presented[0]?.product_id || "";
    const isOpen = open === v.id, editable = canEditVisit({ isAdmin: false, userId: v.sales_rep_id, visit: v });
    // a visit that happened but recorded nothing (no product, sample, order, follow-up, and a short note)
    const noResult = v.status !== "cancelled" && v.status !== "planned" && !v.presented.length && !v.items.length && !v.follow_up_at && v.notes.trim().length < 20;
    return <li key={v.id} className={`rounded-[20px] border bg-white p-3.5 transition ${v.status === "cancelled" ? "border-red-100 opacity-75" : "border-[var(--border)]"}`}>
      <button type="button" onClick={() => setOpen(isOpen ? "" : v.id)} className="flex w-full items-start gap-3 text-right">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-extrabold ${CLS[v.cls || ""] || "bg-slate-100 text-slate-600"}`}>{v.cls || "—"}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2"><b className="truncate text-[15px] text-[var(--navy)]" dir="auto">{v.doctor_name}</b><span className="mr-auto shrink-0 text-[11.5px] text-[var(--muted)]">{time(v.visited_at)}</span></span>
          <span className="block truncate text-[12px] text-[var(--muted)]" dir="auto">{[v.clinic_name, v.city].filter(Boolean).join(" · ")}</span>
          <span className="mt-1.5 flex flex-wrap gap-1">
            {v.status === "cancelled" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">ملغية</span>}
            {noResult && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">⚠ كمّلها</span>}
            {v.presented.map(p => <span key={p.product_id} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${RX[p.reaction] || RX.neutral}`} dir="auto">{p.product_name} · {REACTION_LABELS[p.reaction] || p.reaction}</span>)}
            {samples.length > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">🎁 {samples.reduce((s, i) => s + i.quantity, 0)} عينة</span>}
            {orders.length > 0 && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-800">🧾 طلب {orders.map(o => `${o.product_name} ×${o.quantity}`).join("، ")}</span>}
            {v.follow_up_open && v.follow_up_at && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${v.follow_up_at < today ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-800"}`}>↻ متابعة {dm(v.follow_up_at)}</span>}
          </span>
          {v.notes && <span className={`mt-1.5 block whitespace-pre-line text-[13px] leading-6 text-[var(--ink)] ${isOpen ? "" : "line-clamp-2"}`} dir="auto">{v.notes}</span>}
        </span>
      </button>
      {isOpen && <div className="es-pop mt-3 space-y-2 border-t border-[var(--border)] pt-3">
        {v.follow_up_open && v.follow_up_at ? <ul><FollowupRow f={{ id: v.id, source: "visit", due: v.follow_up_at, note: v.follow_up_note || "متابعة الزيارة دي" }} today={today} onChanged={refresh} /></ul>
          : v.follow_up_note ? <p className="rounded-xl bg-sky-50 px-3 py-2 text-[12.5px] text-sky-900" dir="auto">↻ {v.follow_up_note}</p> : null}
        {noResult && editable && <button type="button" onClick={() => setEdit({ v, notes: v.notes, status: v.status, follow: v.follow_up_at || "" })} className="w-full rounded-xl bg-amber-50 px-3 py-2.5 text-right text-[13px] font-bold text-amber-900 ring-1 ring-amber-200">⚠ كمّلها: اكتب حصل إيه أو حط متابعة</button>}
        {v.attachments.length > 0 && <div className="flex flex-wrap gap-1.5">{v.attachments.map(a => <a key={a.id} href={`/api/visits/${v.id}/attachments/${a.id}`} target="_blank" rel="noreferrer" className="rounded-lg bg-[var(--bg)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--navy)]">📎 {a.file_name}</a>)}</div>}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Link href={`/visits/new?doctorId=${v.doctor_id}${best ? `&productId=${best}` : ""}`} className="flex min-h-11 items-center justify-center rounded-xl bg-[var(--navy)] px-4 text-sm font-bold text-white">▶ زيارة جديدة</Link>
          <Link href={`/doctors/${v.doctor_id}`} className="flex min-h-11 items-center justify-center rounded-xl border border-[var(--border)] px-4 text-sm font-bold text-[var(--navy)]">صفحة الطبيب</Link>
          {editable && <button type="button" onClick={() => setEdit({ v, notes: v.notes, status: v.status, follow: v.follow_up_at || "" })} className="min-h-11 rounded-xl border border-[var(--border)] px-4 text-sm font-bold">✎ تعديل</button>}
          <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-[var(--border)] px-4 text-sm font-bold">📎 مرفق<input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(v.id, f); e.target.value = ""; }} /></label>
        </div>
      </div>}
    </li>;
  };

  return <div className="space-y-4">
    <div className="grid grid-cols-3 gap-2.5">
      <div className="rounded-[20px] border border-[var(--border)] bg-white p-3"><div className="text-[11.5px] text-[var(--muted)]">زيارات الشهر</div><div className="text-2xl font-black text-[var(--navy)]">{stats?.visits ?? "—"}</div><div className="text-[11px] text-[var(--muted)]">النهارده {stats?.today ? (rows.filter(r => r.day === stats.today && r.status !== "cancelled").length) : "—"}</div></div>
      <div className="rounded-[20px] border border-[var(--border)] bg-white p-3"><div className="text-[11.5px] text-[var(--muted)]">ليها نتيجة</div><div className="text-2xl font-black text-[var(--navy)]">{stats && stats.visits ? `${Math.round(stats.result / stats.visits * 100)}%` : "—"}</div>
        <button type="button" onClick={() => setFlag("noresult")} className="text-[11px] font-bold text-teal-700">{stats ? `${stats.visits - stats.result} من غير نتيجة` : ""}</button></div>
      <button type="button" onClick={() => setShowFu(x => !x)} className={`rounded-[20px] border p-3 text-right ${overdue ? "border-red-200 bg-red-50/50" : "border-[var(--border)] bg-white"}`}><div className="text-[11.5px] text-[var(--muted)]">متابعات مفتوحة</div>
        <div className={`text-2xl font-black ${overdue ? "text-red-600" : "text-[var(--navy)]"}`}>{fu.length}</div><div className="text-[11px] font-bold text-teal-700">{overdue ? `${overdue} متأخرة` : dueNow ? `${dueNow} النهارده` : "عرض"} {showFu ? "▴" : "▾"}</div></button>
    </div>

    {(showFu || overdue > 0) && fu.length > 0 && <section className="rounded-[22px] border border-[var(--border)] bg-white p-3.5">
      <h3 className="mb-2 font-extrabold text-[var(--navy)]">متابعاتك</h3>
      <ul className="space-y-2">{(showFu ? fu : fu.filter(f => f.due < today)).map(f => <FollowupRow key={f.source + f.id} f={f} today={today} onChanged={refresh} showDoctor />)}</ul>
    </section>}

    <div className="sticky top-2 z-10 space-y-2 rounded-[22px] border border-[var(--border)] bg-white/95 p-3 backdrop-blur">
      <div className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 طبيب، عيادة، كلمة في الملاحظات" className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--border)] px-3 text-[15px]" />
        <Link href="/visits/new" className="flex h-11 shrink-0 items-center rounded-xl bg-[var(--navy)] px-4 text-sm font-bold text-white">＋ زيارة</Link>
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {PERIODS.map(([k, l]) => <button key={k} type="button" onClick={() => setPeriod(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${period === k ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)] text-[var(--muted)]"}`}>{l}</button>)}
        <span className="mx-1 w-px shrink-0 bg-[var(--border)]" />
        {FLAGS.map(([k, l]) => <button key={k || "all"} type="button" onClick={() => setFlag(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${flag === k ? "bg-teal-600 text-white" : "bg-[var(--bg)] text-[var(--muted)]"}`}>{l}</button>)}
      </div>
    </div>

    {loading && !rows.length ? <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="es-shimmer h-24 rounded-[20px]" />)}</div>
      : !rows.length ? <div className="rounded-[22px] border border-dashed border-[var(--border-strong)] bg-white p-8 text-center"><p className="text-sm text-[var(--muted)]">مفيش زيارات هنا</p><Link href="/visits/new" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-[var(--navy)] px-5 text-sm font-bold text-white">＋ سجل زيارة</Link></div>
      : groups.map(([day, vs]) => <section key={day}>
        <h3 className="mb-2 flex items-baseline gap-2 px-1 text-[13px] font-extrabold text-[var(--navy)]">{dayTitle(day, today)}<span className="text-[11px] font-normal text-[var(--muted)]">{vs.filter(v => v.status !== "cancelled").length} زيارة</span></h3>
        <ul className="space-y-2">{vs.map(card)}</ul>
      </section>)}
    {more && <button type="button" disabled={loading} onClick={() => void load(true)} className="min-h-11 w-full rounded-xl bg-white text-sm font-bold text-[var(--navy)] ring-1 ring-[var(--border)]">{loading ? "…" : "أقدم"}</button>}

    {edit && <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--navy)]/30 sm:items-center" onClick={() => setEdit(null)}>
      <div role="dialog" aria-modal="true" aria-label="تعديل الزيارة" onClick={e => e.stopPropagation()} className="w-full max-w-lg space-y-3 rounded-t-[26px] bg-white p-5 sm:rounded-[26px]">
        <b className="text-[var(--navy)]" dir="auto">{edit.v.doctor_name}</b>
        <div className="flex gap-1.5">{[["completed", "تمت"], ["cancelled", "اتلغت"]].map(([k, l]) => <button key={k} type="button" onClick={() => setEdit({ ...edit, status: k })} className={`min-h-10 flex-1 rounded-xl text-sm font-bold ${edit.status === k ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)]"}`}>{l}</button>)}</div>
        <textarea value={edit.notes} onChange={e => setEdit({ ...edit, notes: e.target.value })} rows={5} className="w-full rounded-xl border border-[var(--border)] p-3 text-[15px]" dir="auto" />
        <label className="flex items-center gap-2 text-sm font-bold">↻ متابعة<input type="date" value={edit.follow} min={today} onChange={e => setEdit({ ...edit, follow: e.target.value })} className="h-10 flex-1 rounded-xl border border-[var(--border)] px-3" />
          {edit.follow && <button type="button" onClick={() => setEdit({ ...edit, follow: "" })} className="text-xs text-[var(--muted)]">✕</button>}</label>
        <div className="flex gap-2"><button type="button" onClick={() => void saveEdit()} className="min-h-11 flex-1 rounded-xl bg-[var(--navy)] text-sm font-bold text-white">حفظ</button><button type="button" onClick={() => setEdit(null)} className="min-h-11 rounded-xl border border-[var(--border)] px-5 text-sm font-bold">إلغاء</button></div>
      </div>
    </div>}
  </div>;
}
