"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { riyadhDateTime, shiftCalendarEvent } from "@/lib/calendar-riyadh";
import { KIND_META, PLAN_STATE, PLAN_STATUS_LABEL, WEEK, addDays, buildItems, dow, fmtDay, fmtTime, monthGridStart, todayRiyadh, weekStart, type Agenda, type Item, type Kind, type PlanRow } from "./planner-utils";

type Opt = { id: string; name: string };
type Doc = { id: string; name: string; clinic_name: string | null; city: string | null; classification: string | null };
type View = "day" | "week" | "month" | "team";
type Mode = "phone" | "tablet" | "desktop";
type ChangeReq = { id: string; plan_id: string; note: string; proposed_items: Array<Record<string, string>>; created_at: string; requested_by_name: string };
type Collab = { id: string; requester_id: string; requester_name: string; target_user_id: string | null; target_name: string | null; title: string; body: string; starts_at: string; status: string };
type Suggest = { doctor_id: string; doctor_name: string; classification: string; clinic_name: string | null; city: string | null; days_since: number | null; gap_days: number };
type AddKind = "visit" | "event" | "help";

function useMode(): Mode {
  const [m, setM] = useState<Mode>("desktop");
  useEffect(() => {
    const f = () => setM(window.innerWidth < 768 ? "phone" : window.innerWidth < 1500 ? "tablet" : "desktop");
    f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f);
  }, []);
  return m;
}

export default function WorkPlanner({ isAdmin, currentUserId, reps, doctors, products }: { isAdmin: boolean; currentUserId: string; reps: Opt[]; doctors: Doc[]; products: Opt[] }) {
  const toast = useToast();
  const mode = useMode();
  const today = todayRiyadh();
  const [date, setDate] = useState(today);
  const [view, setView] = useState<View>("week");
  const [userView, setUserView] = useState(false);
  const [repId, setRepId] = useState("");
  const [layers, setLayers] = useState<Record<Kind, boolean>>({ plan: true, visit: true, event: true, followup: true, task: true });
  const [data, setData] = useState<Agenda | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [sel, setSel] = useState<Item | null>(null);
  const [add, setAdd] = useState<{ kind: AddKind; date: string; doctorId?: string } | null>(null);
  const [changes, setChanges] = useState<ChangeReq[]>([]);
  const [collab, setCollab] = useState<Collab[]>([]);
  const [sugs, setSugs] = useState<Suggest[]>([]);
  const [drag, setDrag] = useState<{ type: "plan" | "event" | "doctor"; id: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [tools, setTools] = useState(false);

  // default view per device (until the user picks one)
  useEffect(() => { if (!userView) setView(mode === "phone" ? "day" : "week"); }, [mode, userView]);
  const pickView = (v: View) => { setUserView(true); setView(v); };

  const range = useMemo(() => {
    if (view === "day") return { from: date, to: date };
    if (view === "month") { const s = monthGridStart(date); return { from: s, to: addDays(s, 41) }; }
    const s = weekStart(date); return { from: s, to: addDays(s, 6) };
  }, [date, view]);
  const effRep = isAdmin && view !== "team" ? repId : "";

  useEffect(() => {
    const c = new AbortController(); setLoading(true);
    const q = new URLSearchParams({ from: range.from, to: range.to }); if (effRep) q.set("repId", effRep);
    fetch(`/api/agenda?${q}`, { signal: c.signal }).then(r => r.ok ? r.json() : Promise.reject()).then(setData)
      .catch(() => { if (!c.signal.aborted) toast("تعذر تحميل المخطط", "error"); }).finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  }, [range.from, range.to, effRep, reload, toast]);
  useEffect(() => {
    fetch("/api/agenda/requests").then(r => r.ok ? r.json() : null).then(j => j && setChanges(j.requests)).catch(() => {});
    fetch("/api/collaboration-requests").then(r => r.ok ? r.json() : null).then(j => j && setCollab((j.requests || []).filter((x: Collab) => x.status === "pending"))).catch(() => {});
  }, [reload]);
  useEffect(() => {
    if (isAdmin && !repId) { setSugs([]); return; }
    fetch(`/api/agenda/suggestions${isAdmin ? `?repId=${repId}` : ""}`).then(r => r.ok ? r.json() : null).then(j => j && setSugs(j.doctors)).catch(() => {});
  }, [isAdmin, repId, reload]);

  const items = useMemo(() => data ? buildItems(data, layers) : [], [data, layers]);
  const byDay = useMemo(() => { const m: Record<string, Item[]> = {}; for (const i of items) (m[i.date] ||= []).push(i); return m; }, [items]);
  const stats = useMemo(() => {
    const p = data?.plan || []; const done = p.filter(x => x.visit_id).length, due = p.filter(x => x.date <= (data?.today || today)).length;
    return { planned: p.length, done, missed: p.filter(x => !x.visit_id && x.date < (data?.today || today)).length, adherence: due ? Math.round((p.filter(x => x.visit_id && x.date <= (data?.today || today)).length / due) * 100) : null, events: data?.events.length || 0, extra: (data?.visits.length || 0) - done };
  }, [data, today]);
  const refresh = useCallback(() => setReload(n => n + 1), []);

  // ── actions
  async function movePlan(itemId: string, to: string) {
    const r = await fetch(`/api/agenda/plan-items/${itemId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: to }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 202) toast("الخطة معتمدة — اتبعت طلب نقل للمدير", "info"); else if (r.ok) toast("تم نقل الزيارة", "success"); else toast(j.error || "تعذر النقل", "error");
    refresh(); setSel(null);
  }
  async function moveEvent(id: string, to: string) {
    const e = data?.events.find(x => x.id === id); if (!e) return;
    const s = shiftCalendarEvent(e.starts_at, e.ends_at, to);
    const r = await fetch(`/api/calendar/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(s) });
    const j = await r.json().catch(() => ({})); toast(r.ok ? "تم نقل الموعد" : j.error || "تعذر النقل", r.ok ? "success" : "error"); refresh(); setSel(null);
  }
  async function addVisit(doctorId: string, d: string, productId = "", note = "", rep = effRep) {
    if (isAdmin && !rep) { toast("اختار المندوب الأول من فوق", "info"); return false; }
    const r = await fetch("/api/agenda/plan-items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: d, doctorId, productId: productId || undefined, repId: rep || undefined, note }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 202) toast("الخطة معتمدة — اتبعت طلب إضافة للمدير", "info");
    else if (r.ok) toast(j.newPlan && j.pending ? "اتعملت خطة يومية جديدة — بانتظار موافقة المدير" : "تمت إضافة الزيارة للخطة", "success");
    else { toast(j.error || "تعذر الإضافة", "error"); return false; }
    refresh(); return true;
  }
  function onDrop(day: string) {
    setOver(null); if (!drag) return;
    if (drag.type === "plan") void movePlan(drag.id, day); else if (drag.type === "event") void moveEvent(drag.id, day); else void addVisit(drag.id, day);
    setDrag(null);
  }
  async function reviewChange(id: string, status: "approved" | "rejected") {
    const r = await fetch(`/api/agenda/requests/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    const j = await r.json().catch(() => ({})); toast(r.ok ? (status === "approved" ? "تمت الموافقة وتعديل الخطة" : "تم الرفض") : j.error || "تعذر", r.ok ? "success" : "error"); refresh();
  }
  async function reviewCollab(id: string, status: "accepted" | "rejected") {
    const r = await fetch(`/api/collaboration-requests/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    const j = await r.json().catch(() => ({})); toast(r.ok ? "تم" : j.error || "تعذر", r.ok ? "success" : "error"); refresh();
  }
  async function setEventStatus(id: string, status: string) {
    const r = await fetch(`/api/calendar/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    toast(r.ok ? "تم التحديث" : "تعذر التحديث", r.ok ? "success" : "error"); refresh(); setSel(null);
  }

  const step = (n: number) => setDate(d => view === "day" ? addDays(d, n) : view === "month" ? `${addDays(`${d.slice(0, 7)}-15`, 30 * n).slice(0, 7)}-01` : addDays(d, 7 * n));
  const title = view === "day" ? fmtDay(date) : view === "month" ? new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date.slice(0, 7)}-15T12:00:00Z`)) : `${fmtDay(range.from, { day: "numeric", month: "short" })} – ${fmtDay(range.to, { day: "numeric", month: "short" })}`;
  const views: Array<[View, string]> = mode === "phone" ? [["day", "يوم"], ["month", "شهر"]] : [["day", "يوم"], ["week", "أسبوع"], ["month", "شهر"], ...(isAdmin ? [["team", "الفريق"] as [View, string]] : [])];
  const pendingCount = changes.length + collab.filter(c => isAdmin || c.target_user_id === currentUserId).length;

  const side = <Sidebar {...{ isAdmin, currentUserId, date, setDate: (d: string) => { setDate(d); if (mode === "phone") setTools(false); }, byDay, layers, setLayers, items, sugs, setDrag, onAddDoc: (id: string) => setAdd({ kind: "visit", date: date < today ? today : date, doctorId: id }), changes, reviewChange, collab, reviewCollab, repSelected: !isAdmin || !!repId }} />;

  return (
    <div className="mt-4 space-y-3 pb-24 lg:pb-0">
      {/* Header */}
      <div className="rounded-3xl border border-[var(--border)] bg-white p-3 sm:p-4 flex flex-wrap items-center gap-2 sm:gap-3 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} className="h-10 w-10 rounded-xl border border-[var(--border)] hover:bg-[var(--bg)] text-lg" aria-label="السابق">›</button>
          <button onClick={() => setDate(today)} className="h-10 rounded-xl border border-[var(--border)] px-3 text-sm font-bold hover:bg-[var(--bg)]">النهارده</button>
          <button onClick={() => step(1)} className="h-10 w-10 rounded-xl border border-[var(--border)] hover:bg-[var(--bg)] text-lg" aria-label="التالي">‹</button>
        </div>
        <div className="font-extrabold text-[var(--navy)] text-base sm:text-lg min-w-0 truncate">{title}</div>
        <div className="flex rounded-xl bg-[var(--bg)] p-1 mr-auto">
          {views.map(([v, l]) => <button key={v} onClick={() => pickView(v)} className={`rounded-lg px-3 py-1.5 text-xs sm:text-sm font-bold ${view === v ? "bg-white shadow text-[var(--navy)]" : "text-[var(--muted)]"}`}>{l}</button>)}
        </div>
        {isAdmin && view !== "team" && <select value={repId} onChange={e => setRepId(e.target.value)} className="h-10 rounded-xl border border-[var(--border)] px-2 text-sm max-w-[11rem]"><option value="">كل المناديب</option>{reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
        {mode !== "desktop" && <button onClick={() => setTools(true)} className="relative h-10 rounded-xl border border-[var(--border)] px-3 text-sm font-bold">الأدوات{pendingCount > 0 && <span className="absolute -top-1.5 -left-1.5 h-5 min-w-5 px-1 rounded-full bg-red-600 text-white text-[10px] grid place-items-center">{pendingCount}</span>}</button>}
        <button onClick={() => setAdd({ kind: "visit", date: date < today ? today : date })} className="hidden sm:block h-10 rounded-xl bg-[var(--navy)] text-white px-4 text-sm font-bold">+ إضافة</button>
      </div>

      {/* KPIs */}
      {view !== "team" && <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
        {[["زيارات مخططة", stats.planned, ""], ["تمت", stats.done, "text-emerald-700"], ["فاتت", stats.missed, stats.missed ? "text-red-700" : ""], ["الالتزام", stats.adherence === null ? "—" : `${stats.adherence}%`, ""], ["خارج الخطة", Math.max(0, stats.extra), ""], ["مواعيد", stats.events, ""]].map(([l, v, c], i) =>
          <div key={i} className={`rounded-2xl border border-[var(--border)] bg-white px-3 py-2 ${i > 2 ? "hidden lg:block" : ""}`}><div className="text-[11px] text-[var(--muted)]">{l}</div><div className={`text-lg sm:text-xl font-extrabold text-[var(--navy)] ${c}`}>{loading ? "…" : v}</div></div>)}
      </div>}

      <div className={`grid gap-3 ${mode === "desktop" ? "grid-cols-[1fr_300px]" : ""}`}>
        <div className="min-w-0">
          {view === "team" ? <TeamBoard reps={reps} data={data} from={range.from} today={today} onOpen={(rid, d) => { setRepId(rid); setDate(d); pickView("day"); }} />
            : view === "day" || (mode === "phone" && view !== "month") ? <DayAgenda {...{ mode, isAdmin, date, setDate, data, items: byDay[date] || [], loading, onSelect: setSel, onMove: movePlan, today, weekDays: Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i)), byDay, setAdd }} />
            : view === "week" ? <WeekBoard {...{ mode, isAdmin, from: range.from, byDay, today, onSelect: setSel, drag, setDrag, over, setOver, onDrop, setAdd, loading }} />
            : <MonthGrid {...{ from: range.from, month: date.slice(0, 7), byDay, today, onDay: (d: string) => { setDate(d); pickView("day"); }, drag, over, setOver, onDrop, setDrag, onSelect: setSel }} />}
        </div>
        {mode === "desktop" && <div className="space-y-3">{side}</div>}
      </div>

      {/* tablet/phone tools drawer */}
      {tools && mode !== "desktop" && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setTools(false)}>
        <div className="absolute top-0 bottom-0 right-0 w-[min(380px,92vw)] bg-[var(--bg)] p-3 overflow-y-auto space-y-3" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between"><div className="font-extrabold text-[var(--navy)]">الأدوات</div><button onClick={() => setTools(false)} className="h-9 w-9 rounded-xl border border-[var(--border)] bg-white">✕</button></div>
          {side}
        </div>
      </div>}

      {/* phone FAB */}
      {mode === "phone" && <button onClick={() => setAdd({ kind: "visit", date: date < today ? today : date })} className="fixed left-4 bottom-[7.5rem] z-30 h-14 w-14 rounded-full bg-[var(--navy)] text-white text-3xl shadow-xl" aria-label="إضافة">+</button>}

      {sel && <Detail {...{ item: sel, mode, isAdmin, today, onClose: () => setSel(null), onMove: movePlan, onMoveEvent: moveEvent, onEventStatus: setEventStatus }} />}
      {add && <AddDialog {...{ init: add, isAdmin, reps, repId: effRep, doctors, products, currentUserId, onClose: () => setAdd(null), onAddVisit: addVisit, onDone: () => { setAdd(null); refresh(); } }} />}
    </div>
  );
}

// ───────────────────────── item card ─────────────────────────
function Card({ i, compact, isAdmin, onClick, draggable, onDragStart }: { i: Item; compact?: boolean; isAdmin: boolean; onClick: () => void; draggable?: boolean; onDragStart?: () => void }) {
  const m = KIND_META[i.kind];
  let title = "", sub = "", badge: React.ReactNode = null, time = "";
  if (i.kind === "plan") { title = i.row.doctor_name; sub = [i.row.product_name, i.row.clinic_name].filter(Boolean).join(" · "); const s = PLAN_STATE[i.state]; badge = compact ? <span title={s.label} className={`mt-0.5 h-4 w-4 shrink-0 rounded-full grid place-items-center text-[9px] font-bold ${s.cls}`}>{i.state === "done" ? "✓" : i.state === "missed" ? "✗" : i.state === "today" ? "!" : ""}</span> : <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${s.cls}`}>{s.label}</span>; }
  if (i.kind === "visit") { title = i.row.doctor_name; sub = `${fmtTime(i.row.visited_at)} · خارج الخطة`; }
  if (i.kind === "event") { title = i.row.title; time = fmtTime(i.row.starts_at); sub = i.row.doctor_name || (i.row.event_type === "help" ? "طلب مساعدة" : ""); }
  if (i.kind === "followup") { title = `متابعة: ${i.row.doctor_name}`; sub = i.row.note; }
  if (i.kind === "task") { title = i.row.title; sub = "مهمة"; }
  const muted = i.kind === "plan" && i.state === "done";
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={e => e.key === "Enter" && onClick()} draggable={draggable} onDragStart={onDragStart}
      className={`group relative rounded-xl border text-right transition hover:shadow-md cursor-pointer ${m.chip} ${compact ? "px-2 py-1.5" : "px-3 py-2"} ${muted ? "opacity-70" : ""} ${draggable ? "active:cursor-grabbing" : ""}`}>
      <span className={`absolute right-0 top-2 bottom-2 w-1 rounded-l ${m.dot}`} />
      <div className="flex items-start gap-1.5 pr-1.5">
        <div className="min-w-0 flex-1">
          <div className={`font-bold ${compact ? "text-[11px] leading-4 line-clamp-2 break-words" : "text-sm truncate"} ${muted ? "line-through decoration-emerald-600/50" : ""}`}>{time && <span className="text-violet-700 ml-1">{time}</span>}{title}</div>
          {!compact && sub && <div className="text-[11px] text-[var(--muted)] truncate">{sub}</div>}
          {!compact && isAdmin && "rep_name" in i.row && i.row.rep_name && <div className="text-[10px] text-[var(--muted)] truncate">👤 {i.row.rep_name}</div>}
        </div>
        {badge}
        {i.kind === "plan" && i.row.change_pending && <span title="فيه طلب تعديل مستني المدير" className="text-[10px]">⏳</span>}
        {i.kind === "plan" && i.row.plan_status !== "approved" && <span title={PLAN_STATUS_LABEL[i.row.plan_status]} className="text-[10px]">📝</span>}
      </div>
    </div>
  );
}
const canDragPlan = (i: Item, today: string, isAdmin: boolean) => i.kind === "plan" && !i.row.visit_id && (isAdmin || i.date >= today) && !i.row.change_pending;

// ───────────────────────── week ─────────────────────────
function WeekBoard({ mode, isAdmin, from, byDay, today, onSelect, setDrag, over, setOver, onDrop, setAdd, loading }: {
  mode: Mode; isAdmin: boolean; from: string; byDay: Record<string, Item[]>; today: string; onSelect: (i: Item) => void; drag: unknown;
  setDrag: (d: { type: "plan" | "event" | "doctor"; id: string } | null) => void; over: string | null; setOver: (d: string | null) => void; onDrop: (d: string) => void; setAdd: (a: { kind: AddKind; date: string }) => void; loading: boolean;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return (
    <div className={`grid gap-2 ${mode === "tablet" ? "grid-cols-7 overflow-x-auto" : "grid-cols-7"}`} style={{ gridTemplateColumns: "repeat(7, minmax(118px, 1fr))" }}>
      {days.map(d => {
        const list = byDay[d] || []; const isToday = d === today; const plan = list.filter(i => i.kind === "plan"); const done = plan.filter(i => i.kind === "plan" && i.state === "done").length;
        return (
          <div key={d} onDragOver={e => { e.preventDefault(); setOver(d); }} onDragLeave={() => setOver(null)} onDrop={e => { e.preventDefault(); onDrop(d); }}
            className={`rounded-2xl border min-h-[420px] flex flex-col transition ${over === d ? "border-[var(--navy)] bg-[var(--sky-light)] ring-2 ring-[var(--navy)]/20" : isToday ? "border-[var(--navy)]/40 bg-white" : "border-[var(--border)] bg-white"} ${d < today ? "bg-slate-50/60" : ""}`}>
            <div className={`p-2 border-b border-[var(--border)] flex items-center justify-between ${isToday ? "bg-[var(--navy)] text-white rounded-t-2xl" : ""}`}>
              <div><div className={`text-[11px] ${isToday ? "text-white/80" : "text-[var(--muted)]"}`}>{WEEK[dow(d)]}</div><div className="font-extrabold">{Number(d.slice(8))}</div></div>
              {plan.length > 0 && <div className={`text-[11px] font-bold ${isToday ? "text-white" : "text-[var(--muted)]"}`}>{done}/{plan.length}</div>}
            </div>
            {plan.length > 0 && <div className="h-1 bg-[var(--bg)]"><div className="h-full bg-emerald-500" style={{ width: `${(done / plan.length) * 100}%` }} /></div>}
            <div className="p-1.5 space-y-1.5 flex-1">
              {loading && !list.length && <div className="h-10 rounded-xl bg-[var(--bg)] animate-pulse" />}
              {list.map(i => <Card key={i.key} i={i} compact isAdmin={isAdmin} onClick={() => onSelect(i)}
                draggable={canDragPlan(i, today, isAdmin) || (i.kind === "event" && i.row.status === "scheduled")}
                onDragStart={() => setDrag({ type: i.kind === "event" ? "event" : "plan", id: i.row.id })} />)}
            </div>
            {d >= today && <button onClick={() => setAdd({ kind: "visit", date: d })} className="m-1.5 rounded-xl border border-dashed border-[var(--border-strong)] py-1.5 text-xs font-bold text-[var(--muted)] opacity-60 hover:opacity-100">+ إضافة</button>}
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────── month ─────────────────────────
function MonthGrid({ from, month, byDay, today, onDay, over, setOver, onDrop }: { from: string; month: string; byDay: Record<string, Item[]>; today: string; onDay: (d: string) => void; drag: unknown; over: string | null; setOver: (d: string | null) => void; onDrop: (d: string) => void; setDrag: unknown; onSelect: unknown }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-2">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-[var(--muted)] mb-1">{WEEK.map(w => <div key={w}>{w}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 42 }, (_, k) => addDays(from, k)).map(d => {
          const list = byDay[d] || []; const plan = list.filter(i => i.kind === "plan") as Extract<Item, { kind: "plan" }>[];
          const done = plan.filter(p => p.state === "done").length, missed = plan.filter(p => p.state === "missed").length;
          const other = list.filter(i => i.kind !== "plan");
          return (
            <button key={d} onClick={() => onDay(d)} onDragOver={e => { e.preventDefault(); setOver(d); }} onDragLeave={() => setOver(null)} onDrop={e => { e.preventDefault(); onDrop(d); }}
              className={`min-h-[92px] rounded-xl border p-1.5 text-right align-top transition hover:border-[var(--navy-3)] ${d.slice(0, 7) !== month ? "opacity-40" : ""} ${over === d ? "bg-[var(--sky-light)] border-[var(--navy)]" : "border-[var(--border)]"} ${d === today ? "ring-2 ring-[var(--navy)]" : ""}`}>
              <div className="text-xs font-extrabold">{Number(d.slice(8))}</div>
              {plan.length > 0 && <div className="mt-1"><div className="text-[10px] font-bold text-[var(--navy)]">🩺 {done}/{plan.length}{missed ? <span className="text-red-600"> · {missed} فاتت</span> : null}</div><div className="h-1 rounded bg-[var(--bg)] mt-0.5"><div className="h-full rounded bg-emerald-500" style={{ width: `${(done / plan.length) * 100}%` }} /></div></div>}
              <div className="flex flex-wrap gap-0.5 mt-1">{other.slice(0, 6).map(i => <span key={i.key} className={`h-1.5 w-1.5 rounded-full ${KIND_META[i.kind].dot}`} />)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────── day / phone agenda ─────────────────────────
function DayAgenda({ mode, isAdmin, date, setDate, items, loading, onSelect, onMove, today, weekDays, byDay, setAdd }: {
  mode: Mode; isAdmin: boolean; date: string; setDate: (d: string) => void; data: Agenda | null; items: Item[]; loading: boolean; onSelect: (i: Item) => void; onMove: (id: string, d: string) => void;
  today: string; weekDays: string[]; byDay: Record<string, Item[]>; setAdd: (a: { kind: AddKind; date: string }) => void;
}) {
  const groups: Array<[Kind, Item[]]> = (["event", "plan", "followup", "visit", "task"] as Kind[]).map(k => [k, items.filter(i => i.kind === k)] as [Kind, Item[]]).filter(([, l]) => l.length);
  return (
    <div className="space-y-3 pb-16 sm:pb-0">
      {/* day strip */}
      <div className="grid grid-cols-7 gap-1 rounded-2xl bg-white border border-[var(--border)] p-1.5">
        {weekDays.map(d => { const n = (byDay[d] || []).filter(i => i.kind === "plan").length; return (
          <button key={d} onClick={() => setDate(d)} className={`rounded-xl py-1.5 text-center ${d === date ? "bg-[var(--navy)] text-white" : d === today ? "bg-[var(--sky-light)]" : ""}`}>
            <div className={`text-[10px] ${d === date ? "text-white/80" : "text-[var(--muted)]"}`}>{WEEK[dow(d)]}</div><div className="font-extrabold">{Number(d.slice(8))}</div>
            <div className="h-1.5 flex justify-center mt-0.5">{n > 0 && <span className={`h-1.5 w-1.5 rounded-full ${d === date ? "bg-white" : "bg-[var(--navy)]"}`} />}</div>
          </button>); })}
      </div>
      {loading && <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-20 rounded-2xl bg-white animate-pulse" />)}</div>}
      {!loading && !items.length && <div className="rounded-3xl border border-dashed border-[var(--border-strong)] bg-white p-10 text-center">
        <div className="text-4xl">🗓️</div><div className="font-bold mt-2">مفيش حاجة في اليوم ده</div>
        {date >= today && <button onClick={() => setAdd({ kind: "visit", date })} className="mt-3 rounded-xl bg-[var(--navy)] text-white px-4 py-2 text-sm font-bold">+ أضف زيارة أو موعد</button>}
      </div>}
      {groups.map(([k, list]) => (
        <div key={k}>
          <div className="flex items-center gap-2 mb-1.5 px-1"><span className={`h-2.5 w-2.5 rounded-full ${KIND_META[k].dot}`} /><span className="font-bold text-sm">{KIND_META[k].label}</span><span className="text-xs text-[var(--muted)]">{list.length}</span></div>
          <div className={`grid gap-2 ${mode === "phone" ? "" : "sm:grid-cols-2"}`}>
            {list.map(i => i.kind === "plan" && mode === "phone" ? <PlanTile key={i.key} i={i} isAdmin={isAdmin} today={today} onOpen={() => onSelect(i)} onMove={onMove} /> : <Card key={i.key} i={i} isAdmin={isAdmin} onClick={() => onSelect(i)} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Phone card for a planned visit — the big buttons a rep needs at the clinic door. */
function PlanTile({ i, isAdmin, today, onOpen, onMove }: { i: Extract<Item, { kind: "plan" }>; isAdmin: boolean; today: string; onOpen: () => void; onMove: (id: string, d: string) => void }) {
  const r = i.row; const s = PLAN_STATE[i.state]; const phone = (r.phone || "").replace(/\s/g, "");
  const canAct = !r.visit_id && !isAdmin && i.date >= today;
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
      <button onClick={onOpen} className="w-full text-right p-3 flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-[var(--sky-soft)] text-[var(--navy)] grid place-items-center font-extrabold shrink-0">{r.classification || "—"}</div>
        <div className="min-w-0 flex-1"><div className="font-extrabold truncate">{r.doctor_name}</div><div className="text-xs text-[var(--muted)] truncate">{[r.clinic_name, r.city].filter(Boolean).join(" · ")}</div>{r.product_name && <div className="text-xs mt-0.5">💊 {r.product_name}</div>}</div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.cls}`}>{s.label}</span>
      </button>
      {canAct && <div className="grid grid-cols-3 border-t border-[var(--border)] text-sm font-bold">
        <Link href={`/visits/new?doctorId=${r.doctor_id}${r.product_id ? `&productId=${r.product_id}` : ""}`} className="py-3 text-center bg-[var(--navy)] text-white">▶ ابدأ</Link>
        {phone ? <a href={`tel:${phone}`} className="py-3 text-center border-x border-[var(--border)]">📞 اتصال</a> : <span className="py-3 text-center border-x border-[var(--border)] text-[var(--muted)]">📞 —</span>}
        <button onClick={() => onMove(r.id, addDays(i.date, 1))} className="py-3" disabled={r.change_pending || addDays(i.date, 1) > r.period_end} title={addDays(i.date, 1) > r.period_end ? "آخر يوم في الخطة" : ""}>⏭ بكرة</button>
      </div>}
      {r.change_pending && <div className="px-3 pb-2 text-[11px] text-amber-700">⏳ فيه طلب تعديل مستني المدير</div>}
    </div>
  );
}

// ───────────────────────── team (admin) ─────────────────────────
function TeamBoard({ reps, data, from, today, onOpen }: { reps: Opt[]; data: Agenda | null; from: string; today: string; onOpen: (repId: string, d: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const cell = (rid: string, d: string) => {
    const p = (data?.plan || []).filter(x => x.rep_id === rid && x.date === d); const done = p.filter(x => x.visit_id).length;
    const extra = (data?.visits || []).filter(v => v.rep_id === rid && v.date === d && !p.some(x => x.visit_id === v.id)).length;
    const ev = (data?.events || []).filter(e => e.rep_id === rid && e.date === d).length;
    return { p, done, extra, ev };
  };
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white overflow-x-auto">
      <table className="w-full text-sm min-w-[900px]">
        <thead><tr className="bg-[var(--bg)] text-xs text-[var(--muted)]"><th className="p-2 text-right w-40">المندوب</th>{days.map(d => <th key={d} className={`p-2 text-center ${d === today ? "text-[var(--navy)]" : ""}`}>{WEEK[dow(d)]} {Number(d.slice(8))}</th>)}<th className="p-2">الأسبوع</th></tr></thead>
        <tbody>{reps.map(r => {
          const all = days.map(d => cell(r.id, d)); const tp = all.reduce((a, c) => a + c.p.length, 0), td = all.reduce((a, c) => a + c.done, 0);
          const due = all.filter((_, k) => days[k] <= today).reduce((a, c) => a + c.p.length, 0), dueDone = all.filter((_, k) => days[k] <= today).reduce((a, c) => a + c.done, 0);
          const adh = due ? Math.round((dueDone / due) * 100) : null;
          return <tr key={r.id} className="border-t border-[var(--border)]">
            <td className="p-2 font-bold">{r.name}</td>
            {all.map((c, k) => { const d = days[k]; const missed = d < today ? c.p.length - c.done : 0; return (
              <td key={d} className="p-1">
                <button onClick={() => onOpen(r.id, d)} className={`w-full rounded-xl border p-2 text-right hover:border-[var(--navy-3)] ${c.p.length || c.extra || c.ev ? "border-[var(--border)]" : "border-dashed border-[var(--border)] opacity-50"}`}>
                  {c.p.length ? <><div className="text-xs font-extrabold">{c.done}/{c.p.length}{missed > 0 && <span className="text-red-600 font-bold"> · {missed}✗</span>}</div><div className="h-1 rounded bg-[var(--bg)] mt-1"><div className={`h-full rounded ${missed ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${(c.done / c.p.length) * 100}%` }} /></div></> : <div className="text-[11px] text-[var(--muted)]">—</div>}
                  {(c.extra > 0 || c.ev > 0) && <div className="text-[10px] text-[var(--muted)] mt-1">{c.extra ? `+${c.extra} خارج الخطة ` : ""}{c.ev ? `🕑${c.ev}` : ""}</div>}
                </button>
              </td>); })}
            <td className="p-2 text-center"><div className="font-extrabold">{td}/{tp}</div><div className={`text-xs font-bold ${adh === null ? "text-[var(--muted)]" : adh >= 90 ? "text-emerald-700" : adh >= 60 ? "text-amber-700" : "text-red-700"}`}>{adh === null ? "—" : `${adh}%`}</div></td>
          </tr>; })}</tbody>
      </table>
    </div>
  );
}

// ───────────────────────── sidebar ─────────────────────────
function Sidebar({ isAdmin, currentUserId, date, setDate, byDay, layers, setLayers, items, sugs, setDrag, onAddDoc, changes, reviewChange, collab, reviewCollab, repSelected }: {
  isAdmin: boolean; currentUserId: string; date: string; setDate: (d: string) => void; byDay: Record<string, Item[]>; layers: Record<Kind, boolean>; setLayers: (f: (l: Record<Kind, boolean>) => Record<Kind, boolean>) => void;
  items: Item[]; sugs: Suggest[]; setDrag: (d: { type: "doctor"; id: string } | null) => void; onAddDoc: (id: string) => void; changes: ChangeReq[]; reviewChange: (id: string, s: "approved" | "rejected") => void;
  collab: Collab[]; reviewCollab: (id: string, s: "accepted" | "rejected") => void; repSelected: boolean;
}) {
  const [q, setQ] = useState("");
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const i of items) c[i.kind] = (c[i.kind] || 0) + 1; return c; }, [items]);
  const s = sugs.filter(x => !q.trim() || `${x.doctor_name} ${x.clinic_name || ""} ${x.city || ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const mine = collab.filter(c => isAdmin || c.target_user_id === currentUserId || c.requester_id === currentUserId);
  return <>
    <MiniMonth date={date} setDate={setDate} byDay={byDay} />
    <div className="rounded-2xl border border-[var(--border)] bg-white p-3">
      <div className="text-xs font-bold text-[var(--muted)] mb-2">اللي بيظهر في المخطط</div>
      <div className="space-y-1">{(Object.keys(KIND_META) as Kind[]).map(k => <label key={k} className="flex items-center gap-2 text-sm cursor-pointer rounded-lg px-1 py-1 hover:bg-[var(--bg)]">
        <input type="checkbox" checked={layers[k]} onChange={() => setLayers(l => ({ ...l, [k]: !l[k] }))} className="accent-[var(--navy)]" /><span className={`h-2.5 w-2.5 rounded-full ${KIND_META[k].dot}`} /><span className="flex-1">{KIND_META[k].label}</span><span className="text-xs text-[var(--muted)]">{counts[k] || 0}</span></label>)}</div>
    </div>
    {(changes.length > 0 || mine.length > 0) && <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
      <div className="font-bold text-sm">{isAdmin ? "محتاج قرارك" : "طلباتك المعلقة"}</div>
      {changes.map(c => <div key={c.id} className="rounded-xl bg-white border border-amber-100 p-2 text-sm">
        <div className="font-bold">{c.requested_by_name}</div>
        {c.proposed_items.map((o, k) => <div key={k} className="text-xs">{o.op === "replace" ? <a href={`/plans?planId=${c.plan_id}`} className="font-bold text-[var(--navy)] underline">تعديل شامل للخطة — افتح المقارنة ‹</a> : o.op === "move" ? `نقل ${o.doctor_name}: ${o.from} ← ${o.to}` : o.op === "add" ? `إضافة ${o.doctor_name} يوم ${o.to}` : "حذف زيارة"}</div>)}
        {c.note && <div className="text-[11px] text-[var(--muted)]">«{c.note}»</div>}
        {isAdmin ? <div className="flex gap-1.5 mt-1.5"><button onClick={() => reviewChange(c.id, "approved")} className="flex-1 rounded-lg bg-emerald-600 text-white py-1 text-xs font-bold">موافقة</button><button onClick={() => reviewChange(c.id, "rejected")} className="flex-1 rounded-lg border border-red-200 text-red-700 py-1 text-xs font-bold">رفض</button></div>
          : <div className="text-[11px] text-amber-700 mt-1">⏳ مستني رد المدير</div>}
      </div>)}
      {mine.map(c => <div key={c.id} className="rounded-xl bg-white border border-amber-100 p-2 text-sm">
        <div className="font-bold">🤝 {c.title}</div><div className="text-[11px] text-[var(--muted)]">من {c.requester_name} · {fmtDay(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date(c.starts_at)), { day: "numeric", month: "short" })} {fmtTime(c.starts_at)}</div>
        {(isAdmin || c.target_user_id === currentUserId) && c.requester_id !== currentUserId ? <div className="flex gap-1.5 mt-1.5"><button onClick={() => reviewCollab(c.id, "accepted")} className="flex-1 rounded-lg bg-emerald-600 text-white py-1 text-xs font-bold">قبول وتثبيت</button><button onClick={() => reviewCollab(c.id, "rejected")} className="flex-1 rounded-lg border border-red-200 text-red-700 py-1 text-xs font-bold">رفض</button></div>
          : <div className="text-[11px] text-amber-700 mt-1">⏳ مستني الرد</div>}
      </div>)}
    </div>}
    <div className="rounded-2xl border border-[var(--border)] bg-white p-3">
      <div className="font-bold text-sm">أطباء محتاجين زيارة</div>
      <div className="text-[11px] text-[var(--muted)] mb-2">{repSelected ? "اسحب الطبيب على يوم، أو اضغط + لإضافته للخطة" : "اختار مندوب من فوق عشان تشوف أطباءه"}</div>
      {repSelected && <>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 بحث" className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm mb-2" />
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {s.map(x => <div key={x.doctor_id} draggable onDragStart={() => setDrag({ type: "doctor", id: x.doctor_id })} onDragEnd={() => setDrag(null)} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1.5 cursor-grab hover:bg-[var(--bg)]">
            <span className="rounded bg-[var(--sky-soft)] text-[var(--navy)] text-[10px] font-extrabold px-1.5">{x.classification}</span>
            <div className="min-w-0 flex-1"><div className="text-sm font-bold truncate">{x.doctor_name}</div><div className="text-[10px] text-[var(--muted)] truncate">{x.days_since === null ? "ما اتزارش قبل كده" : `آخر زيارة من ${x.days_since} يوم`}</div></div>
            <button onClick={() => onAddDoc(x.doctor_id)} className="h-7 w-7 rounded-lg bg-[var(--navy)] text-white text-sm shrink-0" title="إضافة للخطة">+</button>
          </div>)}
          {!s.length && <div className="text-xs text-[var(--muted)] text-center py-3">كل الأطباء في ميعادهم 👌</div>}
        </div>
      </>}
    </div>
    <div className="flex gap-2 text-xs"><Link href="/plans" className="flex-1 rounded-xl border border-[var(--border)] bg-white py-2 text-center font-bold">الخطط والاعتماد ‹</Link></div>
  </>;
}

function MiniMonth({ date, setDate, byDay }: { date: string; setDate: (d: string) => void; byDay: Record<string, Item[]> }) {
  const [m, setM] = useState(date.slice(0, 7));
  useEffect(() => setM(date.slice(0, 7)), [date]);
  const start = monthGridStart(`${m}-01`); const today = todayRiyadh();
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setM(addDays(`${m}-01`, -1).slice(0, 7))} className="h-7 w-7 rounded-lg hover:bg-[var(--bg)]">›</button>
        <div className="text-sm font-bold">{new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`))}</div>
        <button onClick={() => setM(addDays(`${m}-28`, 7).slice(0, 7))} className="h-7 w-7 rounded-lg hover:bg-[var(--bg)]">‹</button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] text-[var(--muted)]">{WEEK.map(w => <div key={w}>{w.slice(0, 1)}</div>)}</div>
      <div className="grid grid-cols-7 gap-0.5 mt-1">{Array.from({ length: 42 }, (_, k) => addDays(start, k)).map(d => {
        const has = (byDay[d] || []).length > 0;
        return <button key={d} onClick={() => setDate(d)} className={`relative h-8 rounded-lg text-xs ${d === date ? "bg-[var(--navy)] text-white font-bold" : d === today ? "ring-1 ring-[var(--navy)] font-bold" : "hover:bg-[var(--bg)]"} ${d.slice(0, 7) !== m ? "opacity-30" : ""}`}>{Number(d.slice(8))}{has && <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full ${d === date ? "bg-white" : "bg-[var(--navy)]"}`} />}</button>;
      })}</div>
    </div>
  );
}

// ───────────────────────── detail panel ─────────────────────────
function Detail({ item: i, mode, isAdmin, today, onClose, onMove, onMoveEvent, onEventStatus }: { item: Item; mode: Mode; isAdmin: boolean; today: string; onClose: () => void; onMove: (id: string, d: string) => void; onMoveEvent: (id: string, d: string) => void; onEventStatus: (id: string, s: string) => void }) {
  const [to, setTo] = useState(i.date < today ? today : i.date);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const m = KIND_META[i.kind];
  const sheet = mode === "phone";
  const body = (() => {
    if (i.kind === "plan") {
      const r = i.row; const s = PLAN_STATE[i.state]; const phone = (r.phone || "").replace(/\s/g, "");
      return <>
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-2xl bg-[var(--sky-soft)] text-[var(--navy)] grid place-items-center text-lg font-extrabold">{r.classification || "—"}</div>
          <div className="min-w-0 flex-1"><div className="text-lg font-extrabold text-[var(--navy)]">{r.doctor_name}</div><div className="text-sm text-[var(--muted)]">{[r.clinic_name, r.city].filter(Boolean).join(" · ")}</div></div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${s.cls}`}>{s.label}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Info l="اليوم" v={fmtDay(r.date, { weekday: "short", day: "numeric", month: "short" })} /><Info l="المنتج" v={r.product_name || "—"} />
          <Info l="الأولوية" v={r.priority === "high" ? "عالية" : r.priority === "low" ? "منخفضة" : "متوسطة"} /><Info l="الخطة" v={`${PLAN_STATUS_LABEL[r.plan_status] || r.plan_status}`} />
          {isAdmin && <Info l="المندوب" v={r.rep_name} />}{phone && <Info l="التليفون" v={<a href={`tel:${phone}`} className="text-[var(--navy)] font-bold" dir="ltr">{r.phone}</a>} />}
        </div>
        {r.note && <div className="rounded-xl bg-[var(--bg)] p-3 text-sm">📝 {r.note}</div>}
        {r.change_pending && <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">⏳ فيه طلب تعديل على الزيارة دي مستني المدير</div>}
        <div className="grid gap-2">
          {!r.visit_id && !isAdmin && r.date >= today && <Link href={`/visits/new?doctorId=${r.doctor_id}${r.product_id ? `&productId=${r.product_id}` : ""}`} className="rounded-xl bg-[var(--navy)] text-white py-3 text-center font-bold">▶ ابدأ الزيارة (وفيها عرض البروشور)</Link>}
          {r.visit_id && <Link href={isAdmin ? `/visits?repId=${r.rep_id}&day=${r.date}` : "/visits"} className="rounded-xl bg-emerald-600 text-white py-3 text-center font-bold">✓ اتعملت — عرض الزيارة</Link>}
          {!r.visit_id && !r.change_pending && (isAdmin || r.date >= today) && <div className="rounded-xl border border-[var(--border)] p-2.5">
            <div className="text-xs font-bold text-[var(--muted)] mb-1.5">نقل ليوم تاني {!isAdmin && r.plan_status === "approved" && <span className="font-normal">(الخطة معتمدة — هيتبعت طلب للمدير)</span>}</div>
            <div className="flex gap-2"><input type="date" value={to} min={isAdmin ? r.period_start : (today > r.period_start ? today : r.period_start)} max={r.period_end} onChange={e => setTo(e.target.value)} className="flex-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm" />
              <button onClick={() => onMove(r.id, to)} disabled={to === r.date} className="rounded-lg bg-[var(--navy)] text-white px-3 text-sm font-bold disabled:opacity-40">نقل</button></div>
            <div className="text-[10px] text-[var(--muted)] mt-1">فترة الخطة: {r.period_start} → {r.period_end}</div>
          </div>}
          <div className="grid grid-cols-2 gap-2 text-sm font-bold">
            <Link href={`/doctors/${r.doctor_id}`} className="rounded-xl border border-[var(--border)] py-2 text-center">ملف الطبيب</Link>
            <Link href={`/plans?planId=${r.plan_id}`} className="rounded-xl border border-[var(--border)] py-2 text-center">فتح الخطة</Link>
          </div>
        </div>
      </>;
    }
    if (i.kind === "event") {
      const r = i.row;
      return <>
        <div><div className="text-lg font-extrabold text-[var(--navy)]">{r.title}</div><div className="text-sm text-[var(--muted)]">{fmtDay(r.date)} · {fmtTime(r.starts_at)} – {fmtTime(r.ends_at)}</div></div>
        {r.description && <div className="rounded-xl bg-[var(--bg)] p-3 text-sm">{r.description}</div>}
        <div className="grid grid-cols-2 gap-2 text-sm"><Info l="النوع" v={r.event_type === "help" ? "مساعدة" : r.event_type === "visit" ? "زيارة" : r.event_type === "meeting" ? "اجتماع" : "مهمة"} /><Info l="الحالة" v={r.status === "completed" ? "تم" : r.status === "cancelled" ? "ملغي" : "مجدول"} />{isAdmin && <Info l="المسؤول" v={r.rep_name} />}{r.doctor_name && <Info l="الطبيب" v={<Link href={`/doctors/${r.doctor_id}`} className="text-[var(--navy)] font-bold">{r.doctor_name}</Link>} />}</div>
        {r.status === "scheduled" && <>
          <div className="grid grid-cols-2 gap-2"><button onClick={() => onEventStatus(r.id, "completed")} className="rounded-xl bg-emerald-600 text-white py-2.5 font-bold">✓ تم</button><button onClick={() => onEventStatus(r.id, "cancelled")} className="rounded-xl border border-red-200 text-red-700 py-2.5 font-bold">إلغاء الموعد</button></div>
          <div className="rounded-xl border border-[var(--border)] p-2.5"><div className="text-xs font-bold text-[var(--muted)] mb-1.5">نقل لنفس الساعة في يوم تاني</div>
            <div className="flex gap-2"><input type="date" value={to} onChange={e => setTo(e.target.value)} className="flex-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm" /><button onClick={() => onMoveEvent(r.id, to)} disabled={to === r.date} className="rounded-lg bg-[var(--navy)] text-white px-3 text-sm font-bold disabled:opacity-40">نقل</button></div></div>
        </>}
        {r.task_id && <Link href={`/tasks?task=${r.task_id}`} className="block rounded-xl border border-[var(--border)] py-2 text-center text-sm font-bold">فتح المهمة المرتبطة</Link>}
      </>;
    }
    if (i.kind === "followup") { const r = i.row; return <>
      <div><div className="text-lg font-extrabold text-[var(--navy)]">متابعة: {r.doctor_name}</div><div className="text-sm text-[var(--muted)]">{fmtDay(r.date)}{r.clinic_name ? ` · ${r.clinic_name}` : ""}</div></div>
      {r.note && <div className="rounded-xl bg-amber-50 p-3 text-sm">{r.note}</div>}
      {r.date < today && <div className="text-sm text-red-700 font-bold">⚠ المتابعة متأخرة</div>}
      {!isAdmin && <Link href={`/visits/new?doctorId=${r.doctor_id}`} className="block rounded-xl bg-[var(--navy)] text-white py-3 text-center font-bold">▶ ابدأ زيارة المتابعة</Link>}
      <Link href={`/doctors/${r.doctor_id}`} className="block rounded-xl border border-[var(--border)] py-2 text-center text-sm font-bold">ملف الطبيب</Link>
    </>; }
    if (i.kind === "visit") { const r = i.row; return <>
      <div><div className="text-lg font-extrabold text-[var(--navy)]">{r.doctor_name}</div><div className="text-sm text-[var(--muted)]">{fmtDay(r.date)} · {fmtTime(r.visited_at)} · زيارة خارج الخطة</div></div>
      <Link href={isAdmin ? `/visits?repId=${r.rep_id}&day=${r.date}` : "/visits"} className="block rounded-xl bg-[var(--navy)] text-white py-3 text-center font-bold">عرض تفاصيل الزيارة</Link>
    </>; }
    const r = i.row; return <>
      <div className="text-lg font-extrabold text-[var(--navy)]">{r.title}</div><div className="text-sm text-[var(--muted)]">مستحقة {fmtDay(r.date)}</div>
      <Link href={`/tasks?task=${r.id}`} className="block rounded-xl bg-[var(--navy)] text-white py-3 text-center font-bold">فتح المهمة</Link>
    </>;
  })();
  return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose}>
      <div dir="rtl" onClick={e => e.stopPropagation()} className={sheet ? "absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-4 space-y-3 animate-[up_.2s_ease-out]" : "absolute top-0 bottom-0 right-0 w-[min(420px,95vw)] overflow-y-auto bg-white p-5 space-y-4 shadow-2xl animate-[side_.2s_ease-out]"}>
        {sheet && <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />}
        <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]"><span className={`h-2.5 w-2.5 rounded-full ${m.dot}`} />{m.label}</div><button onClick={onClose} className="h-9 w-9 rounded-xl border border-[var(--border)]">✕</button></div>
        {body}
      </div>
      <style>{`@keyframes up{from{transform:translateY(40px);opacity:.5}to{transform:none;opacity:1}}@keyframes side{from{transform:translateX(40px);opacity:.5}to{transform:none;opacity:1}}`}</style>
    </div>
  );
}
const Info = ({ l, v }: { l: string; v: React.ReactNode }) => <div className="rounded-xl bg-[var(--bg)] px-3 py-2"><div className="text-[11px] text-[var(--muted)]">{l}</div><div className="font-bold truncate">{v}</div></div>;

// ───────────────────────── add dialog ─────────────────────────
function AddDialog({ init, isAdmin, reps, repId, doctors, products, currentUserId, onClose, onAddVisit, onDone }: {
  init: { kind: AddKind; date: string; doctorId?: string }; isAdmin: boolean; reps: Opt[]; repId: string; doctors: Doc[]; products: Opt[]; currentUserId: string;
  onClose: () => void; onAddVisit: (doctorId: string, d: string, productId: string, note: string, rep: string) => Promise<boolean>; onDone: () => void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<AddKind>(init.kind);
  const [d, setD] = useState(init.date);
  const [rep, setRep] = useState(repId || (isAdmin ? "" : currentUserId));
  const [doc, setDoc] = useState(init.doctorId || ""); const [dq, setDq] = useState("");
  const [prod, setProd] = useState(""); const [note, setNote] = useState("");
  const [title, setTitle] = useState(""); const [start, setStart] = useState("09:00"); const [end, setEnd] = useState("10:00"); const [etype, setEtype] = useState("meeting");
  const [target, setTarget] = useState(""); const [manager, setManager] = useState(false);
  const [busy, setBusy] = useState(false);
  const docs = useMemo(() => { const t = dq.trim().toLowerCase(); return (t ? doctors.filter(x => `${x.name} ${x.clinic_name || ""} ${x.city || ""}`.toLowerCase().includes(t)) : doctors).slice(0, 40); }, [dq, doctors]);
  const chosen = doctors.find(x => x.id === doc);
  async function submit() {
    setBusy(true);
    try {
      if (kind === "visit") { if (!doc) { toast("اختار الطبيب", "error"); return; } if (await onAddVisit(doc, d, prod, note, isAdmin ? rep : "")) onClose(); return; }
      if (kind === "event") {
        const r = await fetch("/api/calendar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, description: note, event_type: etype, owner_id: isAdmin ? rep || currentUserId : currentUserId, doctor_id: doc || null, starts_at: riyadhDateTime(d, start), ends_at: riyadhDateTime(d, end) }) });
        const j = await r.json().catch(() => ({})); if (!r.ok) { toast(j.error || "تعذر الإضافة", "error"); return; } toast("تمت إضافة الموعد — هيوصلك تنبيه قبله", "success"); onDone(); return;
      }
      const r = await fetch("/api/collaboration-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, body: note, target_user_id: target || null, manager_requested: manager || !target, starts_at: riyadhDateTime(d, start), ends_at: riyadhDateTime(d, end) }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) { toast(j.error || "تعذر الإرسال", "error"); return; } toast("اتبعت طلب المساعدة", "success"); onDone();
    } finally { setBusy(false); }
  }
  const f = "w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm";
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-end sm:place-items-center" onClick={onClose}>
      <div dir="rtl" onClick={e => e.stopPropagation()} className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 space-y-3">
        <div className="flex items-center justify-between"><div className="font-extrabold text-lg text-[var(--navy)]">إضافة</div><button onClick={onClose} className="h-9 w-9 rounded-xl border border-[var(--border)]">✕</button></div>
        <div className="grid grid-cols-3 rounded-xl bg-[var(--bg)] p-1 text-sm font-bold">{([["visit", "🩺 زيارة للخطة"], ["event", "🕑 موعد"], ["help", "🤝 طلب مساعدة"]] as Array<[AddKind, string]>).map(([k, l]) => <button key={k} onClick={() => setKind(k)} className={`rounded-lg py-2 ${kind === k ? "bg-white shadow text-[var(--navy)]" : "text-[var(--muted)]"}`}>{l}</button>)}</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="text-xs font-bold text-[var(--muted)]">اليوم</span><input type="date" value={d} onChange={e => setD(e.target.value)} className={f} /></label>
          {isAdmin && kind !== "help" ? <label className="block"><span className="text-xs font-bold text-[var(--muted)]">المندوب</span><select value={rep} onChange={e => setRep(e.target.value)} className={f}><option value="">اختار…</option>{reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label> : kind !== "visit" ? <div className="grid grid-cols-2 gap-1"><label><span className="text-xs font-bold text-[var(--muted)]">من</span><input type="time" value={start} onChange={e => setStart(e.target.value)} className={f} /></label><label><span className="text-xs font-bold text-[var(--muted)]">إلى</span><input type="time" value={end} onChange={e => setEnd(e.target.value)} className={f} /></label></div> : <div />}
        </div>
        {isAdmin && kind === "event" && <div className="grid grid-cols-2 gap-1"><label><span className="text-xs font-bold text-[var(--muted)]">من</span><input type="time" value={start} onChange={e => setStart(e.target.value)} className={f} /></label><label><span className="text-xs font-bold text-[var(--muted)]">إلى</span><input type="time" value={end} onChange={e => setEnd(e.target.value)} className={f} /></label></div>}
        {kind !== "visit" && <label className="block"><span className="text-xs font-bold text-[var(--muted)]">العنوان</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder={kind === "help" ? "مثال: محتاج دعم في زيارة د. فلان" : "مثال: اجتماع الفريق"} className={f} /></label>}
        {kind === "event" && <label className="block"><span className="text-xs font-bold text-[var(--muted)]">النوع</span><select value={etype} onChange={e => setEtype(e.target.value)} className={f}><option value="meeting">اجتماع</option><option value="visit">موعد زيارة</option><option value="task">مهمة</option></select></label>}
        {kind === "help" && <div className="space-y-2"><label className="block"><span className="text-xs font-bold text-[var(--muted)]">المساعدة من</span><select value={target} onChange={e => setTarget(e.target.value)} className={f}><option value="">المدير</option>{reps.filter(r => r.id !== currentUserId).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          {target && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={manager} onChange={e => setManager(e.target.checked)} /> إشراك المدير كمان</label>}
          {isAdmin && <div className="grid grid-cols-2 gap-1"><label><span className="text-xs font-bold text-[var(--muted)]">من</span><input type="time" value={start} onChange={e => setStart(e.target.value)} className={f} /></label><label><span className="text-xs font-bold text-[var(--muted)]">إلى</span><input type="time" value={end} onChange={e => setEnd(e.target.value)} className={f} /></label></div>}</div>}
        {kind !== "help" && <div><span className="text-xs font-bold text-[var(--muted)]">الطبيب {kind === "event" ? "(اختياري)" : ""}</span>
          {chosen ? <div className="flex items-center justify-between rounded-xl border border-[var(--navy)] bg-[var(--sky-light)] px-3 py-2"><div><div className="font-bold">{chosen.name}</div><div className="text-xs text-[var(--muted)]">{[chosen.classification, chosen.clinic_name, chosen.city].filter(Boolean).join(" · ")}</div></div><button onClick={() => setDoc("")} className="text-[var(--muted)]">✕</button></div>
            : <><input value={dq} onChange={e => setDq(e.target.value)} placeholder="🔍 ابحث بالاسم أو العيادة" className={f} /><div className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">{docs.map(x => <button key={x.id} onClick={() => setDoc(x.id)} className="block w-full text-right px-3 py-2 hover:bg-[var(--bg)]"><span className="font-bold text-sm">{x.name}</span> <span className="text-xs text-[var(--muted)]">{[x.classification, x.clinic_name].filter(Boolean).join(" · ")}</span></button>)}</div></>}
        </div>}
        {kind === "visit" && <label className="block"><span className="text-xs font-bold text-[var(--muted)]">المنتج (اختياري)</span><select value={prod} onChange={e => setProd(e.target.value)} className={f}><option value="">—</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <label className="block"><span className="text-xs font-bold text-[var(--muted)]">ملاحظة</span><input value={note} onChange={e => setNote(e.target.value)} className={f} /></label>
        {kind === "visit" && !isAdmin && <div className="text-[11px] text-[var(--muted)]">لو خطة اليوم ده معتمدة، الإضافة هتتبعت كطلب للمدير. ولو مفيش خطة، هتتعمل خطة يومية بانتظار الموافقة.</div>}
        <button onClick={submit} disabled={busy} className="w-full rounded-xl bg-[var(--navy)] text-white py-3 font-bold disabled:opacity-50">{busy ? "…" : kind === "visit" ? "إضافة للخطة" : kind === "event" ? "حفظ الموعد" : "إرسال الطلب"}</button>
      </div>
    </div>
  );
}
