"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useToast } from "@/components/Toast";
import DoctorRequestsClient from "../admin/requests/DoctorRequestsClient";
import type { HubDoctor } from "@/lib/doctors-hub";
import type { ClinicBalance } from "@/lib/clinic-balances";
import type { Account } from "@/lib/clinic-account";

type Opt = { id: string; name: string };
type Tab = "doctors" | "clinics" | "insights" | "requests";
type Seg = "all" | "overdue" | "never" | "followup" | "interested" | "planned" | "favorites" | "paused";
type Form = { name: string; clinic_name: string; city: string; specialty: string; classification: string; phone: string; email: string };
const EMPTY: Form = { name: "", clinic_name: "", city: "", specialty: "", classification: "", phone: "", email: "" };
const FAV = "elite_doctor_favorites";
const L = "ar-EG-u-nu-latn";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const addDays = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const fmtD = (s: string | null) => s ? new Intl.DateTimeFormat(L, { day: "numeric", month: "short", timeZone: "Asia/Riyadh" }).format(new Date(s.length === 10 ? `${s}T12:00:00Z` : s)) : "—";

type Health = "never" | "overdue" | "soon" | "ok";
function health(d: HubDoctor): Health {
  if (d.days_since === null) return "never";
  if (d.gap_days && d.days_since > d.gap_days) return "overdue";
  if (d.gap_days && d.days_since > d.gap_days * 0.75) return "soon";
  return "ok";
}
const H: Record<Health, { label: string; dot: string; pill: string }> = {
  never: { label: "ما اتزارش", dot: "bg-slate-400", pill: "bg-slate-100 text-slate-700" },
  overdue: { label: "متأخر", dot: "bg-red-500", pill: "bg-red-50 text-red-700" },
  soon: { label: "قرّب ميعاده", dot: "bg-amber-500", pill: "bg-amber-50 text-amber-800" },
  ok: { label: "في الميعاد", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700" },
};
const interestPct = (d: HubDoctor) => d.presented ? Math.round((d.interested / d.presented) * 100) : null;

function useMode() {
  const [m, setM] = useState<"phone" | "tablet" | "desktop">("desktop");
  useEffect(() => { const f = () => setM(window.innerWidth < 768 ? "phone" : window.innerWidth < 1200 ? "tablet" : "desktop"); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  return m;
}

export default function DoctorsHub({ isAdmin, canLink = false, reps, initialQ = "", initialTab = "doctors" }: { isAdmin: boolean; canLink?: boolean; reps: Opt[]; initialQ?: string; initialTab?: Tab }) {
  const toast = useToast();
  const mode = useMode();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [rows, setRows] = useState<HubDoctor[] | null>(null);
  const [days, setDays] = useState(90);
  const [repId, setRepId] = useState("");
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState(initialQ);
  const [seg, setSeg] = useState<Seg>("all");
  const [city, setCity] = useState(""); const [cls, setCls] = useState(""); const [clinic, setClinic] = useState("");
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: "priority", dir: 1 });
  const [fav, setFav] = useState<string[]>([]);
  const [view, setView] = useState<"table" | "cards">("table");
  const [sel, setSel] = useState<HubDoctor | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [form, setForm] = useState<{ doc: HubDoctor | null; f: Form } | null>(null);
  const [pending, setPending] = useState(0);
  const [showF, setShowF] = useState(false);
  const [bal, setBal] = useState<ClinicBalance[] | null>(null);
  const [openClinic, setOpenClinic] = useState<ClinicGroup | null>(null);
  useEffect(() => { if (tab !== "clinics" || bal) return; fetch("/api/clinics/balances").then(r => r.ok ? r.json() : null).then(j => setBal(j?.clinics || [])).catch(() => setBal([])); }, [tab, bal]);

  useEffect(() => { try { setFav(JSON.parse(localStorage.getItem(FAV) || "[]")); } catch { /* */ } }, []);
  useEffect(() => {
    let alive = true; setRows(null);
    const qs = new URLSearchParams({ days: String(days) }); if (isAdmin && repId) qs.set("repId", repId);
    fetch(`/api/doctors/hub?${qs}`).then(r => r.ok ? r.json() : Promise.reject()).then(j => alive && setRows(j.doctors)).catch(() => { if (alive) { setRows([]); toast("تعذر تحميل الأطباء", "error"); } });
    return () => { alive = false; };
  }, [days, repId, isAdmin, reload, toast]);
  useEffect(() => { fetch("/api/doctor-requests", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => j && setPending((j.requests || []).filter((x: { status: string }) => x.status === "pending").length)).catch(() => {}); }, [reload, tab]);
  const toggleFav = (id: string) => setFav(f => { const n = f.includes(id) ? f.filter(x => x !== id) : [...f, id]; try { localStorage.setItem(FAV, JSON.stringify(n)); } catch { /* */ } return n; });

  const all = rows || [];
  const cities = useMemo(() => [...new Set(all.map(d => d.city).filter(Boolean) as string[])].sort(), [all]);
  const clinics = useMemo(() => [...new Set(all.map(d => d.clinic_name).filter(Boolean) as string[])].sort(), [all]);
  const counts = useMemo(() => ({
    all: all.length, overdue: all.filter(d => health(d) === "overdue").length, never: all.filter(d => health(d) === "never").length,
    followup: all.filter(d => d.next_follow_up).length, interested: all.filter(d => (interestPct(d) ?? 0) >= 50).length, planned: all.filter(d => d.in_plan_next).length, favorites: all.filter(d => fav.includes(d.id)).length, paused: all.filter(d => d.paused).length,
  }), [all, fav]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const xs = all.filter(d => (!t || `${d.name} ${d.clinic_name} ${d.city} ${d.specialty} ${d.phone}`.toLowerCase().includes(t)) && (!city || d.city === city) && (!cls || d.classification === cls) && (!clinic || d.clinic_name === clinic)
      && (seg === "all" || (seg === "overdue" && health(d) === "overdue") || (seg === "never" && health(d) === "never") || (seg === "followup" && !!d.next_follow_up)
        || (seg === "interested" && (interestPct(d) ?? 0) >= 50) || (seg === "planned" && !!d.in_plan_next) || (seg === "favorites" && fav.includes(d.id)) || (seg === "paused" && d.paused)));
    const pri = (d: HubDoctor) => { const h = health(d); const c = d.classification === "A" ? 0 : d.classification === "B" ? 1 : 2; return (h === "overdue" ? 0 : h === "never" ? 1 : h === "soon" ? 2 : 3) * 10 + c; };
    const val = (d: HubDoctor): number | string => sort.k === "priority" ? pri(d) * 10000 - (d.days_since ?? 9999) : sort.k === "name" ? d.name : sort.k === "visits" ? d.visits : sort.k === "interest" ? (interestPct(d) ?? -1) : sort.k === "last" ? (d.days_since ?? 99999) : sort.k === "samples" ? d.samples : d.name;
    return [...xs].sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir; });
  }, [all, q, city, cls, clinic, seg, fav, sort]);
  // cards: render a page at a time (174 cards = ~35,000px on a phone); more load as you scroll
  const PAGE = 24;
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { setLimit(PAGE); }, [q, city, cls, clinic, seg, sort]);
  const more = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = more.current; if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) setLimit(l => l + PAGE); }, { rootMargin: "600px 0px" });
    io.observe(el); return () => io.disconnect();
  }, [limit, list.length]);

  async function addToPlan(ids: string[], date: string) {
    if (isAdmin && !repId) { toast("اختار المندوب من فوق الأول", "info"); return; }
    let ok = 0, req = 0, fail = 0;
    for (const id of ids) {
      const r = await fetch("/api/agenda/plan-items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date, doctorId: id, repId: isAdmin ? repId : undefined }) });
      if (r.status === 202) req++; else if (r.ok) ok++; else fail++;
    }
    toast([ok && `${ok} اتضافوا للخطة`, req && `${req} اتبعتوا كطلب للمدير`, fail && `${fail} فشلوا`].filter(Boolean).join(" · ") || "تم", fail ? "error" : "success");
    setChecked([]); setReload(n => n + 1);
  }
  const canPause = !isAdmin || !!repId;
  const monthName = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", timeZone: "Asia/Riyadh" }).format(new Date());
  async function setPaused(ids: string[], paused: boolean) {
    if (!canPause) { toast("اختار المندوب من فوق الأول", "info"); return; }
    setRows(rs => rs && rs.map(d => ids.includes(d.id) ? { ...d, paused } : d)); // optimistic
    const r = await fetch("/api/doctors/pauses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doctorIds: ids, paused, repId: isAdmin ? repId : undefined }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) { toast(j?.error || "تعذر الحفظ", "error"); setReload(n => n + 1); return; }
    toast(paused ? `⏸ ${ids.length === 1 ? "الطبيب" : `${ids.length} أطباء`} Inactive لشهر ${monthName} — مش هيتحسبوا في التغطية` : `▶ ${ids.length === 1 ? "الطبيب رجع" : `${ids.length} أطباء رجعوا`} Active`, "success");
    setChecked([]);
  }
  async function saveForm() {
    if (!form) return;
    const { doc, f } = form;
    const r = await fetch(isAdmin ? (doc ? `/api/admin/doctors/${doc.id}` : "/api/admin/doctors") : "/api/doctor-requests", {
      method: isAdmin ? (doc ? "PATCH" : "POST") : "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(isAdmin ? f : { kind: doc ? "update" : "create", doctor_id: doc?.id, payload: f }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) { toast(typeof j?.error === "string" ? j.error : "تعذر الحفظ", "error"); return; }
    toast(isAdmin ? "تم الحفظ" : "اتبعت الطلب للأدمن", "success"); setForm(null); setReload(n => n + 1);
  }
  const openForm = (doc: HubDoctor | null) => setForm({ doc, f: doc ? { name: doc.name, clinic_name: doc.clinic_name || "", city: doc.city || "", specialty: doc.specialty || "", classification: doc.classification || "", phone: doc.phone || "", email: doc.email || "" } : EMPTY });
  const exportUrl = (ids?: string[]) => { const qs = new URLSearchParams({ days: String(days) }); if (isAdmin && repId) qs.set("repId", repId); if (ids?.length) qs.set("ids", ids.join(",")); return `/api/doctors/hub/export?${qs}`; };
  const effView = mode === "desktop" ? view : "cards";

  const SEGS: Array<[Seg, string, string]> = [["all", "الكل", ""], ["overdue", "متأخرين", "text-red-700"], ["never", "ما اتزاروش", ""], ["followup", "متابعات", "text-amber-700"], ["interested", "مهتمين", "text-emerald-700"], ["planned", "في الخطة", ""], ["favorites", "★ المفضلة", ""], ...(canPause ? [["paused", "⏸ Inactive الشهر ده", "text-slate-600"] as [Seg, string, string]] : [])];
  const TABS: Array<[Tab, string]> = [["doctors", "الأطباء"], ["clinics", "العيادات"], ["insights", "الأداء والتحليل"], ["requests", isAdmin ? `طلبات التعديل${pending ? ` (${pending})` : ""}` : `طلباتي${pending ? ` (${pending})` : ""}`]];

  return (
    <div className="mt-4 space-y-3 pb-20 lg:pb-0">
      {/* toolbar */}
      <div className={`rounded-3xl border border-[var(--border)] bg-white p-3 space-y-3 shadow-sm ${mode === "phone" ? "" : "sticky top-0 z-20"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-[var(--bg)] p-1 overflow-x-auto">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold ${tab === k ? "bg-white shadow text-[var(--navy)]" : "text-[var(--muted)]"}`}>{l}</button>)}</div>
          <div className="flex items-center gap-2 mr-auto">
            {isAdmin && <select value={repId} onChange={e => setRepId(e.target.value)} className="h-10 rounded-xl border border-[var(--border)] px-2 text-sm"><option value="">كل الفريق</option>{reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
            <select value={days} onChange={e => setDays(Number(e.target.value))} className="h-10 rounded-xl border border-[var(--border)] px-2 text-sm" title="فترة الأرقام">{[30, 90, 180, 365].map(d => <option key={d} value={d}>آخر {d} يوم</option>)}</select>
            <a href={exportUrl()} className="h-10 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 text-sm font-bold grid place-items-center">Excel</a>
            <button onClick={() => openForm(null)} className="h-10 rounded-xl bg-[var(--navy)] text-white px-3 text-sm font-bold whitespace-nowrap">+ طبيب</button>
          </div>
        </div>
        {(tab === "doctors" || tab === "clinics") && <>
          <div className="flex flex-wrap gap-2">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 اسم، عيادة، مدينة، تخصص، تليفون…" className="flex-1 min-w-[200px] h-10 rounded-xl border border-[var(--border)] px-3 text-sm" />
            {mode === "phone" && <button onClick={() => setShowF(x => !x)} className={`h-10 rounded-xl border px-3 text-sm font-bold ${showF || city || cls || clinic ? "border-[var(--navy)] text-[var(--navy)]" : "border-[var(--border)]"}`}>فلاتر{city || cls || clinic ? " •" : ""}</button>}
            {(mode !== "phone" || showF) && <>
            <select value={city} onChange={e => setCity(e.target.value)} className="h-10 rounded-xl border border-[var(--border)] px-2 text-sm"><option value="">كل المدن</option>{cities.map(c => <option key={c}>{c}</option>)}</select>
            <select value={cls} onChange={e => setCls(e.target.value)} className="h-10 rounded-xl border border-[var(--border)] px-2 text-sm"><option value="">كل الفئات</option>{["A", "B", "C"].map(c => <option key={c} value={c}>فئة {c}</option>)}</select>
            {tab === "doctors" && <select value={clinic} onChange={e => setClinic(e.target.value)} className="h-10 rounded-xl border border-[var(--border)] px-2 text-sm max-w-[12rem]"><option value="">كل العيادات</option>{clinics.map(c => <option key={c}>{c}</option>)}</select>}
            {tab === "doctors" && <select value={`${sort.k}:${sort.dir}`} onChange={e => { const [k, d] = e.target.value.split(":"); setSort({ k, dir: Number(d) as 1 | -1 }); }} className="h-10 rounded-xl border border-[var(--border)] px-2 text-sm">
              <option value="priority:1">الأولوية (المتأخر الأول)</option><option value="last:-1">الأطول من غير زيارة</option><option value="visits:-1">الأكثر زيارة</option><option value="interest:-1">الأكثر اهتماماً</option><option value="samples:-1">الأكثر عينات</option><option value="name:1">الاسم</option></select>}
            </>}
            {tab === "doctors" && mode === "desktop" && <div className="flex rounded-xl bg-[var(--bg)] p-1">{([["table", "☰"], ["cards", "▦"]] as const).map(([v, l]) => <button key={v} onClick={() => setView(v)} className={`w-9 rounded-lg text-sm ${view === v ? "bg-white shadow" : ""}`}>{l}</button>)}</div>}
          </div>
          {tab === "doctors" && <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">{SEGS.map(([k, l, c]) => <button key={k} onClick={() => setSeg(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold border ${seg === k ? "bg-[var(--navy)] text-white border-[var(--navy)]" : `bg-white border-[var(--border)] ${c}`}`}>{l} <span className="opacity-70">{rows ? counts[k] : "…"}</span></button>)}</div>}
        </>}
      </div>

      {!rows && tab !== "requests" && <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-32 rounded-3xl bg-white animate-pulse" />)}</div>}

      {rows && tab === "doctors" && <>
        {canPause && mode !== "phone" && Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", day: "numeric" }).format(new Date())) <= 7 && !counts.paused && <div className="dz-in flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--sky-border)] bg-[var(--sky-light)] px-4 py-3 text-sm"><span className="text-lg">🗓️</span><span className="flex-1"><b className="text-[var(--navy)]">بداية شهر {monthName}:</b> حدد الأطباء اللي مش هتزورهم الشهر ده واعملهم <b>Inactive</b> — كده التغطية تتحسب على الأطباء الحقيقيين بس.</span><span className="text-[11px] text-[var(--muted)]">علّم عليهم من الجدول ← «Inactive الشهر ده»</span></div>}
        {checked.length > 0 && <BulkBar n={checked.length} onPlan={d => void addToPlan(checked, d)} exportHref={exportUrl(checked)} onClear={() => setChecked([])} needRep={isAdmin && !repId} onPause={canPause ? (p => void setPaused(checked, p)) : undefined} />}
        {effView === "table" ? <Table list={list} checked={checked} setChecked={setChecked} fav={fav} toggleFav={toggleFav} onOpen={setSel} sort={sort} setSort={setSort} />
          : <div className={`grid gap-3 ${mode === "phone" ? "" : "sm:grid-cols-2 xl:grid-cols-3"}`}>{list.slice(0, limit).map(d => <DocCard key={d.id} d={d} fav={fav.includes(d.id)} toggleFav={() => toggleFav(d.id)} onOpen={() => setSel(d)} isAdmin={isAdmin} />)}</div>}
        {effView !== "table" && list.length > limit && <div ref={more} className="flex justify-center"><button type="button" onClick={() => setLimit(l => l + PAGE)} className="min-h-11 rounded-2xl border border-[var(--border)] bg-white px-5 text-sm font-bold text-[var(--navy)]">عرض المزيد ({list.length - limit} باقي)</button></div>}
        {!list.length && <div className="rounded-3xl border border-dashed border-[var(--border-strong)] bg-white p-10 text-center text-[var(--muted)]">لا يوجد أطباء مطابقين</div>}
      </>}
      {rows && tab === "clinics" && <Clinics rows={all.filter(d => (!city || d.city === city) && (!cls || d.classification === cls) && (!q.trim() || `${d.clinic_name} ${d.city}`.toLowerCase().includes(q.trim().toLowerCase())))} bal={bal} onOpen={setOpenClinic} />}
      {rows && tab === "insights" && <Insights rows={all} days={days} onSeg={(s, c) => { setSeg(s); if (c !== undefined) setCls(c); setTab("doctors"); }} onOpen={setSel} />}
      {tab === "requests" && (isAdmin ? <div className="rounded-3xl border border-[var(--border)] bg-white p-3"><DoctorRequestsClient /></div> : <MyRequests />)}

      {sel && <QuickView d={sel} isAdmin={isAdmin} onClose={() => setSel(null)} onPlan={date => { void addToPlan([sel.id], date); setSel(null); }} onEdit={() => { openForm(sel); setSel(null); }} fav={fav.includes(sel.id)} toggleFav={() => toggleFav(sel.id)} sheet={mode === "phone"} onPause={canPause ? (p => { void setPaused([sel.id], p); setSel({ ...sel, paused: p }); }) : undefined} monthName={monthName} />}
      {openClinic && <ClinicPanel g={openClinic} canLink={canLink} sheet={mode === "phone"} onClose={() => setOpenClinic(null)}
        onDoctor={d => { setOpenClinic(null); setSel(d); }} onFilter={() => { setClinic(openClinic.name); setTab("doctors"); setSeg("all"); setOpenClinic(null); }} />}
      {form && <DoctorForm form={form} setForm={setForm} isAdmin={isAdmin} cities={cities} clinics={clinics} onSave={() => void saveForm()} />}
    </div>
  );
}

// ───────────── pieces ─────────────
const PausedPill = () => <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-white" title="خارج حساب التغطية الشهر ده">⏸ Inactive الشهر ده</span>;
function HealthPill({ d }: { d: HubDoctor }) {
  const h = health(d); const m = H[h];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${m.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}{d.days_since !== null ? ` · ${d.days_since} يوم` : ""}</span>;
}
const ClassBadge = ({ c }: { c: string | null }) => <span className={`h-9 w-9 shrink-0 rounded-xl grid place-items-center text-sm font-extrabold ${c === "A" ? "bg-[var(--navy)] text-white" : c === "B" ? "bg-[var(--sky-soft)] text-[var(--navy)]" : "bg-slate-100 text-slate-600"}`}>{c || "—"}</span>;

function DocCard({ d, fav, toggleFav, onOpen, isAdmin }: { d: HubDoctor; fav: boolean; toggleFav: () => void; onOpen: () => void; isAdmin: boolean }) {
  const ip = interestPct(d); const phone = (d.phone || "").replace(/\s/g, "");
  return (
    <div className={`rounded-3xl border border-[var(--border)] bg-white overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md ${d.paused ? "opacity-60" : ""}`}>
      <button onClick={onOpen} className="w-full text-right p-3.5 flex gap-3">
        <ClassBadge c={d.classification} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1"><div className="font-extrabold text-[var(--navy)] truncate flex-1">{d.name}</div></div>
          <div className="text-xs text-[var(--muted)] truncate">{[d.specialty, d.clinic_name, d.city].filter(Boolean).join(" · ")}</div>
          <div className="flex flex-wrap gap-1 mt-1.5">{d.paused && <PausedPill />}<HealthPill d={d} />{d.next_follow_up && <span className="rounded-full bg-amber-50 text-amber-800 px-2 py-0.5 text-[11px] font-bold">↻ {fmtD(d.next_follow_up)}</span>}{d.in_plan_next && <span className="rounded-full bg-[var(--sky-soft)] text-[var(--navy)] px-2 py-0.5 text-[11px] font-bold">🗓 {fmtD(d.in_plan_next)}</span>}</div>
        </div>
      </button>
      <div className="grid grid-cols-4 border-t border-[var(--border)] text-center text-xs">
        <Stat l="زيارات" v={d.visits} /><Stat l="اهتمام" v={ip === null ? "—" : `${ip}%`} c={ip === null ? "" : ip >= 50 ? "text-emerald-700" : ip < 25 ? "text-red-700" : ""} /><Stat l="عينات" v={d.samples} /><Stat l="أوردر" v={d.orders} />
      </div>
      {d.last_note && <div className="px-3.5 py-2 text-[11px] text-[var(--muted)] border-t border-[var(--border)] line-clamp-2">«{d.last_note}»{isAdmin && d.last_rep ? ` — ${d.last_rep}` : ""}</div>}
      <div className="flex border-t border-[var(--border)] text-xs font-bold">
        {!isAdmin && <Link href={`/visits/new?doctorId=${d.id}`} className="flex-1 py-2.5 text-center bg-[var(--navy)] text-white">▶ زيارة</Link>}
        {phone ? <a href={`tel:${phone}`} className="flex-1 py-2.5 text-center">📞</a> : null}
        <Link href={`/doctors/${d.id}`} className="flex-1 py-2.5 text-center border-r border-[var(--border)]">الملف</Link>
        <button onClick={toggleFav} className={`w-12 border-r border-[var(--border)] ${fav ? "text-amber-500" : "text-slate-300"}`}>★</button>
      </div>
    </div>
  );
}
const Stat = ({ l, v, c = "" }: { l: string; v: string | number; c?: string }) => <div className="py-2 border-l last:border-l-0 border-[var(--border)]"><div className={`font-extrabold text-sm ${c}`}>{v}</div><div className="text-[10px] text-[var(--muted)]">{l}</div></div>;

function Table({ list, checked, setChecked, fav, toggleFav, onOpen, sort, setSort }: { list: HubDoctor[]; checked: string[]; setChecked: (f: (x: string[]) => string[]) => void; fav: string[]; toggleFav: (id: string) => void; onOpen: (d: HubDoctor) => void; sort: { k: string; dir: 1 | -1 }; setSort: (s: { k: string; dir: 1 | -1 }) => void }) {
  const th = (k: string, l: string) => <th onClick={() => setSort({ k, dir: sort.k === k ? (sort.dir === 1 ? -1 : 1) : k === "name" ? 1 : -1 })} className="p-3 text-right cursor-pointer select-none hover:text-[var(--navy)] whitespace-nowrap">{l}{sort.k === k ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</th>;
  const allOn = list.length > 0 && list.every(d => checked.includes(d.id));
  return (
    <div className="rounded-3xl border border-[var(--border)] bg-white overflow-hidden">
      <div className="overflow-auto max-h-[72vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--bg)] text-xs text-[var(--muted)]"><tr>
            <th className="p-3 w-8"><input type="checkbox" checked={allOn} onChange={() => setChecked(() => allOn ? [] : list.map(d => d.id))} /></th>
            {th("name", "الطبيب")}<th className="p-3 text-right">العيادة</th>{th("last", "الحالة")}{th("visits", "زيارات")}{th("interest", "اهتمام")}{th("samples", "عينات")}<th className="p-3 text-right">متابعة / خطة</th><th className="p-3 text-right">آخر ملاحظة</th><th className="p-3" />
          </tr></thead>
          <tbody>{list.map(d => { const ip = interestPct(d); return (
            <tr key={d.id} onClick={() => onOpen(d)} className={`border-t border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--sky-light)] ${checked.includes(d.id) ? "bg-[var(--sky-light)]" : ""} ${d.paused ? "opacity-60" : ""}`}>
              <td className="p-3" onClick={e => e.stopPropagation()}><input type="checkbox" checked={checked.includes(d.id)} onChange={() => setChecked(x => x.includes(d.id) ? x.filter(y => y !== d.id) : [...x, d.id])} /></td>
              <td className="p-3"><div className="flex items-center gap-2"><ClassBadge c={d.classification} /><div className="min-w-0"><div className="font-bold text-[var(--navy)]">{d.name}</div><div className="text-[11px] text-[var(--muted)]">{d.specialty || ""}</div></div></div></td>
              <td className="p-3 text-xs"><div>{d.clinic_name || "—"}</div><div className="text-[var(--muted)]">{d.city}</div></td>
              <td className="p-3"><div className="flex flex-wrap gap-1">{d.paused && <PausedPill />}<HealthPill d={d} /></div></td>
              <td className="p-3 font-bold">{d.visits}<span className="text-[10px] text-[var(--muted)] font-normal"> / {d.total_visits}</span></td>
              <td className="p-3">{ip === null ? <span className="text-[var(--muted)]">—</span> : <div className="w-20"><div className="text-xs font-bold">{ip}%</div><div className="h-1.5 rounded-full bg-[var(--bg)]"><div className={`h-full rounded-full ${ip >= 50 ? "bg-emerald-500" : ip >= 25 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${ip}%` }} /></div></div>}</td>
              <td className="p-3 font-bold">{d.samples}</td>
              <td className="p-3 text-xs whitespace-nowrap">{d.next_follow_up && <div className="text-amber-700 font-bold">↻ {fmtD(d.next_follow_up)}</div>}{d.in_plan_next && <div className="text-[var(--navy)] font-bold">🗓 {fmtD(d.in_plan_next)}</div>}{!d.next_follow_up && !d.in_plan_next && <span className="text-[var(--muted)]">—</span>}</td>
              <td className="p-3 text-xs text-[var(--muted)] max-w-[260px]"><div className="line-clamp-2">{d.last_note || "—"}</div></td>
              <td className="p-3" onClick={e => e.stopPropagation()}><button onClick={() => toggleFav(d.id)} className={fav.includes(d.id) ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}>★</button></td>
            </tr>); })}</tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-xs text-[var(--muted)] border-t border-[var(--border)]">{list.length} طبيب — حدد أكتر من طبيب لإضافتهم للخطة أو تصديرهم</div>
    </div>
  );
}

function BulkBar({ n, onPlan, exportHref, onClear, needRep, onPause }: { n: number; onPlan: (d: string) => void; exportHref: string; onClear: () => void; needRep: boolean; onPause?: (paused: boolean) => void }) {
  const [d, setD] = useState(addDays(today(), 1));
  return (
    <div className="rounded-2xl bg-[var(--navy)] text-white p-3 flex flex-wrap items-center gap-2 sticky top-[7.5rem] z-10 shadow-lg">
      <span className="font-bold">{n} طبيب محدد</span>
      <div className="flex items-center gap-1.5 mr-auto">
        <span className="text-xs text-white/80">إضافة للخطة يوم</span>
        <input type="date" value={d} min={today()} onChange={e => setD(e.target.value)} className="rounded-lg text-[var(--ink)] px-2 py-1.5 text-sm" />
        <button onClick={() => onPlan(d)} disabled={needRep} title={needRep ? "اختار المندوب من فوق" : ""} className="rounded-lg bg-white text-[var(--navy)] px-3 py-1.5 text-sm font-bold disabled:opacity-40">إضافة</button>
        {onPause && <button onClick={() => onPause(true)} className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-bold hover:bg-white/25" title="مش هتزورهم الشهر ده — يتشالوا من حساب التغطية">⏸ Inactive الشهر ده</button>}
        {onPause && <button onClick={() => onPause(false)} className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-bold hover:bg-white/25">▶ Active</button>}
        <a href={exportHref} className="rounded-lg border border-white/40 px-3 py-1.5 text-sm font-bold">Excel</a>
        <button onClick={onClear} className="rounded-lg px-2 text-white/80">✕</button>
      </div>
    </div>
  );
}

type Ctx = { history: Array<{ id: string; visited_at: string; status: string; notes: string; rep_name: string; presented: Array<{ product_id: string; name: string; reaction: string }> }>; followups: Array<{ due: string; note: string }>; plan: { product_name: string | null } | null };
const RX: Record<string, string> = { interested: "👍", neutral: "😐", not_interested: "👎" };
function QuickView({ d, isAdmin, onClose, onPlan, onEdit, fav, toggleFav, sheet, onPause, monthName }: { d: HubDoctor; isAdmin: boolean; onClose: () => void; onPlan: (date: string) => void; onEdit: () => void; fav: boolean; toggleFav: () => void; sheet: boolean; onPause?: (paused: boolean) => void; monthName: string }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [date, setDate] = useState(addDays(today(), 1));
  useEffect(() => { fetch(`/api/visits/context?doctorId=${d.id}`).then(r => r.ok ? r.json() : null).then(setCtx).catch(() => {}); }, [d.id]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const ip = interestPct(d); const phone = (d.phone || "").replace(/\s/g, "");
  return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose}>
      <div dir="rtl" onClick={e => e.stopPropagation()} className={sheet ? "absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white p-4 space-y-3" : "absolute top-0 bottom-0 right-0 w-[min(440px,95vw)] overflow-y-auto bg-white p-5 space-y-4 shadow-2xl"}>
        {sheet && <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />}
        <div className="flex items-start gap-3">
          <ClassBadge c={d.classification} />
          <div className="min-w-0 flex-1"><div className="text-xl font-extrabold text-[var(--navy)]">{d.name}</div><div className="text-sm text-[var(--muted)]">{[d.specialty, d.clinic_name, d.city].filter(Boolean).join(" · ")}</div><div className="mt-1.5"><HealthPill d={d} /></div></div>
          <button onClick={toggleFav} className={`text-2xl ${fav ? "text-amber-500" : "text-slate-300"}`}>★</button>
          <button onClick={onClose} className="h-9 w-9 rounded-xl border border-[var(--border)]">✕</button>
        </div>
        <div className="grid grid-cols-4 rounded-2xl border border-[var(--border)] text-center"><Stat l="زيارات" v={d.visits} /><Stat l="اهتمام" v={ip === null ? "—" : `${ip}%`} /><Stat l="عينات" v={d.samples} /><Stat l="أوردر" v={d.orders} /></div>
        {d.gap_days && <div className="text-xs text-[var(--muted)]">فئة {d.classification}: المفروض زيارة كل {d.gap_days} يوم{d.days_since !== null ? ` — آخر زيارة من ${d.days_since} يوم` : " — لسه ما اتزارش"}</div>}
        <div className="grid grid-cols-2 gap-2 text-sm font-bold">
          {!isAdmin && <Link href={`/visits/new?doctorId=${d.id}`} className="col-span-2 rounded-xl bg-[var(--navy)] text-white py-3 text-center">▶ ابدأ زيارة دلوقتي</Link>}
          {phone && <a href={`tel:${phone}`} className="rounded-xl border border-[var(--border)] py-2.5 text-center">📞 اتصال</a>}
          <Link href={`/doctors/${d.id}`} className="rounded-xl border border-[var(--border)] py-2.5 text-center">الملف الكامل</Link>
          {onPause && <button onClick={() => onPause(!d.paused)} className={`col-span-2 flex items-center justify-center gap-2 rounded-xl py-2.5 transition ${d.paused ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100" : "bg-slate-100 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"}`}>{d.paused ? `▶ رجّعه Active لشهر ${monthName}` : `⏸ Inactive لشهر ${monthName} — مش هزوره`}<span className="text-[10.5px] font-normal opacity-70">{d.paused ? "هيرجع في حساب التغطية" : "مش هيتحسب في التغطية"}</span></button>}
          <button onClick={onEdit} className="rounded-xl border border-[var(--border)] py-2.5">{isAdmin ? "تعديل البيانات" : "طلب تعديل"}</button>
          {isAdmin && <Link href={`/admin/reports?type=visits&from=${addDays(today(), -89)}`} className="rounded-xl border border-[var(--border)] py-2.5 text-center">التقارير</Link>}
        </div>
        <div className="rounded-2xl bg-[var(--sky-light)] p-3">
          <div className="text-xs font-bold text-[var(--muted)] mb-1.5">إضافة لخطة {isAdmin ? "المندوب المختار" : "زياراتي"}</div>
          <div className="flex gap-2"><input type="date" value={date} min={today()} onChange={e => setDate(e.target.value)} className="flex-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm bg-white" /><button onClick={() => onPlan(date)} className="rounded-lg bg-[var(--navy)] text-white px-4 text-sm font-bold">إضافة</button></div>
          {d.in_plan_next && <div className="text-[11px] text-[var(--navy)] mt-1">موجود في الخطة يوم {fmtD(d.in_plan_next)}</div>}
        </div>
        {ctx?.followups?.length ? <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-sm space-y-1">{ctx.followups.map((f, i) => <div key={i}>↻ <b>{fmtD(f.due)}</b>{f.note ? ` — ${f.note}` : ""}</div>)}</div> : null}
        <div>
          <div className="font-bold text-sm mb-2">آخر الزيارات</div>
          {!ctx && <div className="space-y-2">{[0, 1].map(i => <div key={i} className="h-16 rounded-xl bg-[var(--bg)] animate-pulse" />)}</div>}
          {ctx && !ctx.history.length && <div className="text-sm text-[var(--muted)]">لسه مفيش زيارات</div>}
          <div className="space-y-2">{ctx?.history.map(h => <div key={h.id} className="rounded-xl border border-[var(--border)] p-2.5 text-sm">
            <div className="flex justify-between text-[11px] text-[var(--muted)]"><span>{fmtD(h.visited_at)} · {h.rep_name}</span><span>{h.status === "completed" ? "مكتملة" : h.status === "cancelled" ? "ملغاة" : "مجدولة"}</span></div>
            {h.presented.length > 0 && <div className="flex flex-wrap gap-1 my-1">{h.presented.map(p => <span key={p.product_id} className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] font-bold">{RX[p.reaction] || ""} {p.name}</span>)}</div>}
            {h.notes && <div className="text-xs leading-5 line-clamp-3">{h.notes}</div>}
          </div>)}</div>
        </div>
      </div>
    </div>
  );
}

type ClinicGroup = { key: string; id: string | null; name: string; city: string | null; ds: HubDoctor[]; visits: number; overdue: number; never: number; covered: number; a: number; last: number | null };
const sar = (n: number) => `${Math.round(n).toLocaleString("en-US")} ر.س`;
const normName = (s: string | null) => (s || "").trim().toLowerCase();
function balanceOf(g: ClinicGroup, bal: ClinicBalance[] | null) {
  if (!bal) return undefined;
  return (g.id && bal.find(b => b.id === g.id)) || bal.find(b => normName(b.name) === normName(g.name)) || null;
}

function DebtPill({ b }: { b: ClinicBalance | null | undefined }) {
  if (b === undefined) return <span className="es-shimmer h-6 w-28 rounded-full" />;
  const [t, c] = !b ? ["مش مربوطة بدفترة", "bg-slate-100 text-slate-500"] : b.overdue > 0 ? [`متأخر ${sar(b.overdue)}`, "bg-red-50 text-red-700"]
    : b.unpaid > 0 ? [`عليها ${sar(b.unpaid)}`, "bg-sky-50 text-sky-800"] : ["✓ مفيش مديونية", "bg-emerald-50 text-emerald-700"];
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${c}`}>{t}</span>;
}

function Clinics({ rows, bal, onOpen }: { rows: HubDoctor[]; bal: ClinicBalance[] | null; onOpen: (g: ClinicGroup) => void }) {
  const groups = useMemo(() => {
    // one card per real clinic (by id); doctors without a clinic id fall back to the clinic name they carry
    const m = new Map<string, HubDoctor[]>();
    for (const d of rows) { const k = d.clinic_id || `n:${normName(d.clinic_name) || "—"}`; (m.get(k) || m.set(k, []).get(k)!).push(d); }
    return [...m.entries()].map(([key, ds]): ClinicGroup => {
      const names = new Map<string, number>(); for (const d of ds) if (d.clinic_name) names.set(d.clinic_name, (names.get(d.clinic_name) || 0) + 1);
      const name = [...names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "بدون عيادة";
      return { key, id: key.startsWith("n:") ? null : key, name, city: ds[0].city, ds, visits: ds.reduce((a, d) => a + d.visits, 0), overdue: ds.filter(d => health(d) === "overdue").length, never: ds.filter(d => health(d) === "never").length,
        covered: ds.filter(d => d.visits > 0).length, a: ds.filter(d => d.classification === "A").length, last: ds.map(d => d.days_since).filter((x): x is number => x !== null).sort((a, b) => a - b)[0] ?? null };
    }).sort((a, b) => b.overdue + b.never - (a.overdue + a.never) || b.ds.length - a.ds.length);
  }, [rows]);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((g, i) => { const cov = Math.round((g.covered / g.ds.length) * 100); const b = balanceOf(g, bal); return (
        <button key={g.key} type="button" onClick={() => onOpen(g)} style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }} aria-label={`تفاصيل ${g.name}`}
          className="es-card-in group flex flex-col rounded-[26px] border border-[var(--border)] bg-white p-4 text-right shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--sky-soft)] text-xl">🏥</div>
            <div className="min-w-0 flex-1"><div className="truncate font-extrabold text-[var(--navy)]" dir="auto">{g.name}</div><div className="text-xs text-[var(--muted)]">{g.city || "—"} · {g.ds.length} طبيب{g.a ? ` · ${g.a} فئة A` : ""}</div></div>
            <span className="mt-1 text-[var(--muted)] transition group-hover:-translate-x-1">‹</span>
          </div>
          <div className="mt-3"><div className="mb-1 flex justify-between text-xs"><span className="text-[var(--muted)]">التغطية في الفترة</span><b>{g.covered}/{g.ds.length}</b></div><div className="h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className={`h-full rounded-full transition-all duration-700 ${cov >= 70 ? "bg-emerald-500" : cov >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${cov}%` }} /></div></div>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold">
            <span className="rounded-full bg-[var(--bg)] px-2 py-0.5">{g.visits} زيارة</span>
            {g.overdue > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">{g.overdue} متأخر</span>}
            {g.never > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{g.never} ما اتزاروش</span>}
            <span className="rounded-full bg-[var(--bg)] px-2 py-0.5">آخر زيارة: {g.last === null ? "—" : g.last === 0 ? "النهارده" : `من ${g.last} يوم`}</span>
          </div>
          <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3"><DebtPill b={b} />{b?.shared && <span className="text-[10.5px] font-bold text-[var(--muted)]">🏢 حساب مشترك</span>}</div>
        </button>); })}
    </div>
  );
}

const ACC_STATUS: Record<string, [string, string]> = { stopped: ["بطّلت تطلب", "bg-red-50 text-red-700"], declining: ["مشترياتها بتقل", "bg-amber-50 text-amber-800"], ok: ["منتظمة", "bg-emerald-50 text-emerald-700"], none: ["لسه ما طلبتش", "bg-slate-100 text-slate-600"] };
type ClinicAcc = Account & { customers: string[]; branches?: string[] };
function ClinicPanel({ g, canLink, sheet, onClose, onDoctor, onFilter }: { g: ClinicGroup; canLink: boolean; sheet: boolean; onClose: () => void; onDoctor: (d: HubDoctor) => void; onFilter: () => void }) {
  const [data, setData] = useState<{ clinic: { id: string; name: string; city: string | null } | null; account: ClinicAcc | null } | null>(null);
  const [inv, setInv] = useState(false);
  useEffect(() => {
    let on = true; setData(null);
    const qs = g.id ? `id=${g.id}` : `name=${encodeURIComponent(g.name)}`;
    fetch(`/api/clinics/account?${qs}`).then(r => r.ok ? r.json() : { clinic: null, account: null }).then(j => { if (on) setData(j); }).catch(() => { if (on) setData({ clinic: null, account: null }); });
    return () => { on = false; };
  }, [g.id, g.name]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const a = data?.account || null;
  const docs = [...g.ds].sort((x, y) => { const p = (d: HubDoctor) => ({ overdue: 0, never: 1, soon: 2, ok: 3 })[health(d)]; return p(x) - p(y) || (x.classification || "Z").localeCompare(y.classification || "Z"); });
  const maxNet = a?.products.reduce((m, p) => Math.max(m, p.net), 0) || 1;
  const [sl, sc] = a ? ACC_STATUS[a.status] : ["", ""];
  // portal: the page wrapper animates with a transform, which would trap a fixed panel inside it
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-[var(--navy)]/25 backdrop-blur-[2px]" onClick={onClose}>
      <section dir="rtl" role="dialog" aria-modal="true" aria-label={`تفاصيل ${g.name}`} onClick={e => e.stopPropagation()}
        className={`flex flex-col overflow-hidden bg-[var(--bg)] shadow-2xl ${sheet ? "es-sheet-up absolute inset-x-0 bottom-0 max-h-[90vh] rounded-t-[26px]" : "es-drawer-in absolute inset-y-0 right-0 w-[min(500px,96vw)]"}`}>
        <div className="shrink-0 border-b border-[var(--border)] bg-white px-5 pb-4 pt-3">
          {sheet && <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />}
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--sky-soft)] text-2xl">🏥</div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-extrabold text-[var(--navy)]" dir="auto">{data?.clinic?.name || g.name}</h2>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{[data?.clinic?.city || g.city, `${g.ds.length} طبيب`, a ? `من دفترة · ${a.customers.join("، ")}` : ""].filter(Boolean).join(" · ")}</div>
              {a && <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${sc}`}>● {sl}</span>}
            </div>
            <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--bg)] text-[var(--muted)]" aria-label="إغلاق">✕</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl border border-[var(--border)] bg-white p-2.5"><div className="text-lg font-extrabold text-[var(--navy)]">{g.covered}/{g.ds.length}</div><div className="text-[10.5px] text-[var(--muted)]">اتزاروا في الفترة</div></div>
            <div className="rounded-2xl border border-[var(--border)] bg-white p-2.5"><div className="text-lg font-extrabold text-[var(--navy)]">{g.visits}</div><div className="text-[10.5px] text-[var(--muted)]">زيارة</div></div>
            <div className="rounded-2xl border border-[var(--border)] bg-white p-2.5"><div className={`text-lg font-extrabold ${g.overdue ? "text-red-600" : "text-[var(--navy)]"}`}>{g.overdue}</div><div className="text-[10.5px] text-[var(--muted)]">طبيب متأخر</div></div>
          </div>

          {!data ? <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="es-shimmer h-14 rounded-2xl" />)}</div>
            : !a ? <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-white p-5 text-center text-sm text-[var(--muted)]">العيادة دي مش مربوطة بعميل في دفترة، فمش ظاهر مشترياتها ولا مديونيتها.
              {canLink && <Link href="/daftra-sales?tab=ar#branches" className="mt-2 block text-xs font-bold text-[var(--sky-deep)] hover:underline">اربطها من صفحة دفترة ‹</Link>}</div>
            : <>
              {a.branches && a.branches.length > 0 && <div className="rounded-2xl border border-teal-200 bg-teal-50 p-3 text-xs leading-6 text-teal-900">🏢 الحساب ده مشترك مع {a.branches.length} {a.branches.length === 1 ? "فرع تاني" : "فروع تانية"}: <b dir="auto">{a.branches.join("، ")}</b> — المديونية والمشتريات للشركة كلها، مش للفرع ده بس.</div>}
              {a.balance.overdue > 0 ? <div className="es-pop rounded-2xl bg-red-50 p-3.5 text-[13px] leading-6 text-red-900 ring-1 ring-red-200"><b>قبل أي طلب جديد:</b> عليها <b>{sar(a.balance.overdue)}</b> متأخرة{a.balance.oldest && a.balance.oldest > 0 ? ` من ${a.balance.oldest} يوم` : ""} (إجمالي المستحق {sar(a.balance.unpaid)}).</div>
                : a.balance.unpaid > 0 ? <div className="rounded-2xl bg-sky-50 p-3.5 text-[13px] text-sky-900 ring-1 ring-sky-200">عليها {sar(a.balance.unpaid)} لسه ما جاش ميعادها — مفيش متأخرات.</div>
                : <div className="rounded-2xl bg-emerald-50 p-3.5 text-[13px] text-emerald-900 ring-1 ring-emerald-200">✓ مفيش عليها أي مستحقات</div>}
              <div className="grid grid-cols-2 gap-2">
                <AccTile l="المستحق عليها" v={a.balance.unpaid ? sar(a.balance.unpaid) : "مفيش"} s={a.balance.open_count ? `${a.balance.open_count} فاتورة مفتوحة` : undefined} tone={a.balance.overdue > 0 ? "bad" : undefined} />
                <AccTile l="آخر طلب" v={a.orders.last ? fmtD(a.orders.last) : "—"} s={a.orders.days_since !== null ? `من ${a.orders.days_since} يوم` : undefined} tone={a.status === "stopped" ? "bad" : undefined} />
                <AccTile l="بتطلب كل" v={a.orders.usual_gap ? `${a.orders.usual_gap} يوم` : "—"} s={a.orders.next_expected ? `الطلب الجاي المتوقع ${fmtD(a.orders.next_expected)}` : `${a.orders.count} طلب`} />
                <AccTile l="آخر 3 شهور" v={sar(a.sales.last90)} s={a.sales.change !== null ? `${a.sales.change > 0 ? "+" : ""}${a.sales.change}% عن اللي قبلها` : `متوسط الشهر ${sar(a.sales.monthly_avg)}`} tone={a.sales.change !== null ? (a.sales.change < -30 ? "bad" : a.sales.change > 0 ? "good" : undefined) : undefined} />
              </div>
              {a.products.length > 0 && <div className="rounded-2xl border border-[var(--border)] bg-white p-3.5">
                <div className="mb-2.5 text-sm font-extrabold text-[var(--navy)]">بتشتري إيه <span className="text-[11px] font-normal text-[var(--muted)]">(آخر 12 شهر، قبل الضريبة)</span></div>
                <ul className="space-y-2.5">{a.products.slice(0, 8).map(p => <li key={p.item}>
                  <div className="flex items-baseline justify-between gap-2 text-xs"><span className="min-w-0 truncate font-bold" dir="auto">{p.item}</span><b className="shrink-0 text-[var(--navy)]">{sar(p.net)}</b></div>
                  <div className="mt-1 flex items-center gap-2 text-[10.5px] text-[var(--muted)]"><span className="shrink-0">{p.qty.toLocaleString("en-US")} قطعة · {p.orders} طلب · آخر مرة {fmtD(p.last)}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg)]"><span className="es-grow block h-full rounded-full bg-teal-500" style={{ width: `${Math.max(4, p.net / maxNet * 100)}%` }} /></span></div>
                </li>)}</ul>
              </div>}
              {a.balance.open.length > 0 && <div className="rounded-2xl border border-[var(--border)] bg-white">
                <button type="button" onClick={() => setInv(x => !x)} aria-expanded={inv} className="flex w-full items-center justify-between p-3.5 text-sm font-extrabold text-[var(--navy)]">الفواتير المفتوحة ({a.balance.open_count})<span className={`transition ${inv ? "rotate-180" : ""}`}>⌄</span></button>
                {inv && <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)] text-xs">{a.balance.open.map(i => <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                  <span><b>#{i.no}</b> <span className="text-[var(--muted)]">· {fmtD(i.date)} · استحقاق {fmtD(i.due)}</span></span>
                  <span className="font-bold">{sar(i.unpaid)}{i.days > 0 ? <span className="mr-1.5 rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] text-red-700">متأخرة {i.days} يوم</span> : null}</span></li>)}</ul>}
              </div>}
            </>}

          <div>
            <div className="mb-2 text-sm font-extrabold text-[var(--navy)]">أطباء العيادة <span className="text-[11px] font-normal text-[var(--muted)]">({g.ds.length})</span></div>
            <div className="space-y-1.5">{docs.map(d => <button key={d.id} type="button" onClick={() => onDoctor(d)} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-2.5 text-right transition hover:border-teal-400">
              <ClassBadge c={d.classification} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-[var(--navy)]" dir="auto">{d.name}</span><span className="mt-0.5 block"><HealthPill d={d} /></span></span>
              <span className="text-[var(--muted)]">‹</span></button>)}</div>
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--border)] bg-white p-3"><button type="button" onClick={onFilter} className="min-h-12 w-full rounded-2xl bg-[var(--navy)] text-sm font-bold text-white shadow-md transition hover:opacity-95">اعرض أطباءها في القايمة</button></div>
      </section>
      <style>{`.es-sheet-up{animation:esUp .32s cubic-bezier(.2,.8,.2,1)}.es-drawer-in{animation:esIn .32s cubic-bezier(.2,.8,.2,1)}.es-grow{animation:esGrow .9s ease-out}
        @keyframes esUp{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}@keyframes esIn{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}@keyframes esGrow{from{width:0}}`}</style>
    </div>, document.body);
}
function AccTile({ l, v, s, tone }: { l: string; v: string; s?: string; tone?: "bad" | "good" }) {
  return <div className="rounded-2xl border border-[var(--border)] bg-white p-3"><div className="text-[10.5px] text-[var(--muted)]">{l}</div>
    <div className={`mt-1 text-base font-extrabold ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-700" : "text-[var(--navy)]"}`}>{v}</div>{s && <div className="mt-0.5 text-[10.5px] text-[var(--muted)]">{s}</div>}</div>;
}

const InsightKpi = ({ l, v, s, c = "" }: { l: string; v: string | number; s?: string; c?: string }) => <div className="rounded-2xl border border-[var(--border)] bg-white p-4"><div className="text-xs text-[var(--muted)]">{l}</div><div className={`text-2xl font-extrabold text-[var(--navy)] mt-1 ${c}`}>{v}</div>{s && <div className="text-[11px] text-[var(--muted)]">{s}</div>}</div>;
const InsightList = ({ title, list, metric, empty, onOpen }: { title: string; list: HubDoctor[]; metric: (d: HubDoctor) => string; empty: string; onOpen: (d: HubDoctor) => void }) => (
    <div className="rounded-3xl border border-[var(--border)] bg-white p-4"><div className="font-bold mb-2">{title}</div>
      {list.length ? <div className="divide-y divide-[var(--border)]">{list.map((d, i) => <button key={d.id} onClick={() => onOpen(d)} className="w-full flex items-center gap-2 py-2 text-right hover:bg-[var(--bg)] rounded-lg px-1"><span className="w-5 text-xs text-[var(--muted)]">{i + 1}</span><ClassBadge c={d.classification} /><div className="min-w-0 flex-1"><div className="text-sm font-bold truncate">{d.name}</div><div className="text-[11px] text-[var(--muted)] truncate">{d.clinic_name}</div></div><span className="text-sm font-extrabold whitespace-nowrap">{metric(d)}</span></button>)}</div> : <div className="text-sm text-[var(--muted)] py-4 text-center">{empty}</div>}
    </div>);

function Insights({ rows, days, onSeg, onOpen }: { rows: HubDoctor[]; days: number; onSeg: (s: Seg, cls?: string) => void; onOpen: (d: HubDoctor) => void }) {
  const covered = rows.filter(d => d.visits > 0).length;
  const pres = rows.reduce((a, d) => a + d.presented, 0), intr = rows.reduce((a, d) => a + d.interested, 0);
  const byClass = ["A", "B", "C"].map(c => { const xs = rows.filter(d => d.classification === c); return { c, total: xs.length, covered: xs.filter(d => d.visits > 0).length, onTime: xs.filter(d => health(d) === "ok" || health(d) === "soon").length, overdue: xs.filter(d => health(d) === "overdue" || health(d) === "never").length }; });
  const byCity = [...new Set(rows.map(d => d.city || "غير محدد"))].map(c => { const xs = rows.filter(d => (d.city || "غير محدد") === c); return { c, total: xs.length, covered: xs.filter(d => d.visits > 0).length, visits: xs.reduce((a, d) => a + d.visits, 0) }; }).sort((a, b) => b.total - a.total);
  const top = [...rows].filter(d => d.visits).sort((a, b) => b.visits - a.visits).slice(0, 8);
  const hot = [...rows].filter(d => d.presented >= 2).sort((a, b) => (interestPct(b) ?? 0) - (interestPct(a) ?? 0) || b.presented - a.presented).slice(0, 8);
  const cold = [...rows].filter(d => d.classification !== "C" && (health(d) === "overdue" || health(d) === "never")).sort((a, b) => (a.classification || "").localeCompare(b.classification || "") || (b.days_since ?? 9999) - (a.days_since ?? 9999)).slice(0, 8);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <InsightKpi l="الأطباء" v={rows.length} /><InsightKpi l={`اتزاروا في ${days} يوم`} v={`${covered}`} s={`${rows.length ? Math.round((covered / rows.length) * 100) : 0}% تغطية`} />
        <InsightKpi l="متأخرين عن ميعادهم" v={rows.filter(d => health(d) === "overdue").length} c="text-red-700" /><InsightKpi l="لسه ما اتزاروش" v={rows.filter(d => health(d) === "never").length} />
        <InsightKpi l="نسبة الاهتمام" v={pres ? `${Math.round((intr / pres) * 100)}%` : "—"} s={`${pres} مرة شرح`} />
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="rounded-3xl border border-[var(--border)] bg-white p-4"><div className="font-bold mb-3">التغطية حسب الفئة</div>
          <div className="space-y-3">{byClass.map(x => <button key={x.c} onClick={() => onSeg("overdue", x.c)} className="w-full text-right group">
            <div className="flex items-center justify-between text-sm mb-1"><span className="font-bold">فئة {x.c} <span className="text-[var(--muted)] font-normal">({x.total})</span></span><span className="text-xs"><span className="text-emerald-700 font-bold">{x.onTime} في الميعاد</span> · <span className="text-red-700 font-bold group-hover:underline">{x.overdue} محتاجين زيارة</span></span></div>
            <div className="flex h-3 rounded-full overflow-hidden bg-[var(--bg)]"><i className="bg-emerald-500" style={{ width: `${x.total ? (x.onTime / x.total) * 100 : 0}%` }} /><i className="bg-red-400" style={{ width: `${x.total ? (x.overdue / x.total) * 100 : 0}%` }} /></div>
          </button>)}</div>
        </div>
        <div className="rounded-3xl border border-[var(--border)] bg-white p-4"><div className="font-bold mb-3">حسب المدينة</div>
          <table className="w-full text-sm"><thead className="text-xs text-[var(--muted)]"><tr><th className="text-right pb-2">المدينة</th><th className="pb-2">أطباء</th><th className="pb-2">اتزاروا</th><th className="pb-2">زيارات</th><th className="pb-2 w-28">تغطية</th></tr></thead>
            <tbody>{byCity.map(x => { const p = x.total ? Math.round((x.covered / x.total) * 100) : 0; return <tr key={x.c} className="border-t border-[var(--border)]"><td className="py-2 font-bold">{x.c}</td><td className="text-center">{x.total}</td><td className="text-center">{x.covered}</td><td className="text-center">{x.visits}</td><td><div className="h-2 rounded-full bg-[var(--bg)]"><div className="h-full rounded-full bg-[var(--navy)]" style={{ width: `${p}%` }} /></div></td></tr>; })}</tbody></table>
        </div>
      </div>
      <div className="grid lg:grid-cols-3 gap-3">
        <InsightList onOpen={onOpen} title="⚠ أطباء A و B محتاجين زيارة" list={cold} metric={d => d.days_since === null ? "ما اتزارش" : `${d.days_since} يوم`} empty="كله في الميعاد 👌" />
        <InsightList onOpen={onOpen} title="🔥 الأكثر اهتماماً" list={hot} metric={d => `${interestPct(d)}%`} empty="لسه مفيش شرح كفاية" />
        <InsightList onOpen={onOpen} title="🏆 الأكثر زيارة" list={top} metric={d => `${d.visits} زيارة`} empty="مفيش زيارات في الفترة" />
      </div>
    </div>
  );
}

function MyRequests() {
  const [rows, setRows] = useState<Array<{ id: string; kind: string; status: string; payload: { name?: string }; admin_note: string; created_at: string }> | null>(null);
  useEffect(() => { fetch("/api/doctor-requests", { cache: "no-store" }).then(r => r.json()).then(j => setRows(j.requests || [])).catch(() => setRows([])); }, []);
  const S: Record<string, [string, string]> = { pending: ["معلق عند الأدمن", "bg-amber-50 text-amber-800"], approved: ["اتوافق عليه", "bg-emerald-50 text-emerald-700"], rejected: ["مرفوض", "bg-red-50 text-red-700"] };
  if (!rows) return <div className="h-24 rounded-3xl bg-white animate-pulse" />;
  if (!rows.length) return <div className="rounded-3xl border border-dashed border-[var(--border-strong)] bg-white p-10 text-center text-[var(--muted)]">مفيش طلبات</div>;
  return <div className="space-y-2">{rows.map(r => <div key={r.id} className="rounded-2xl border border-[var(--border)] bg-white p-3 flex items-center gap-3"><div className="flex-1"><div className="font-bold">{r.kind === "create" ? "إضافة" : "تعديل"}: {r.payload?.name}</div><div className="text-xs text-[var(--muted)]">{fmtD(r.created_at)}{r.admin_note ? ` — ${r.admin_note}` : ""}</div></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${S[r.status]?.[1] || ""}`}>{S[r.status]?.[0] || r.status}</span></div>)}</div>;
}

function DoctorForm({ form, setForm, isAdmin, cities, clinics, onSave }: { form: { doc: HubDoctor | null; f: Form }; setForm: (x: { doc: HubDoctor | null; f: Form } | null) => void; isAdmin: boolean; cities: string[]; clinics: string[]; onSave: () => void }) {
  const set = (k: keyof Form, v: string) => setForm({ ...form, f: { ...form.f, [k]: v } });
  const fld = "w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm";
  const ok = form.f.name.trim().length >= 2;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-end sm:place-items-center" onClick={() => setForm(null)}>
      <div dir="rtl" onClick={e => e.stopPropagation()} className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 space-y-3">
        <div className="flex items-center justify-between"><div className="font-extrabold text-lg text-[var(--navy)]">{form.doc ? "تعديل طبيب" : "طبيب جديد"}</div><button onClick={() => setForm(null)} className="h-9 w-9 rounded-xl border border-[var(--border)]">✕</button></div>
        {!isAdmin && <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-900">الطلب هيروح للأدمن للموافقة قبل ما يتنفذ</div>}
        <label className="block"><span className="text-xs font-bold text-[var(--muted)]">اسم الطبيب *</span><input value={form.f.name} onChange={e => set("name", e.target.value)} className={fld} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="text-xs font-bold text-[var(--muted)]">العيادة</span><input list="hub-clinics" value={form.f.clinic_name} onChange={e => set("clinic_name", e.target.value)} className={fld} /><datalist id="hub-clinics">{clinics.map(c => <option key={c} value={c} />)}</datalist></label>
          <label className="block"><span className="text-xs font-bold text-[var(--muted)]">المدينة</span><input list="hub-cities" value={form.f.city} onChange={e => set("city", e.target.value)} className={fld} /><datalist id="hub-cities">{cities.map(c => <option key={c} value={c} />)}</datalist></label>
          <label className="block"><span className="text-xs font-bold text-[var(--muted)]">التخصص</span><input value={form.f.specialty} onChange={e => set("specialty", e.target.value)} className={fld} /></label>
          <div><span className="text-xs font-bold text-[var(--muted)]">الفئة</span><div className="grid grid-cols-3 gap-1">{["A", "B", "C"].map(c => <button key={c} type="button" onClick={() => set("classification", c)} className={`rounded-xl border py-2.5 text-sm font-bold ${form.f.classification === c ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "border-[var(--border)]"}`}>{c}</button>)}</div></div>
          <label className="block"><span className="text-xs font-bold text-[var(--muted)]">التليفون</span><input value={form.f.phone} onChange={e => set("phone", e.target.value)} className={fld} dir="ltr" /></label>
          <label className="block"><span className="text-xs font-bold text-[var(--muted)]">الإيميل</span><input value={form.f.email} onChange={e => set("email", e.target.value)} className={fld} dir="ltr" /></label>
        </div>
        <button onClick={onSave} disabled={!ok} className="w-full rounded-2xl bg-[var(--navy)] text-white py-3 font-bold disabled:opacity-40">{isAdmin ? "حفظ" : "إرسال الطلب"}</button>
      </div>
    </div>
  );
}
