"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import VisitPanel from "./VisitPanel";
import { BAND, REACT, Ring, DayStrip, Bars, fd, ago, secs, L } from "./viz";

type Tab = "today" | "visits" | "insights" | "reports";
type Opt = { id: string; name: string };
type V = { id: string; visited_at: string; day: string; hm: string; status: string; notes: string; rep_id: string; rep_name: string; doctor_id: string; doctor_name: string; clinic_name: string; city: string; classification: string | null; presented: Array<{ product_id: string; name: string; reaction: string }>; samples: number; orders: number; detail_sec: number; planned: boolean; rating: number | null; score: number | null; band: string | null; flags: Array<{ code: string; label: string; tone: string }>; burst_size: number; burst_clinics: number; distance_m: number | null; follow_up_at: string | null; attachments: number };
type Sum = { kpi: Record<string, number>; bands: Record<string, number>; reps: Array<Record<string, any>>; products: Array<Record<string, any>>; days: Array<{ day: string; visits: number; avgQuality: number }>; classes: Record<string, number> };
type Board = { date: string; summary: Record<string, number>; planned: number; done: number; board: Array<{ rep_id: string; rep_name: string; state: string; planned: number; done: number; visits: number; sinceMin: number | null; first: string | null; last: string | null; avgQuality: number | null; redFlags: number; timeline: any[]; plan: Array<{ doctor_name: string; done: boolean; classification: string }> }> };

const card = "rounded-3xl border border-[var(--border)] bg-white";
const btn = "inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition active:scale-[.98] disabled:opacity-50";
const ghost = `${btn} border border-[var(--border)] bg-white hover:bg-[var(--bg)]`;
const primary = `${btn} bg-[var(--navy)] text-white hover:opacity-95`;
const field = "h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--sky)]";
const PERIODS: Array<[string, string]> = [["today", "النهارده"], ["yesterday", "امبارح"], ["week", "الأسبوع ده"], ["month", "الشهر ده"], ["30d", "آخر 30 يوم"], ["custom", "فترة مخصصة"]];
const STATE: Record<string, { label: string; dot: string; chip: string }> = {
  active: { label: "شغال", dot: "bg-emerald-500 animate-pulse", chip: "bg-emerald-50 text-emerald-800" },
  paused: { label: "متوقف من فترة", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-800" },
  done: { label: "خلّص خطته ✓", dot: "bg-sky-500", chip: "bg-sky-50 text-sky-800" },
  idle: { label: "مسجلش النهارده", dot: "bg-slate-300", chip: "bg-slate-100 text-slate-600" },
};
const FLAGS: Array<[string, string]> = [["any", "🚩 أي تنبيه مهم"], ["burst", "تسجيل جماعي"], ["rapid", "تسجيل متتابع سريع"], ["far", "بعيد عن العيادة"], ["no_gps", "من غير موقع"], ["no_notes", "من غير ملاحظات"], ["no_products", "من غير منتجات"]];

function useDevice() { const [w, setW] = useState(1400); useEffect(() => { const f = () => setW(window.innerWidth); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []); return w < 768 ? "phone" : w < 1280 ? "tablet" : "desktop"; }
const initials = (n: string) => n.split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase();

export default function VisitsHub({ reps, products, initialTab, initialVisit, initialRepId, initialDay }: { reps: Opt[]; products: Opt[]; initialTab?: string; initialVisit?: string; initialRepId?: string; initialDay?: string }) {
  const toast = useToast(); const device = useDevice();
  const [tab, setTab] = useState<Tab>((["today", "visits", "insights", "reports"].includes(initialTab || "") ? initialTab : initialRepId || initialVisit ? "visits" : "today") as Tab);
  const [sel, setSel] = useState<string | null>(initialVisit || null);
  // today
  const [board, setBoard] = useState<Board | null>(null);
  const loadToday = useCallback(async () => { const j = await fetch("/api/admin/visits/today", { cache: "no-store" }).then(r => r.json()).catch(() => null); if (j?.board) setBoard(j); }, []);
  useEffect(() => { void loadToday(); const t = setInterval(() => { if (document.visibilityState === "visible") void loadToday(); }, 60000); return () => clearInterval(t); }, [loadToday]);
  // visits explorer
  const [period, setPeriod] = useState(initialDay ? "custom" : "week"); const [from, setFrom] = useState(initialDay || ""); const [to, setTo] = useState(initialDay || "");
  const [repId, setRepId] = useState(initialRepId || ""); const [q, setQ] = useState(""); const [qLive, setQLive] = useState("");
  const [f, setF] = useState<Record<string, string>>({ cls: "", productId: "", reaction: "", planned: "", band: "", flag: "" });
  const [more, setMore] = useState(false); const [view, setView] = useState<"list" | "day">(initialDay && initialRepId ? "day" : "list");
  const [data, setData] = useState<{ from: string; to: string; visits: V[]; summary: Sum; overall: Record<string, number>; adherence: Array<{ rep_id: string; planned: number; done: number }> } | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qs = useMemo(() => { const p = new URLSearchParams({ period }); if (period === "custom" && from && to) { p.set("from", from); p.set("to", to); } if (repId) p.set("repId", repId); if (qLive) p.set("q", qLive); for (const [k, v] of Object.entries(f)) if (v) p.set(k, v); return p.toString(); }, [period, from, to, repId, qLive, f]);
  const load = useCallback(async () => { if (period === "custom" && (!from || !to)) return; setLoading(true); try { const j = await fetch(`/api/admin/visits/intel?${qs}`, { cache: "no-store" }).then(r => r.json()); if (j?.visits) setData(j); } catch { toast("تعذر التحميل", "error"); } finally { setLoading(false); } }, [qs]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "visits" || tab === "insights") void load(); }, [load, tab]);
  useEffect(() => { document.body.style.overflow = sel && device !== "desktop" ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [sel, device]);
  const activeFilters = Object.entries(f).filter(([, v]) => v);
  const dayVisits = useMemo(() => (data?.visits || []).filter(v => v.status !== "cancelled").sort((a, b) => a.visited_at < b.visited_at ? -1 : 1), [data]);
  const goRepDay = (rid: string, day: string) => { setRepId(rid); setPeriod("custom"); setFrom(day); setTo(day); setView("day"); setTab("visits"); };
  // reports
  const [rp, setRp] = useState("week"); const [rf, setRf] = useState(""); const [rt, setRt] = useState(""); const [rRep, setRRep] = useState(""); const [rBusy, setRBusy] = useState(""); const [saved, setSaved] = useState<any[]>([]);
  const rQs = () => { const p = new URLSearchParams({ period: rp }); if (rp === "custom") { p.set("from", rf); p.set("to", rt); } if (rRep) p.set("repId", rRep); return p.toString(); };
  const loadSaved = useCallback(async () => { const j = await fetch(`/api/library?folder=${encodeURIComponent("تقارير الزيارات")}`, { cache: "no-store" }).then(r => r.json()).catch(() => null); if (j?.files) setSaved(j.files.slice(0, 8)); }, []);
  useEffect(() => { if (tab === "reports") void loadSaved(); }, [tab, loadSaved]);

  /* ───── visit row ───── */
  const row = (v: V) => { const red = v.flags.filter(x => x.tone === "red"); const on = sel === v.id; return <button key={v.id} onClick={() => setSel(v.id)} className={`group flex w-full items-center gap-3 rounded-2xl border bg-white p-3 text-right transition hover:-translate-y-0.5 hover:shadow-md ${on ? "border-[var(--navy)] ring-2 ring-[var(--navy)]/10" : red.length ? "border-red-200" : "border-[var(--border)]"} ${v.status === "cancelled" ? "opacity-60" : ""}`}>
    <Ring value={v.score} band={v.band} size={46} />
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5"><span className="truncate font-extrabold text-[var(--navy)]">{v.doctor_name}</span>{v.classification && <span className="shrink-0 rounded bg-[var(--bg)] px-1 text-[10px] font-bold">{v.classification}</span>}{v.rating ? <span className="shrink-0 text-[11px] text-amber-500">{"★".repeat(v.rating)}</span> : null}</div>
      <div className="truncate text-[11px] text-[var(--muted)]">{v.clinic_name}{v.city ? ` · ${v.city}` : ""} · <b className="text-[var(--ink)]">{v.rep_name}</b></div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {v.status === "cancelled" ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold">ملغاة</span> : <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${v.planned ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{v.planned ? "في الخطة" : "خارج الخطة"}</span>}
        {v.presented.slice(0, device === "phone" ? 2 : 4).map(p => <span key={p.product_id} className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${REACT[p.reaction]?.tone || "border-[var(--border)]"}`}>{REACT[p.reaction]?.icon} {p.name}</span>)}
        {v.detail_sec > 0 && <span className="rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">📖 {secs(v.detail_sec)}</span>}
        {v.samples > 0 && <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">🧪 {v.samples}</span>}
        {red.map(x => <span key={x.code} className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">🚩 {x.code === "burst" ? "تسجيل جماعي" : "بعيد عن العيادة"}</span>)}
      </div>
    </div>
    <div className="shrink-0 text-left"><div className="font-mono text-sm font-bold">{v.hm}</div><div className="text-[10px] text-[var(--muted)]">{fd(v.day)}</div></div>
  </button>; };

  /* ───── today ───── */
  const today = <div className="space-y-3">
    {!board ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-52 animate-pulse rounded-3xl bg-white" />)}</div> : <>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {[["زيارات النهارده", board.summary.visits, `${board.summary.doctors} طبيب`], ["من الخطة", board.planned ? `${board.done}/${board.planned}` : "—", board.planned ? `${Math.round(board.done / board.planned * 100)}% التزام` : "مفيش خطط معتمدة"], ["متوسط الجودة", board.summary.avgQuality || "—", "من 100"], ["مناديب شغالين", board.board.filter(b => b.state === "active").length, `من ${board.board.length}`], ["تنبيهات مهمة", board.summary.redFlags, board.summary.redFlags ? "محتاجة نظرة" : "كله تمام ✓"]].map(([l, v, s], i) =>
          <div key={i} className={`${card} rounded-2xl p-3.5 ${i === 4 && Number(v) > 0 ? "border-red-200 bg-red-50/50" : ""} ${i === 0 ? "col-span-2 lg:col-span-1" : ""}`}><div className="text-xs text-[var(--muted)]">{l}</div><div className={`mt-1 text-2xl font-extrabold ${i === 4 && Number(v) > 0 ? "text-red-700" : "text-[var(--navy)]"}`}>{v}</div><div className="text-[11px] text-[var(--muted)]">{s}</div></div>)}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {board.board.filter(b => b.state !== "idle" || b.planned > 0).map(b => { const st = STATE[b.state]; const pct = b.planned ? Math.round(b.done / b.planned * 100) : null; return <div key={b.rep_id} className={`${card} group p-4 transition hover:shadow-lg`}>
          <div className="flex items-start gap-3">
            <div className="relative"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--navy)] to-[#1f7a7f] text-sm font-extrabold text-white">{initials(b.rep_name)}</div><span className={`absolute -bottom-0.5 -left-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${st.dot}`} /></div>
            <div className="min-w-0 flex-1"><div className="truncate font-extrabold text-[var(--navy)]">{b.rep_name}</div><span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${st.chip}`}>{st.label}{b.state === "active" || b.state === "paused" ? ` · آخر زيارة ${ago(b.sinceMin)}` : ""}</span></div>
            {pct !== null ? <Ring value={pct} size={50} label="الخطة" /> : <Ring value={b.avgQuality} size={50} label="الجودة" />}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-xl bg-[var(--bg)] p-2"><div className="font-extrabold">{b.visits}</div><div className="text-[10px] text-[var(--muted)]">زيارة</div></div>
            <div className="rounded-xl bg-[var(--bg)] p-2"><div className="font-extrabold">{b.planned ? `${b.done}/${b.planned}` : "—"}</div><div className="text-[10px] text-[var(--muted)]">الخطة</div></div>
            <div className="rounded-xl bg-[var(--bg)] p-2"><div className={`font-extrabold ${b.avgQuality !== null ? (b.avgQuality >= 75 ? "text-emerald-700" : b.avgQuality >= 50 ? "text-amber-700" : "text-red-700") : ""}`}>{b.avgQuality ?? "—"}</div><div className="text-[10px] text-[var(--muted)]">جودة</div></div>
          </div>
          <div className="mt-3 px-1 pb-3"><DayStrip items={b.timeline.map(t => ({ ...t }))} onPick={id => setSel(id)} /></div>
          {b.plan.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{b.plan.slice(0, 8).map((p, i) => <span key={i} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.done ? "bg-emerald-50 text-emerald-700 line-through decoration-emerald-400" : "bg-[var(--bg)] text-[var(--muted)]"}`}>{p.done ? "✓ " : ""}{p.doctor_name}</span>)}{b.plan.length > 8 && <span className="text-[10px] text-[var(--muted)]">+{b.plan.length - 8}</span>}</div>}
          {b.redFlags > 0 && <div className="mt-2 rounded-xl bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-700">🚩 {b.redFlags} زيارة محتاجة مراجعة</div>}
          <div className="mt-3 flex gap-2"><button onClick={() => goRepDay(b.rep_id, board.date)} className={`${primary} flex-1 !py-1.5 text-xs`}>يومه بالتفصيل ‹</button>{b.first && <span className="self-center text-[10px] text-[var(--muted)]">{b.first} ← {b.last}</span>}</div>
        </div>; })}
      </div>
      {board.board.some(b => b.state === "idle" && !b.planned) && <div className={`${card} flex flex-wrap items-center gap-2 p-3`}><span className="text-xs font-bold text-[var(--muted)]">مسجلوش زيارات النهارده:</span>{board.board.filter(b => b.state === "idle" && !b.planned).map(b => <button key={b.rep_id} onClick={() => { setRepId(b.rep_id); setPeriod("week"); setView("day"); setTab("visits"); }} className="flex items-center gap-1.5 rounded-full bg-[var(--bg)] py-1 pl-3 pr-1 text-xs font-bold hover:bg-[var(--sky-light)]" title="آخر أيامه"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-300 text-[10px] text-white">{initials(b.rep_name)}</span>{b.rep_name}</button>)}</div>}
      <div className="text-center text-[11px] text-[var(--muted)]">بيتحدّث تلقائيًا كل دقيقة · {new Date().toLocaleTimeString(L, { hour: "numeric", minute: "2-digit" })}</div>
    </>}
  </div>;

  /* ───── filters ───── */
  const filterBar = <div className={`${card} space-y-2 p-2.5 shadow-sm`}>
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex max-w-full overflow-x-auto rounded-xl bg-[var(--bg)] p-1">{PERIODS.map(([k, l]) => <button key={k} onClick={() => setPeriod(k)} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold ${period === k ? "bg-white text-[var(--navy)] shadow" : "text-[var(--muted)]"}`}>{l}</button>)}</div>
      {period === "custom" && <div className="flex items-center gap-1"><input type="date" value={from} onChange={e => setFrom(e.target.value)} className={field} /><span className="text-xs">→</span><input type="date" value={to} onChange={e => setTo(e.target.value)} className={field} /></div>}
      <select value={repId} onChange={e => setRepId(e.target.value)} className={field}><option value="">كل المناديب</option>{reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
      <input value={q} onChange={e => { setQ(e.target.value); if (timer.current) clearTimeout(timer.current); const x = e.target.value; timer.current = setTimeout(() => setQLive(x.trim()), 300); }} placeholder="🔎 طبيب، عيادة، مدينة، ملاحظة…" className={`${field} min-w-[160px] flex-1`} />
      <button onClick={() => setMore(m => !m)} className={`${ghost} !py-2 ${activeFilters.length ? "border-[var(--navy)] text-[var(--navy)]" : ""}`}>⚙︎ فلاتر{activeFilters.length ? ` (${activeFilters.length})` : ""}</button>
    </div>
    {more && <div className="grid gap-2 border-t border-[var(--border)] pt-2 sm:grid-cols-3 lg:grid-cols-6">
      <select value={f.flag} onChange={e => setF({ ...f, flag: e.target.value })} className={field}><option value="">كل التنبيهات</option>{FLAGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select value={f.band} onChange={e => setF({ ...f, band: e.target.value })} className={field}><option value="">كل مستويات الجودة</option><option value="excellent">ممتازة (75+)</option><option value="good">جيدة (50–74)</option><option value="weak">ضعيفة (&lt;50)</option></select>
      <select value={f.planned} onChange={e => setF({ ...f, planned: e.target.value })} className={field}><option value="">الخطة: الكل</option><option value="yes">في الخطة</option><option value="no">خارج الخطة</option></select>
      <select value={f.cls} onChange={e => setF({ ...f, cls: e.target.value })} className={field}><option value="">كل التصنيفات</option><option value="A">A</option><option value="B">B</option><option value="C">C</option></select>
      <select value={f.productId} onChange={e => setF({ ...f, productId: e.target.value })} className={field}><option value="">كل المنتجات</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select value={f.reaction} onChange={e => setF({ ...f, reaction: e.target.value })} className={field}><option value="">كل ردود الفعل</option>{Object.entries(REACT).map(([k, r]) => <option key={k} value={k}>{r.icon} {r.label}</option>)}</select>
    </div>}
    {activeFilters.length > 0 && <div className="flex flex-wrap gap-1.5">{activeFilters.map(([k, v]) => <button key={k} onClick={() => setF({ ...f, [k]: "" })} className="rounded-full bg-[var(--sky-light)] px-2.5 py-1 text-[11px] font-bold text-[var(--navy)]">{k === "flag" ? FLAGS.find(x => x[0] === v)?.[1] : k === "band" ? BAND[v]?.label : k === "planned" ? (v === "yes" ? "في الخطة" : "خارج الخطة") : k === "productId" ? products.find(p => p.id === v)?.name : k === "reaction" ? REACT[v]?.label : v} ×</button>)}<button onClick={() => setF({ cls: "", productId: "", reaction: "", planned: "", band: "", flag: "" })} className="text-[11px] font-bold text-[var(--muted)] underline">مسح الكل</button></div>}
  </div>;

  const k = data?.summary.kpi;
  const kpis = k && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
    {[["زيارات", k.visits, `${k.doctors} طبيب · ${k.clinics} عيادة`, ""], ["متوسط الجودة", k.avgQuality, `${data!.summary.bands.excellent} ممتازة · ${data!.summary.bands.weak} ضعيفة`, k.avgQuality >= 75 ? "text-emerald-700" : k.avgQuality >= 50 ? "text-amber-700" : "text-red-700"], ["في الخطة", `${k.plannedPct}%`, (() => { const a = data!.adherence.reduce((x, y) => ({ p: x.p + y.planned, d: x.d + y.done }), { p: 0, d: 0 }); return a.p ? `التزام ${a.d}/${a.p}` : "مفيش خطط معتمدة"; })(), ""], ["اهتمام بالمنتجات", `${k.positivePct}%`, `${k.presented} عرض · ${k.detailMin} د بروشور`, ""], ["عينات / طلبات", `${k.samples} / ${k.orders}`, `${k.followups} متابعة`, ""], ["تنبيهات مهمة", k.redFlags, `${k.bursts} جماعي · ${k.far} بعيد`, k.redFlags ? "text-red-700" : "text-emerald-700"]].map(([l, v, s, tone], i) =>
      <button key={i} onClick={() => i === 5 && setF({ ...f, flag: f.flag === "any" ? "" : "any" })} className={`${card} rounded-2xl p-3 text-right ${i === 5 ? "hover:border-red-200" : "cursor-default"}`}><div className="text-[11px] text-[var(--muted)]">{l}</div><div className={`mt-0.5 text-xl font-extrabold text-[var(--navy)] ${tone}`}>{v}</div><div className="truncate text-[10px] text-[var(--muted)]">{s}</div></button>)}
  </div>;

  /* ───── rep day timeline ───── */
  const dayView = (() => {
    if (!repId) return <div className={`${card} p-10 text-center`}><div className="text-4xl">🧭</div><div className="mt-2 font-extrabold text-[var(--navy)]">اختار مندوب عشان تشوف يومه</div><div className="mt-3 flex flex-wrap justify-center gap-2">{reps.map(r => <button key={r.id} onClick={() => setRepId(r.id)} className={ghost}>{r.name}</button>)}</div></div>;
    const days = [...new Set(dayVisits.map(v => v.day))];
    if (!days.length) return <div className={`${card} p-10 text-center text-sm text-[var(--muted)]`}>مفيش زيارات في الفترة دي</div>;
    return <div className="space-y-4">{days.map(day => { const list = dayVisits.filter(v => v.day === day); return <div key={day} className={`${card} p-4`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="font-extrabold text-[var(--navy)]">{fd(day, { weekday: "long", day: "numeric", month: "long" })}</div><div className="flex gap-1.5 text-[11px]"><span className="rounded-full bg-[var(--bg)] px-2 py-0.5 font-bold">{list.length} زيارة</span><span className="rounded-full bg-[var(--bg)] px-2 py-0.5 font-bold">{list[0].hm} ← {list[list.length - 1].hm}</span></div></div>
      <div className="mb-4 px-1 pb-3"><DayStrip items={list.map(v => ({ id: v.id, hm: v.hm, doctor: v.doctor_name, band: v.band, red: v.flags.some(x => x.tone === "red"), planned: v.planned }))} onPick={setSel} /></div>
      <div className="relative space-y-0 pr-5 before:absolute before:right-[9px] before:top-3 before:bottom-3 before:w-0.5 before:bg-[var(--border)]">
        {list.map((v, i) => { const prev = list[i - 1]; const gap = prev ? Math.round((new Date(v.visited_at).getTime() - new Date(prev.visited_at).getTime()) / 60000) : 0; const burstStart = v.burst_clinics >= 3 && !(prev && prev.burst_clinics >= 3);
          return <div key={v.id}>
            {prev && gap >= 45 && <div className="relative py-1.5 pr-2 text-[11px] text-[var(--muted)]">⏳ فاصل {gap >= 60 ? `${Math.floor(gap / 60)} س ${gap % 60 ? `${gap % 60} د` : ""}` : `${gap} د`}</div>}
            {burstStart ? <div className="relative mb-1 mt-2 rounded-xl bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-700">🚩 الزيارات دي اتسجلت ورا بعض من نفس المكان لعيادات مختلفة</div> : null}
            <div className="relative py-1"><span className={`absolute -right-5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-[3px] border-white shadow ${v.flags.some(x => x.tone === "red") ? "bg-red-500" : v.band ? BAND[v.band].bar : "bg-slate-300"}`} />{row(v)}</div>
          </div>; })}
      </div>
    </div>; })}</div>;
  })();

  const visitsTab = <div className="space-y-3">
    {filterBar}{kpis}
    <div className="flex items-center justify-between px-1"><div className="flex rounded-xl bg-white p-1 shadow-sm">{([["list", "☰ قائمة"], ["day", "🧭 يوم المندوب"]] as const).map(([k2, l]) => <button key={k2} onClick={() => setView(k2)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${view === k2 ? "bg-[var(--navy)] text-white" : "text-[var(--muted)]"}`}>{l}</button>)}</div><span className="text-xs text-[var(--muted)]">{loading ? "جاري التحميل…" : data ? `${data.visits.length} زيارة · ${fd(data.from, { day: "numeric", month: "short" })} → ${fd(data.to, { day: "numeric", month: "short" })}` : ""}</span></div>
    <div className={device === "desktop" && sel ? "grid grid-cols-[1fr_440px] items-start gap-3" : ""}>
      <div className="min-w-0">{view === "day" ? dayView : !data ? <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-white" />)}</div> : data.visits.length ? <div className="space-y-2">{data.visits.map(row)}</div> : <div className={`${card} p-12 text-center`}><div className="text-4xl">🔎</div><div className="mt-2 font-extrabold text-[var(--navy)]">مفيش زيارات مطابقة</div><div className="text-sm text-[var(--muted)]">جرّب فترة أطول أو شيل بعض الفلاتر</div></div>}</div>
      {device === "desktop" && sel && <aside className="sticky top-3 max-h-[calc(100vh-24px)] overflow-auto rounded-3xl bg-[var(--bg)] p-1"><VisitPanel id={sel} onClose={() => setSel(null)} onOpen={setSel} onChanged={() => void load()} /></aside>}
    </div>
  </div>;

  /* ───── insights ───── */
  const s = data?.summary;
  const insights = !s ? <div className="h-64 animate-pulse rounded-3xl bg-white" /> : <div className="space-y-3">
    <div className={`${card} flex flex-wrap items-center gap-2 p-2.5`}><div className="flex max-w-full overflow-x-auto rounded-xl bg-[var(--bg)] p-1">{PERIODS.filter(p => p[0] !== "custom").map(([k2, l]) => <button key={k2} onClick={() => setPeriod(k2)} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold ${period === k2 ? "bg-white text-[var(--navy)] shadow" : "text-[var(--muted)]"}`}>{l}</button>)}</div><select value={repId} onChange={e => setRepId(e.target.value)} className={field}><option value="">كل المناديب</option>{reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
    {kpis}
    <div className="grid gap-3 xl:grid-cols-2">
      <div className={`${card} p-4`}><div className="mb-3 font-extrabold text-[var(--navy)]">جودة الزيارات</div>
        {(() => { const t = s.bands.excellent + s.bands.good + s.bands.weak || 1; return <><div className="flex h-5 overflow-hidden rounded-full">{(["excellent", "good", "weak"] as const).map(b => <div key={b} className={BAND[b].bar} style={{ width: `${s.bands[b] / t * 100}%`, transition: "width .8s" }} />)}</div>
          <div className="mt-3 grid grid-cols-3 gap-2">{(["excellent", "good", "weak"] as const).map(b => <button key={b} onClick={() => { setF({ ...f, band: b }); setTab("visits"); }} className="rounded-2xl bg-[var(--bg)] p-3 text-center hover:bg-[var(--sky-light)]"><div className={`text-xl font-extrabold ${BAND[b].text}`}>{s.bands[b]}</div><div className="text-[11px] text-[var(--muted)]">{BAND[b].label}</div></button>)}</div></>; })()}
        <div className="mt-3 rounded-2xl bg-[var(--bg)] p-3 text-[11px] leading-5 text-[var(--muted)]">الجودة من 100: <b>الموقع</b> 25 (دقة GPS، مش تسجيل جماعي، قريب من العيادة) · <b>المحتوى</b> 45 (منتجات 18، ملاحظات 12، عرض بروشور 15) · <b>النتيجة</b> 15 (عينات/طلبات، متابعة) · <b>الخطة</b> 15.</div>
      </div>
      <div className={`${card} p-4`}><div className="mb-3 font-extrabold text-[var(--navy)]">الزيارات يوم بيوم</div>
        {s.days.length ? (() => { const m = Math.max(1, ...s.days.map(d => d.visits)); return <div className="flex h-44 items-end gap-1.5">{s.days.slice(-31).map(d => <div key={d.day} className="group flex flex-1 flex-col items-center justify-end gap-1" title={`${d.day}: ${d.visits} زيارة · جودة ${d.avgQuality}`}><span className="text-[10px] font-bold opacity-0 transition group-hover:opacity-100">{d.visits}</span><div className={`w-full rounded-t-lg ${d.avgQuality >= 75 ? "bg-emerald-500" : d.avgQuality >= 50 ? "bg-amber-400" : "bg-red-400"}`} style={{ height: `${d.visits / m * 100}%`, minHeight: 4, transition: "height .7s" }} /><span className="text-[9px] text-[var(--muted)]">{fd(d.day, { day: "numeric" })}</span></div>)}</div>; })() : <div className="text-sm text-[var(--muted)]">مفيش بيانات</div>}
        <div className="mt-2 text-[10px] text-[var(--muted)]">لون العمود = متوسط جودة اليوم</div>
      </div>
    </div>
    <div className={`${card} overflow-hidden`}><div className="flex items-center justify-between p-4"><div className="font-extrabold text-[var(--navy)]">🏆 ترتيب المناديب</div><span className="text-[11px] text-[var(--muted)]">مرتب بالجودة · اضغط على مندوب لزياراته</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="p-3 text-right">#</th><th className="p-3 text-right">المندوب</th><th className="p-3">الجودة</th><th className="p-3">زيارات</th><th className="p-3">أطباء</th><th className="p-3">التزام بالخطة</th><th className="p-3">اهتمام بالمنتجات</th><th className="p-3">عرض بروشور</th><th className="p-3">تنبيهات</th></tr></thead>
        <tbody>{s.reps.map((r, i) => { const a = data!.adherence.find(x => x.rep_id === r.rep_id); return <tr key={r.rep_id} onClick={() => { setRepId(r.rep_id); setTab("visits"); setView("list"); }} className="cursor-pointer border-t border-[var(--border)] text-center hover:bg-[var(--sky-light)]/60">
          <td className="p-3 text-right text-lg">{["🥇", "🥈", "🥉"][i] || i + 1}</td><td className="p-3 text-right font-bold">{r.rep_name}</td><td className="p-3"><div className="flex justify-center"><Ring value={r.avgQuality} size={38} stroke={4} /></div></td><td className="p-3 font-bold">{r.visits}</td><td className="p-3">{r.doctors}</td>
          <td className="p-3">{a?.planned ? <span className={`font-bold ${a.done / a.planned >= .8 ? "text-emerald-700" : a.done / a.planned >= .5 ? "text-amber-700" : "text-red-700"}`}>{Math.round(a.done / a.planned * 100)}% <span className="text-[10px] font-normal text-[var(--muted)]">({a.done}/{a.planned})</span></span> : "—"}</td>
          <td className="p-3">{r.positivePct}%</td><td className="p-3">{r.detailMin} د</td><td className={`p-3 font-bold ${r.redFlags ? "text-red-700" : "text-emerald-700"}`}>{r.redFlags || "✓"}</td></tr>; })}</tbody></table></div></div>
    <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
      <div className={`${card} p-4`}><div className="mb-3 flex items-center justify-between"><div className="font-extrabold text-[var(--navy)]">💊 المنتجات في الميدان</div><div className="flex gap-3 text-[10px] text-[var(--muted)]"><span>● <span className="text-emerald-600">مهتم</span></span><span>● محايد</span><span>● <span className="text-red-500">مش مهتم</span></span></div></div>
        {s.products.length ? <div className="space-y-2.5">{s.products.map(p => <button key={p.product_id} onClick={() => { setF({ ...f, productId: p.product_id }); setTab("visits"); }} className="block w-full text-right"><div className="mb-1 flex justify-between text-sm"><b>{p.name}</b><span className="text-xs text-[var(--muted)]">{p.total} عرض · {p.reps} مندوب · <b className="text-emerald-700">{p.positivePct}% مهتم</b></span></div><div className="flex h-3 overflow-hidden rounded-full bg-[var(--bg)]"><div className="bg-emerald-500" style={{ width: `${p.interested / p.total * 100}%` }} /><div className="bg-slate-300" style={{ width: `${p.neutral / p.total * 100}%` }} /><div className="bg-red-400" style={{ width: `${p.other / p.total * 100}%` }} /></div></button>)}</div> : <div className="text-sm text-[var(--muted)]">مفيش منتجات اتعرضت في الفترة دي</div>}</div>
      <div className={`${card} p-4`}><div className="mb-3 font-extrabold text-[var(--navy)]">🩺 الزيارات حسب تصنيف الطبيب</div><Bars data={Object.entries(s.classes).sort().map(([c, n]) => ({ key: c, label: `تصنيف ${c}`, value: n, tone: c === "A" ? "bg-emerald-500" : c === "B" ? "bg-sky-500" : "bg-slate-400" }))} />
        <div className="mt-4 rounded-2xl bg-[var(--bg)] p-3 text-xs"><div className="mb-1 font-bold text-[var(--navy)]">🚩 التنبيهات</div><div className="grid grid-cols-2 gap-1.5"><button onClick={() => { setF({ ...f, flag: "burst" }); setTab("visits"); }} className="rounded-xl bg-white p-2 text-right"><b className="text-red-700">{s.kpi.bursts}</b> تسجيل جماعي</button><button onClick={() => { setF({ ...f, flag: "far" }); setTab("visits"); }} className="rounded-xl bg-white p-2 text-right"><b className="text-red-700">{s.kpi.far}</b> بعيد عن العيادة</button></div></div></div>
    </div>
  </div>;

  /* ───── reports ───── */
  const runReport = async (kind: "pdf" | "xlsx" | "save" | "weekly") => {
    if (rp === "custom" && (!rf || !rt)) { toast("حدد بداية ونهاية الفترة", "error"); return; }
    if (kind === "pdf") { window.open(`/visits/report?${rQs()}`, "_blank"); return; }
    if (kind === "xlsx") { window.location.href = `/api/admin/visits/report?${rQs()}`; return; }
    setRBusy(kind);
    try {
      const r = kind === "save" ? await fetch(`/api/admin/visits/report?${rQs()}`, { method: "POST" }) : await fetch(`/api/admin/visits/weekly-report?force=1`);
      const j = await r.json().catch(() => null);
      if (!r.ok) { toast(j?.error || "فشل", "error"); return; }
      toast("اتحفظ التقرير في المكتبة ✓", "success"); void loadSaved();
    } finally { setRBusy(""); }
  };
  const reportsTab = <div className="grid gap-3 xl:grid-cols-[1.3fr_1fr]">
    <div className={`${card} space-y-4 p-5`}>
      <div><div className="text-lg font-extrabold text-[var(--navy)]">📊 اعمل تقرير زيارات</div><div className="text-xs text-[var(--muted)]">ملخص، جودة، التزام بالخطة، المنتجات وردود الفعل، والتنبيهات — لكل الفريق أو لمندوب</div></div>
      <div><div className="mb-1.5 text-xs font-bold text-[var(--muted)]">الفترة</div><div className="flex flex-wrap gap-1.5">{PERIODS.map(([k2, l]) => <button key={k2} onClick={() => setRp(k2)} className={`rounded-xl px-3 py-2 text-sm font-bold ${rp === k2 ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)] text-[var(--muted)]"}`}>{l}</button>)}</div>
        {rp === "custom" && <div className="mt-2 flex items-center gap-2"><input type="date" value={rf} onChange={e => setRf(e.target.value)} className={field} /><span>→</span><input type="date" value={rt} onChange={e => setRt(e.target.value)} className={field} /></div>}</div>
      <div><div className="mb-1.5 text-xs font-bold text-[var(--muted)]">المندوب</div><select value={rRep} onChange={e => setRRep(e.target.value)} className={`${field} w-full`}><option value="">كل الفريق</option>{reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
      <div className="grid gap-2 sm:grid-cols-3">
        <button onClick={() => void runReport("pdf")} className="group rounded-2xl border-2 border-[var(--border)] p-4 text-right transition hover:border-[var(--navy)] hover:shadow-md"><div className="text-2xl">🖨️</div><div className="mt-1 font-extrabold text-[var(--navy)]">تقرير PDF</div><div className="text-[11px] text-[var(--muted)]">منسّق بهوية الشركة · للطباعة أو الإرسال</div></button>
        <button onClick={() => void runReport("xlsx")} className="group rounded-2xl border-2 border-[var(--border)] p-4 text-right transition hover:border-emerald-600 hover:shadow-md"><div className="text-2xl">📗</div><div className="mt-1 font-extrabold text-[var(--navy)]">Excel تفصيلي</div><div className="text-[11px] text-[var(--muted)]">5 شيتات: ملخص · مناديب · زيارات · منتجات · تنبيهات</div></button>
        <button disabled={!!rBusy} onClick={() => void runReport("save")} className="group rounded-2xl border-2 border-[var(--border)] p-4 text-right transition hover:border-[#33b3a6] hover:shadow-md disabled:opacity-50"><div className="text-2xl">🗂️</div><div className="mt-1 font-extrabold text-[var(--navy)]">{rBusy === "save" ? "جاري الحفظ…" : "احفظ في المكتبة"}</div><div className="text-[11px] text-[var(--muted)]">يتحفظ في «تقارير الزيارات» وتقدر تشاركه</div></button>
      </div>
    </div>
    <div className="space-y-3">
      <div className={`${card} bg-gradient-to-br from-[var(--navy)] to-[#0d3a40] p-5 text-white`}><div className="text-lg font-extrabold">🗓️ التقرير الأسبوعي التلقائي</div><div className="mt-1 text-sm text-white/70">كل خميس الساعة 6 المغرب بيتعمل تقرير الأسبوع لكل الفريق، يتحفظ في المكتبة، ويوصلك إشعار بملخصه.</div><button disabled={!!rBusy} onClick={() => void runReport("weekly")} className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold hover:bg-white/25 disabled:opacity-50">{rBusy === "weekly" ? "جاري…" : "اعمل تقرير الأسبوع ده دلوقتي"}</button></div>
      <div className={`${card} p-4`}><div className="mb-2 flex items-center justify-between"><div className="font-extrabold text-[var(--navy)]">آخر التقارير المحفوظة</div><a href="/library" className="text-xs font-bold text-[var(--navy)]">المكتبة ‹</a></div>
        {saved.length ? <div className="space-y-1.5">{saved.map(x => <div key={x.id} className="flex items-center gap-2 rounded-xl bg-[var(--bg)] px-3 py-2 text-xs"><span className="rounded-md border border-emerald-100 bg-emerald-50 px-1.5 text-[10px] font-extrabold text-emerald-700">XLS</span><span className="min-w-0 flex-1 truncate font-bold" dir="auto">{x.name.replace(/\.xlsx$/, "")}</span><a href={`/api/library/file/lib/${x.id}?dl=1`} className="font-bold text-[var(--navy)]">⬇</a></div>)}</div> : <div className="text-xs text-[var(--muted)]">لسه مفيش تقارير محفوظة</div>}</div>
    </div>
  </div>;

  return <div className="mt-4 space-y-3 pb-20 lg:pb-0">
    <div className={`${card} flex flex-wrap items-center gap-2 p-2.5 shadow-sm`}>
      <div className="flex max-w-full overflow-x-auto rounded-xl bg-[var(--bg)] p-1">{([["today", "⚡ النهارده"], ["visits", "📋 الزيارات"], ["insights", "📈 التحليلات"], ["reports", "📊 التقارير"]] as Array<[Tab, string]>).map(([k2, l]) => <button key={k2} onClick={() => { setTab(k2); if (k2 !== "visits") setSel(null); }} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition sm:px-4 ${tab === k2 ? "bg-white text-[var(--navy)] shadow" : "text-[var(--muted)] hover:text-[var(--navy)]"}`}>{l}{k2 === "today" && board?.summary.redFlags ? <span className="rounded-full bg-red-500 px-1.5 text-[10px] text-white">{board.summary.redFlags}</span> : null}</button>)}</div>
      <div className="mr-auto hidden gap-2 sm:flex"><button onClick={() => { void loadToday(); void load(); }} className={`${ghost} !px-3`} title="تحديث">⟳</button></div>
    </div>
    {tab === "today" && today}
    {tab === "visits" && visitsTab}
    {tab === "insights" && insights}
    {tab === "reports" && reportsTab}
    {sel && (device !== "desktop" || tab !== "visits") && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={() => setSel(null)}><div onClick={e => e.stopPropagation()} className="max-h-[94vh] w-full overflow-auto rounded-t-3xl bg-[var(--bg)] p-2 sm:max-w-xl sm:rounded-3xl"><VisitPanel id={sel} onClose={() => setSel(null)} onOpen={setSel} onChanged={() => { void load(); void loadToday(); }} /></div></div>}
  </div>;
}
