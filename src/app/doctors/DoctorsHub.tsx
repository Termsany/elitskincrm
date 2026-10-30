"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import DoctorRequestsClient from "../admin/requests/DoctorRequestsClient";
import type { HubDoctor } from "@/lib/doctors-hub";

type Opt = { id: string; name: string };
type Tab = "doctors" | "clinics" | "insights" | "requests";
type Seg = "all" | "overdue" | "never" | "followup" | "interested" | "planned" | "favorites";
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

export default function DoctorsHub({ isAdmin, reps, initialQ = "", initialTab = "doctors" }: { isAdmin: boolean; reps: Opt[]; initialQ?: string; initialTab?: Tab }) {
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
    followup: all.filter(d => d.next_follow_up).length, interested: all.filter(d => (interestPct(d) ?? 0) >= 50).length, planned: all.filter(d => d.in_plan_next).length, favorites: all.filter(d => fav.includes(d.id)).length,
  }), [all, fav]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const xs = all.filter(d => (!t || `${d.name} ${d.clinic_name} ${d.city} ${d.specialty} ${d.phone}`.toLowerCase().includes(t)) && (!city || d.city === city) && (!cls || d.classification === cls) && (!clinic || d.clinic_name === clinic)
      && (seg === "all" || (seg === "overdue" && health(d) === "overdue") || (seg === "never" && health(d) === "never") || (seg === "followup" && !!d.next_follow_up)
        || (seg === "interested" && (interestPct(d) ?? 0) >= 50) || (seg === "planned" && !!d.in_plan_next) || (seg === "favorites" && fav.includes(d.id))));
    const pri = (d: HubDoctor) => { const h = health(d); const c = d.classification === "A" ? 0 : d.classification === "B" ? 1 : 2; return (h === "overdue" ? 0 : h === "never" ? 1 : h === "soon" ? 2 : 3) * 10 + c; };
    const val = (d: HubDoctor): number | string => sort.k === "priority" ? pri(d) * 10000 - (d.days_since ?? 9999) : sort.k === "name" ? d.name : sort.k === "visits" ? d.visits : sort.k === "interest" ? (interestPct(d) ?? -1) : sort.k === "last" ? (d.days_since ?? 99999) : sort.k === "samples" ? d.samples : d.name;
    return [...xs].sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir; });
  }, [all, q, city, cls, clinic, seg, fav, sort]);

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

  const SEGS: Array<[Seg, string, string]> = [["all", "الكل", ""], ["overdue", "متأخرين", "text-red-700"], ["never", "ما اتزاروش", ""], ["followup", "متابعات", "text-amber-700"], ["interested", "مهتمين", "text-emerald-700"], ["planned", "في الخطة", ""], ["favorites", "★ المفضلة", ""]];
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
        {checked.length > 0 && <BulkBar n={checked.length} onPlan={d => void addToPlan(checked, d)} exportHref={exportUrl(checked)} onClear={() => setChecked([])} needRep={isAdmin && !repId} />}
        {effView === "table" ? <Table list={list} checked={checked} setChecked={setChecked} fav={fav} toggleFav={toggleFav} onOpen={setSel} sort={sort} setSort={setSort} />
          : <div className={`grid gap-3 ${mode === "phone" ? "" : "sm:grid-cols-2 xl:grid-cols-3"}`}>{list.map(d => <DocCard key={d.id} d={d} fav={fav.includes(d.id)} toggleFav={() => toggleFav(d.id)} onOpen={() => setSel(d)} isAdmin={isAdmin} />)}</div>}
        {!list.length && <div className="rounded-3xl border border-dashed border-[var(--border-strong)] bg-white p-10 text-center text-[var(--muted)]">لا يوجد أطباء مطابقين</div>}
      </>}
      {rows && tab === "clinics" && <Clinics rows={all.filter(d => (!city || d.city === city) && (!cls || d.classification === cls) && (!q.trim() || `${d.clinic_name} ${d.city}`.toLowerCase().includes(q.trim().toLowerCase())))} onPick={c => { setClinic(c); setTab("doctors"); setSeg("all"); }} />}
      {rows && tab === "insights" && <Insights rows={all} days={days} onSeg={(s, c) => { setSeg(s); if (c !== undefined) setCls(c); setTab("doctors"); }} onOpen={setSel} />}
      {tab === "requests" && (isAdmin ? <div className="rounded-3xl border border-[var(--border)] bg-white p-3"><DoctorRequestsClient /></div> : <MyRequests />)}

      {sel && <QuickView d={sel} isAdmin={isAdmin} onClose={() => setSel(null)} onPlan={date => { void addToPlan([sel.id], date); setSel(null); }} onEdit={() => { openForm(sel); setSel(null); }} fav={fav.includes(sel.id)} toggleFav={() => toggleFav(sel.id)} sheet={mode === "phone"} />}
      {form && <DoctorForm form={form} setForm={setForm} isAdmin={isAdmin} cities={cities} clinics={clinics} onSave={() => void saveForm()} />}
    </div>
  );
}

// ───────────── pieces ─────────────
function HealthPill({ d }: { d: HubDoctor }) {
  const h = health(d); const m = H[h];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${m.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}{d.days_since !== null ? ` · ${d.days_since} يوم` : ""}</span>;
}
const ClassBadge = ({ c }: { c: string | null }) => <span className={`h-9 w-9 shrink-0 rounded-xl grid place-items-center text-sm font-extrabold ${c === "A" ? "bg-[var(--navy)] text-white" : c === "B" ? "bg-[var(--sky-soft)] text-[var(--navy)]" : "bg-slate-100 text-slate-600"}`}>{c || "—"}</span>;

function DocCard({ d, fav, toggleFav, onOpen, isAdmin }: { d: HubDoctor; fav: boolean; toggleFav: () => void; onOpen: () => void; isAdmin: boolean }) {
  const ip = interestPct(d); const phone = (d.phone || "").replace(/\s/g, "");
  return (
    <div className="rounded-3xl border border-[var(--border)] bg-white overflow-hidden hover:shadow-md transition">
      <button onClick={onOpen} className="w-full text-right p-3.5 flex gap-3">
        <ClassBadge c={d.classification} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1"><div className="font-extrabold text-[var(--navy)] truncate flex-1">{d.name}</div></div>
          <div className="text-xs text-[var(--muted)] truncate">{[d.specialty, d.clinic_name, d.city].filter(Boolean).join(" · ")}</div>
          <div className="flex flex-wrap gap-1 mt-1.5"><HealthPill d={d} />{d.next_follow_up && <span className="rounded-full bg-amber-50 text-amber-800 px-2 py-0.5 text-[11px] font-bold">↻ {fmtD(d.next_follow_up)}</span>}{d.in_plan_next && <span className="rounded-full bg-[var(--sky-soft)] text-[var(--navy)] px-2 py-0.5 text-[11px] font-bold">🗓 {fmtD(d.in_plan_next)}</span>}</div>
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
            <tr key={d.id} onClick={() => onOpen(d)} className={`border-t border-[var(--border)] cursor-pointer hover:bg-[var(--sky-light)] ${checked.includes(d.id) ? "bg-[var(--sky-light)]" : ""}`}>
              <td className="p-3" onClick={e => e.stopPropagation()}><input type="checkbox" checked={checked.includes(d.id)} onChange={() => setChecked(x => x.includes(d.id) ? x.filter(y => y !== d.id) : [...x, d.id])} /></td>
              <td className="p-3"><div className="flex items-center gap-2"><ClassBadge c={d.classification} /><div className="min-w-0"><div className="font-bold text-[var(--navy)]">{d.name}</div><div className="text-[11px] text-[var(--muted)]">{d.specialty || ""}</div></div></div></td>
              <td className="p-3 text-xs"><div>{d.clinic_name || "—"}</div><div className="text-[var(--muted)]">{d.city}</div></td>
              <td className="p-3"><HealthPill d={d} /></td>
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

function BulkBar({ n, onPlan, exportHref, onClear, needRep }: { n: number; onPlan: (d: string) => void; exportHref: string; onClear: () => void; needRep: boolean }) {
  const [d, setD] = useState(addDays(today(), 1));
  return (
    <div className="rounded-2xl bg-[var(--navy)] text-white p-3 flex flex-wrap items-center gap-2 sticky top-[7.5rem] z-10 shadow-lg">
      <span className="font-bold">{n} طبيب محدد</span>
      <div className="flex items-center gap-1.5 mr-auto">
        <span className="text-xs text-white/80">إضافة للخطة يوم</span>
        <input type="date" value={d} min={today()} onChange={e => setD(e.target.value)} className="rounded-lg text-[var(--ink)] px-2 py-1.5 text-sm" />
        <button onClick={() => onPlan(d)} disabled={needRep} title={needRep ? "اختار المندوب من فوق" : ""} className="rounded-lg bg-white text-[var(--navy)] px-3 py-1.5 text-sm font-bold disabled:opacity-40">إضافة</button>
        <a href={exportHref} className="rounded-lg border border-white/40 px-3 py-1.5 text-sm font-bold">Excel</a>
        <button onClick={onClear} className="rounded-lg px-2 text-white/80">✕</button>
      </div>
    </div>
  );
}

type Ctx = { history: Array<{ id: string; visited_at: string; status: string; notes: string; rep_name: string; presented: Array<{ product_id: string; name: string; reaction: string }> }>; followups: Array<{ due: string; note: string }>; plan: { product_name: string | null } | null };
const RX: Record<string, string> = { interested: "👍", neutral: "😐", not_interested: "👎" };
function QuickView({ d, isAdmin, onClose, onPlan, onEdit, fav, toggleFav, sheet }: { d: HubDoctor; isAdmin: boolean; onClose: () => void; onPlan: (date: string) => void; onEdit: () => void; fav: boolean; toggleFav: () => void; sheet: boolean }) {
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

function Clinics({ rows, onPick }: { rows: HubDoctor[]; onPick: (c: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, HubDoctor[]>();
    for (const d of rows) { const k = d.clinic_name || "بدون عيادة"; (m.get(k) || m.set(k, []).get(k)!).push(d); }
    return [...m.entries()].map(([name, ds]) => ({ name, city: ds[0].city, ds, visits: ds.reduce((a, d) => a + d.visits, 0), overdue: ds.filter(d => health(d) === "overdue").length, never: ds.filter(d => health(d) === "never").length,
      covered: ds.filter(d => d.visits > 0).length, a: ds.filter(d => d.classification === "A").length, last: ds.map(d => d.days_since).filter((x): x is number => x !== null).sort((a, b) => a - b)[0] ?? null }))
      .sort((a, b) => b.overdue + b.never - (a.overdue + a.never) || b.ds.length - a.ds.length);
  }, [rows]);
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {groups.map(g => { const cov = Math.round((g.covered / g.ds.length) * 100); return (
        <button key={g.name} onClick={() => onPick(g.name)} className="rounded-3xl border border-[var(--border)] bg-white p-4 text-right hover:shadow-md transition">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-2xl bg-[var(--sky-soft)] grid place-items-center text-xl">🏥</div>
            <div className="min-w-0 flex-1"><div className="font-extrabold text-[var(--navy)] truncate">{g.name}</div><div className="text-xs text-[var(--muted)]">{g.city || "—"} · {g.ds.length} طبيب{g.a ? ` · ${g.a} فئة A` : ""}</div></div>
          </div>
          <div className="mt-3"><div className="flex justify-between text-xs mb-1"><span className="text-[var(--muted)]">التغطية في الفترة</span><b>{g.covered}/{g.ds.length}</b></div><div className="h-2 rounded-full bg-[var(--bg)]"><div className={`h-full rounded-full ${cov >= 70 ? "bg-emerald-500" : cov >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${cov}%` }} /></div></div>
          <div className="flex flex-wrap gap-1.5 mt-3 text-[11px] font-bold">
            <span className="rounded-full bg-[var(--bg)] px-2 py-0.5">{g.visits} زيارة</span>
            {g.overdue > 0 && <span className="rounded-full bg-red-50 text-red-700 px-2 py-0.5">{g.overdue} متأخر</span>}
            {g.never > 0 && <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5">{g.never} ما اتزاروش</span>}
            <span className="rounded-full bg-[var(--bg)] px-2 py-0.5">آخر زيارة: {g.last === null ? "—" : g.last === 0 ? "النهارده" : `من ${g.last} يوم`}</span>
          </div>
        </button>); })}
    </div>
  );
}

function Insights({ rows, days, onSeg, onOpen }: { rows: HubDoctor[]; days: number; onSeg: (s: Seg, cls?: string) => void; onOpen: (d: HubDoctor) => void }) {
  const covered = rows.filter(d => d.visits > 0).length;
  const pres = rows.reduce((a, d) => a + d.presented, 0), intr = rows.reduce((a, d) => a + d.interested, 0);
  const byClass = ["A", "B", "C"].map(c => { const xs = rows.filter(d => d.classification === c); return { c, total: xs.length, covered: xs.filter(d => d.visits > 0).length, onTime: xs.filter(d => health(d) === "ok" || health(d) === "soon").length, overdue: xs.filter(d => health(d) === "overdue" || health(d) === "never").length }; });
  const byCity = [...new Set(rows.map(d => d.city || "غير محدد"))].map(c => { const xs = rows.filter(d => (d.city || "غير محدد") === c); return { c, total: xs.length, covered: xs.filter(d => d.visits > 0).length, visits: xs.reduce((a, d) => a + d.visits, 0) }; }).sort((a, b) => b.total - a.total);
  const top = [...rows].filter(d => d.visits).sort((a, b) => b.visits - a.visits).slice(0, 8);
  const hot = [...rows].filter(d => d.presented >= 2).sort((a, b) => (interestPct(b) ?? 0) - (interestPct(a) ?? 0) || b.presented - a.presented).slice(0, 8);
  const cold = [...rows].filter(d => d.classification !== "C" && (health(d) === "overdue" || health(d) === "never")).sort((a, b) => (a.classification || "").localeCompare(b.classification || "") || (b.days_since ?? 9999) - (a.days_since ?? 9999)).slice(0, 8);
  const K = ({ l, v, s, c = "" }: { l: string; v: string | number; s?: string; c?: string }) => <div className="rounded-2xl border border-[var(--border)] bg-white p-4"><div className="text-xs text-[var(--muted)]">{l}</div><div className={`text-2xl font-extrabold text-[var(--navy)] mt-1 ${c}`}>{v}</div>{s && <div className="text-[11px] text-[var(--muted)]">{s}</div>}</div>;
  const Mini = ({ title, list, metric, empty }: { title: string; list: HubDoctor[]; metric: (d: HubDoctor) => string; empty: string }) => (
    <div className="rounded-3xl border border-[var(--border)] bg-white p-4"><div className="font-bold mb-2">{title}</div>
      {list.length ? <div className="divide-y divide-[var(--border)]">{list.map((d, i) => <button key={d.id} onClick={() => onOpen(d)} className="w-full flex items-center gap-2 py-2 text-right hover:bg-[var(--bg)] rounded-lg px-1"><span className="w-5 text-xs text-[var(--muted)]">{i + 1}</span><ClassBadge c={d.classification} /><div className="min-w-0 flex-1"><div className="text-sm font-bold truncate">{d.name}</div><div className="text-[11px] text-[var(--muted)] truncate">{d.clinic_name}</div></div><span className="text-sm font-extrabold whitespace-nowrap">{metric(d)}</span></button>)}</div> : <div className="text-sm text-[var(--muted)] py-4 text-center">{empty}</div>}
    </div>);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <K l="الأطباء" v={rows.length} /><K l={`اتزاروا في ${days} يوم`} v={`${covered}`} s={`${rows.length ? Math.round((covered / rows.length) * 100) : 0}% تغطية`} />
        <K l="متأخرين عن ميعادهم" v={rows.filter(d => health(d) === "overdue").length} c="text-red-700" /><K l="لسه ما اتزاروش" v={rows.filter(d => health(d) === "never").length} />
        <K l="نسبة الاهتمام" v={pres ? `${Math.round((intr / pres) * 100)}%` : "—"} s={`${pres} مرة شرح`} />
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
        <Mini title="⚠ أطباء A و B محتاجين زيارة" list={cold} metric={d => d.days_since === null ? "ما اتزارش" : `${d.days_since} يوم`} empty="كله في الميعاد 👌" />
        <Mini title="🔥 الأكثر اهتماماً" list={hot} metric={d => `${interestPct(d)}%`} empty="لسه مفيش شرح كفاية" />
        <Mini title="🏆 الأكثر زيارة" list={top} metric={d => `${d.visits} زيارة`} empty="مفيش زيارات في الفترة" />
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
