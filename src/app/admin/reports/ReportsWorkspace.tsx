"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RepVisitsModal from "../visits/RepVisitsModal";

type Opt = { id: string; name: string };
type ColType = "text" | "int" | "money" | "pct" | "date" | "datetime" | "time" | "status" | "reaction" | "approval" | "purpose";
type Col = { key: string; label: string; type?: ColType };
type ReportDef = { id: string; label: string; group: string; hint: string; columns: Col[] };
type Row = Record<string, unknown>;
type Totals = { visits: number; completed: number; doctors: number; reps: number; samples: number; orders: number };
type Summary = { current: Totals; previous: Totals; previousRange: { from: string; to: string }; daily: Array<{ day: string; visits: number; completed: number }>; reactions: Array<{ product_id: string; product_name: string; interested: number; neutral: number; not_interested: number }> };
type Filters = { from: string; to: string; repId: string; productId: string; city: string; status: string };

const GROUPS: Array<[string, string]> = [["activity", "النشاط والزيارات"], ["doctors", "الأطباء والتغطية"], ["products", "المنتجات والعينات"], ["targets", "الخطط والأهداف"]];
const STATUS: Record<string, [string, string]> = { completed: ["مكتملة", "bg-emerald-50 text-emerald-800 border-emerald-200"], planned: ["مجدولة", "bg-amber-50 text-amber-800 border-amber-200"], cancelled: ["ملغاة", "bg-red-50 text-red-800 border-red-200"], follow_up: ["متابعة", "bg-sky-50 text-sky-800 border-sky-200"] };
const APPROVAL: Record<string, [string, string]> = { pending: ["بانتظار الموافقة", "bg-amber-50 text-amber-800 border-amber-200"], approved: ["معتمد", "bg-emerald-50 text-emerald-800 border-emerald-200"], rejected: ["مرفوض", "bg-red-50 text-red-800 border-red-200"] };
const STATE: Record<string, string> = { "متأخرة": "bg-red-50 text-red-800 border-red-200", "اليوم": "bg-amber-50 text-amber-800 border-amber-200", "قادمة": "bg-sky-50 text-sky-800 border-sky-200", "تمت": "bg-emerald-50 text-emerald-800 border-emerald-200" };
const PURPOSE: Record<string, string> = { personal_use: "استخدام شخصي", video_shooting: "تصوير فيديو", workshop: "ورشة" };
const KPIS: Array<[keyof Totals, string]> = [["visits", "الزيارات"], ["completed", "المكتملة"], ["doctors", "الأطباء"], ["reps", "المناديب النشطون"], ["samples", "العينات"], ["orders", "الأوردرات"]];

// ── dates (Riyadh, Sunday-first weeks) ──
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const add = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const monthEnd = (d: string) => { const [y, m] = d.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
function preset(id: string): [string, string] {
  const t = today(), m1 = `${t.slice(0, 7)}-01`;
  switch (id) {
    case "today": return [t, t];
    case "yesterday": return [add(t, -1), add(t, -1)];
    case "week": return [add(t, -dow(t)), t];
    case "lastWeek": { const s = add(t, -dow(t) - 7); return [s, add(s, 6)]; }
    case "lastMonth": { const s = `${add(m1, -1).slice(0, 7)}-01`; return [s, monthEnd(s)]; }
    case "d90": return [add(t, -89), t];
    case "year": return [`${t.slice(0, 4)}-01-01`, t];
    default: return [m1, t];
  }
}
const PRESETS: Array<[string, string]> = [["today", "اليوم"], ["yesterday", "أمس"], ["week", "هذا الأسبوع"], ["lastWeek", "الأسبوع الماضي"], ["month", "هذا الشهر"], ["lastMonth", "الشهر الماضي"], ["d90", "آخر 90 يوم"], ["year", "هذه السنة"]];
const fmtDT = (v: unknown) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(String(v)));
const fmtDay = (d: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d.slice(0, 10)}T12:00:00Z`));
const pill = (text: string, cls: string) => <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${cls}`}>{text}</span>;

function readUrl(): { f: Filters; type: string } {
  const sp = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const [a, b] = preset("month");
  const ok = (d: string | null) => !!d && /^\d{4}-\d\d-\d\d$/.test(d);
  return { f: { from: ok(sp.get("from")) ? sp.get("from")! : a, to: ok(sp.get("to")) ? sp.get("to")! : b, repId: sp.get("repId") || "", productId: sp.get("productId") || "", city: sp.get("city") || "", status: sp.get("status") || "" }, type: sp.get("type") || "reps" };
}

export default function ReportsWorkspace({ reps, products, cities }: { reps: Opt[]; products: Opt[]; cities: string[] }) {
  const init = useMemo(readUrl, []);
  const [f, setF] = useState<Filters>(init.f);
  const [type, setType] = useState(init.type);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [table, setTable] = useState<{ report: ReportDef; rows: Row[]; total: number; limited: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [repModal, setRepModal] = useState<Opt | null>(null);

  const qs = useMemo(() => { const q = new URLSearchParams(); (Object.keys(f) as Array<keyof Filters>).forEach(k => { if (f[k]) q.set(k, f[k]); }); return q; }, [f]);
  const set = (patch: Partial<Filters>) => setF(x => ({ ...x, ...patch }));
  const activePreset = PRESETS.find(([id]) => { const [a, b] = preset(id); return a === f.from && b === f.to; })?.[0] || "custom";

  // keep the URL shareable
  useEffect(() => { const q = new URLSearchParams(qs); q.set("type", type); window.history.replaceState(null, "", `?${q}`); }, [qs, type]);

  useEffect(() => {
    const c = new AbortController();
    fetch(`/api/admin/reports/summary?${qs}`, { signal: c.signal }).then(r => r.ok ? r.json() : Promise.reject()).then(setSummary).catch(() => { if (!c.signal.aborted) setSummary(null); });
    return () => c.abort();
  }, [qs]);

  useEffect(() => {
    const c = new AbortController(); setLoading(true); setError(""); setSort(null);
    const q = new URLSearchParams(qs); q.set("type", type);
    fetch(`/api/admin/reports/table?${q}`, { signal: c.signal }).then(r => r.ok ? r.json() : Promise.reject())
      .then(j => setTable(j))
      .catch(() => { if (!c.signal.aborted) setError("تعذر تحميل التقرير. أعد المحاولة."); })
      .finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  }, [qs, type]);

  const catalog = useCatalog();

  const rows = useMemo(() => {
    if (!table) return [];
    const q = search.trim().toLowerCase();
    let r = q ? table.rows.filter(x => Object.values(x).some(v => typeof v === "string" && v.toLowerCase().includes(q))) : table.rows;
    if (sort) {
      const col = table.report.columns.find(c => c.key === sort.key);
      const num = col && ["int", "money", "pct"].includes(col.type || "");
      r = [...r].sort((a, b) => {
        const x = a[sort.key], y = b[sort.key];
        if (x == null || x === "") return 1; if (y == null || y === "") return -1;
        return (num ? Number(x) - Number(y) : String(x).localeCompare(String(y), "ar")) * sort.dir;
      });
    }
    return r;
  }, [table, search, sort]);

  const xlsAll = `/api/admin/reports/workbook?${qs}`;
  const xlsOne = (() => { const q = new URLSearchParams(qs); q.set("type", type); return `/api/admin/reports/workbook?${q}`; })();
  const pdfOne = (() => { const q = new URLSearchParams(qs); q.set("type", type); return `/admin/reports/print?${q}`; })();
  const hasFilter = !!(f.repId || f.productId || f.city || f.status);

  const cell = useCallback((c: Col, r: Row) => {
    const v = r[c.key];
    if (v === null || v === undefined || v === "") return <span className="text-[var(--muted)]">—</span>;
    if (c.key === "rep_name" && r.rep_id) return <button onClick={() => setRepModal({ id: String(r.rep_id), name: String(v) })} className="font-bold text-[var(--navy)] hover:underline">{String(v)}</button>;
    if (c.key === "doctor_name" && r.doctor_id) return <Link href={`/doctors/${r.doctor_id}`} className="font-bold text-[var(--navy)] hover:underline">{String(v)}</Link>;
    if (c.key === "product_name" && r.product_id) return <button onClick={() => set({ productId: String(r.product_id) })} title="فلترة على المنتج ده" className="font-bold text-[var(--navy)] hover:underline">{String(v)}</button>;
    if (c.key === "city" && cities.includes(String(v))) return <button onClick={() => set({ city: String(v) })} title="فلترة على المدينة دي" className="hover:underline">{String(v)}</button>;
    if (c.key === "day") return <button onClick={() => set({ from: String(v).slice(0, 10), to: String(v).slice(0, 10) })} title="عرض اليوم ده بس" className="font-bold hover:underline">{fmtDay(String(v))}</button>;
    if (c.key === "state") return pill(String(v), STATE[String(v)] || "");
    if (c.key === "classification") return pill(String(v), "bg-[var(--sky-soft)] text-[var(--navy)] border-[var(--sky-border)]");
    switch (c.type) {
      case "datetime": return <span dir="ltr" className="whitespace-nowrap">{fmtDT(v)}</span>;
      case "date": return <span className="whitespace-nowrap">{fmtDay(String(v))}</span>;
      case "money": return <>{Number(v).toLocaleString("en-US")} <span className="text-[var(--muted)] text-[10px]">ريال</span></>;
      case "pct": { const n = Number(v); return pill(`${n}%`, n >= 90 ? STATUS.completed[1] : n >= 60 ? STATUS.planned[1] : STATUS.cancelled[1]); }
      case "status": { const s = STATUS[String(v)]; return s ? pill(s[0], s[1]) : String(v); }
      case "approval": { const s = APPROVAL[String(v)]; return s ? pill(s[0], s[1]) : String(v); }
      case "purpose": return PURPOSE[String(v)] || String(v);
      case "int": return <span className="font-bold">{Number(v).toLocaleString("en-US")}</span>;
      default: { const s = String(v); return s.length > 90 ? <span title={s}>{s.slice(0, 90)}…</span> : s; }
    }
  }, [cities]);

  const max = Math.max(1, ...(summary?.daily.map(d => d.visits) || [1]));
  const days = useMemo(() => {
    if (!summary) return [];
    const by = new Map(summary.daily.map(d => [d.day, d]));
    const out: Array<{ day: string; visits: number; completed: number }> = [];
    for (let d = f.from, i = 0; d <= f.to && i < 400; d = add(d, 1), i++) out.push(by.get(d) || { day: d, visits: 0, completed: 0 });
    return out;
  }, [summary, f.from, f.to]);

  return (
    <div className="mt-4 space-y-4">
      {/* Period + filters */}
      <div className="rounded-2xl border border-[var(--border)] bg-white p-3 sm:p-4 space-y-3 sticky top-0 z-20 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map(([id, label]) => <button key={id} onClick={() => { const [a, b] = preset(id); set({ from: a, to: b }); }} className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${activePreset === id ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-white border-[var(--border)] hover:border-[var(--navy-3)]"}`}>{label}</button>)}
          <div className={`flex items-center gap-1 rounded-xl border px-2 py-1 text-xs ${activePreset === "custom" ? "border-[var(--navy)]" : "border-[var(--border)]"}`}>
            <span className="text-[var(--muted)]">من</span><input type="date" value={f.from} max={f.to} onChange={e => e.target.value && set({ from: e.target.value })} className="bg-transparent outline-none" />
            <span className="text-[var(--muted)]">إلى</span><input type="date" value={f.to} min={f.from} onChange={e => e.target.value && set({ to: e.target.value })} className="bg-transparent outline-none" />
          </div>
          <a href={xlsAll} className="mr-auto rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 text-sm font-bold shadow-sm">⬇ تحميل تقرير الفترة كامل (Excel)</a>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select value={f.repId} onChange={e => set({ repId: e.target.value })} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"><option value="">كل المناديب</option>{reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <select value={f.productId} onChange={e => set({ productId: e.target.value })} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"><option value="">كل المنتجات</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select value={f.city} onChange={e => set({ city: e.target.value })} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"><option value="">كل المدن</option>{cities.map(c => <option key={c}>{c}</option>)}</select>
          <select value={f.status} onChange={e => set({ status: e.target.value })} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"><option value="">كل الحالات</option><option value="completed">مكتملة</option><option value="planned">مجدولة</option><option value="cancelled">ملغاة</option></select>
          <button disabled={!hasFilter} onClick={() => set({ repId: "", productId: "", city: "", status: "" })} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-30">مسح الفلاتر</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {KPIS.map(([k, label]) => {
          const a = summary?.current[k] ?? 0, b = summary?.previous[k] ?? 0, d = b ? Math.round(((a - b) / b) * 100) : null;
          return <div key={k} className="rounded-2xl border border-[var(--border)] bg-white p-4">
            <div className="text-xs text-[var(--muted)]">{label}</div>
            <div className="text-2xl font-extrabold text-[var(--navy)] mt-1">{summary ? a.toLocaleString("en-US") : "…"}</div>
            <div className="text-[11px] mt-1" title={summary ? `الفترة السابقة ${summary.previousRange.from} → ${summary.previousRange.to}: ${b}` : ""}>
              {summary && (d === null ? <span className="text-[var(--muted)]">لا توجد فترة سابقة للمقارنة</span> : <span className={d > 0 ? "text-emerald-700 font-bold" : d < 0 ? "text-red-700 font-bold" : "text-[var(--muted)]"}>{d > 0 ? "▲" : d < 0 ? "▼" : "•"} {Math.abs(d)}% <span className="font-normal text-[var(--muted)]">عن الفترة السابقة</span></span>)}
            </div>
          </div>;
        })}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-5 gap-3">
        <div className="lg:col-span-3 rounded-2xl border border-[var(--border)] bg-white p-4">
          <div className="flex items-center justify-between mb-3"><div className="font-extrabold text-[var(--navy)]">الزيارات يوم بيوم</div><div className="flex gap-3 text-[11px] text-[var(--muted)]"><span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-[var(--navy)] ml-1" />مكتملة</span><span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-[var(--sky-border)] ml-1" />أخرى</span></div></div>
          {days.length > 120 ? <div className="text-sm text-[var(--muted)] py-10 text-center">الفترة طويلة — اختار 4 شهور أو أقل لعرض الرسم اليومي</div> :
            <div className="flex items-end gap-[2px] h-40" dir="ltr">
              {days.map(d => <button key={d.day} onClick={() => d.visits && set({ from: d.day, to: d.day })} title={`${d.day}: ${d.visits} زيارة · ${d.completed} مكتملة`} className={`group flex-1 min-w-[3px] h-full flex flex-col justify-end ${d.visits ? "cursor-pointer" : "cursor-default"}`}>
                <div className="w-full rounded-t bg-[var(--sky-border)] group-hover:opacity-80" style={{ height: `${((d.visits - d.completed) / max) * 100}%` }} />
                <div className="w-full bg-[var(--navy)] group-hover:opacity-80" style={{ height: `${(d.completed / max) * 100}%` }} />
              </button>)}
            </div>}
          {days.length > 0 && days.length <= 120 && <div className="flex justify-between text-[10px] text-[var(--muted)] mt-1" dir="ltr"><span>{days[0].day.slice(5)}</span><span>{days[days.length - 1].day.slice(5)}</span></div>}
        </div>
        <div className="lg:col-span-2 rounded-2xl border border-[var(--border)] bg-white p-4">
          <div className="font-extrabold text-[var(--navy)] mb-3">ردود فعل الأطباء على المنتجات</div>
          {!summary?.reactions.length && <div className="text-sm text-[var(--muted)] py-8 text-center">لا يوجد شرح منتجات في الفترة</div>}
          <div className="space-y-2.5">{summary?.reactions.map(p => { const t = p.interested + p.neutral + p.not_interested || 1; return (
            <button key={p.product_id} onClick={() => set({ productId: p.product_id })} className="w-full text-right group" title="فلترة على المنتج ده">
              <div className="flex justify-between text-xs mb-1"><span className="font-bold group-hover:underline">{p.product_name}</span><span className="text-[var(--muted)]">{t} شرح · {Math.round((p.interested / t) * 100)}% مهتم</span></div>
              <div className="flex h-3 rounded-full overflow-hidden bg-[var(--bg)]"><i style={{ width: `${(p.interested / t) * 100}%` }} className="bg-emerald-600" /><i style={{ width: `${(p.neutral / t) * 100}%` }} className="bg-slate-300" /><i style={{ width: `${(p.not_interested / t) * 100}%` }} className="bg-red-500" /></div>
            </button>); })}</div>
          {!!summary?.reactions.length && <div className="flex gap-3 text-[11px] text-[var(--muted)] mt-3"><span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-600 ml-1" />مهتم</span><span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-300 ml-1" />محايد</span><span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500 ml-1" />غير مهتم</span></div>}
        </div>
      </div>

      {/* Report picker */}
      <div className="rounded-2xl border border-[var(--border)] bg-white p-4 grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {GROUPS.map(([g, label]) => <div key={g}>
          <div className="text-xs font-bold text-[var(--muted)] mb-2">{label}</div>
          <div className="flex flex-wrap gap-1.5">{catalog.filter(r => r.group === g).map(r => <button key={r.id} onClick={() => { setType(r.id); setSearch(""); }} title={r.hint} className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${type === r.id ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-[var(--bg)] border-transparent hover:border-[var(--navy-3)]"}`}>{r.label}</button>)}</div>
        </div>)}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 justify-between p-4 border-b border-[var(--border)]">
          <div>
            <div className="font-extrabold text-[var(--navy)]">{table?.report.label || "…"} {table && <span className="text-sm font-normal text-[var(--muted)]">({rows.length}{table.limited ? ` من ${table.total}` : ""})</span>}</div>
            <div className="text-xs text-[var(--muted)]">{table?.report.hint}{table?.limited ? " — الجدول بيعرض أول 1000 صف، وملف Excel فيه الكل" : ""}</div>
          </div>
          <div className="flex items-center gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في الجدول…" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm w-44" />
            <a href={xlsOne} className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-2 text-sm font-bold hover:bg-emerald-100">Excel</a>
            <a href={pdfOne} target="_blank" rel="noreferrer" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-bold hover:bg-[var(--bg)]">PDF / طباعة</a>
          </div>
        </div>
        {error && <div className="p-6 text-center text-red-700">{error}</div>}
        {loading && !error && <div className="p-4 space-y-2">{[0, 1, 2, 3, 4].map(i => <div key={i} className="h-9 rounded-lg bg-[var(--bg)] animate-pulse" />)}</div>}
        {!loading && !error && table && (rows.length ? (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--bg)] text-xs text-[var(--muted)] z-10"><tr>{table.report.columns.map(c => <th key={c.key} onClick={() => setSort(s => s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: ["int", "money", "pct", "datetime", "date"].includes(c.type || "") ? -1 : 1 })} className="text-right p-3 whitespace-nowrap cursor-pointer select-none hover:text-[var(--navy)]">{c.label}{sort?.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => <tr key={String(r.id ?? i)} className="border-t border-[var(--border)] hover:bg-[var(--sky-light)]">{table.report.columns.map(c => <td key={c.key} className={`p-3 align-top ${/notes|note|issues|presented_products|products/.test(c.key) ? "min-w-[220px]" : "whitespace-nowrap"}`}>{cell(c, r)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : <div className="p-10 text-center text-[var(--muted)]">لا توجد بيانات لهذا التقرير في الفترة المختارة</div>)}
      </div>

      {repModal && <RepVisitsModal rep={repModal} initialDay={f.from === f.to ? f.from : ""} onClose={() => setRepModal(null)} />}
    </div>
  );
}

// Report catalog (labels/groups) — mirrors the server registry; fetched once.
function useCatalog() {
  const [list, setList] = useState<ReportDef[]>([]);
  useEffect(() => { fetch("/api/admin/reports/catalog").then(r => r.ok ? r.json() : null).then(j => j && setList(j.reports)).catch(() => {}); }, []);
  return list;
}
