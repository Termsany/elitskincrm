"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/Toast";
import type { HubData, View } from "@/lib/report-hub";
import { MarketView, MoneyView, RepsView, SalesView, SummaryView, type Pick } from "./HubViews";
import ReportsWorkspace from "./ReportsWorkspace";
import { AiAdvisor } from "../../daftra-sales/ai";
import { riyadhToday } from "@/lib/fmt";

type Opt = { id: string; name: string };
type Tab = View | "tables";
type F = { from: string; to: string; repId: string; city: string };
const TABS: Array<[Tab, string, boolean]> = [["summary", "الملخص", false], ["sales", "المبيعات والربح", true], ["reps", "المناديب", false], ["market", "السوق والعملاء", false], ["money", "الفلوس", true], ["tables", "كل الجداول", false]];
const add = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const mEnd = (d: string) => { const [y, m] = d.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
function preset(id: string): [string, string] {
  const t = riyadhToday(), m1 = `${t.slice(0, 7)}-01`, dow = new Date(`${t}T12:00:00Z`).getUTCDay();
  switch (id) {
    case "week": return [add(t, -dow), t];
    case "lastWeek": { const s = add(t, -dow - 7); return [s, add(s, 6)]; }
    case "lastMonth": { const s = `${add(m1, -1).slice(0, 7)}-01`; return [s, mEnd(s)]; }
    case "q": return [add(t, -89), t];
    case "year": return [`${t.slice(0, 4)}-01-01`, t];
    default: return [m1, t];
  }
}
const PRESETS: Array<[string, string]> = [["week", "الأسبوع ده"], ["lastWeek", "الأسبوع اللي فات"], ["month", "الشهر ده"], ["lastMonth", "الشهر اللي فات"], ["q", "آخر 90 يوم"], ["year", "السنة دي"]];
const CHIPS: Record<View, string> = {
  summary: "اشرح لي الملخص: إيه أهم 3 حاجات لازم أعملها الأسبوع ده وليه؟",
  sales: "اشرح لي المبيعات والربح: إيه اللي طالع وإيه اللي نازل وليه؟ وإزاي أزوّد صافي الربح؟",
  reps: "اشرح لي أداء المناديب: مين محتاج متابعة وفي إيه بالظبط؟",
  market: "اشرح لي السوق: أنهي عملاء ومدن محتاجة تحرك سريع ومين يتحرك؟",
  money: "اشرح لي الفلوس: أحصّل من مين الأول، وفيه خطر على السيولة؟",
};

function readUrl(search: string): { tab: Tab; f: F } {
  const sp = new URLSearchParams(search);
  const [a, b] = preset("month"), ok = (d: string | null) => !!d && /^\d{4}-\d\d-\d\d$/.test(d);
  const v = sp.get("view") as Tab | null;
  return { tab: v && TABS.some(t => t[0] === v) ? v : sp.get("type") ? "tables" : "summary",
    f: { from: ok(sp.get("from")) ? sp.get("from")! : a, to: ok(sp.get("to")) ? sp.get("to")! : b, repId: sp.get("repId") || "", city: sp.get("city") || "" } };
}

/** Reports: a decision summary, four ready reports (sales & profit, reps, market, money) on one filter, the detailed tables, PDF and the AI advisor. */
export default function ReportsHub({ reps, products, cities, manager, ai, aiSetup, search }: { reps: Opt[]; products: Opt[]; cities: string[]; manager: boolean; ai: boolean; aiSetup: boolean; search: string }) {
  const toast = useToast();
  const init = useMemo(() => readUrl(search), [search]);
  const [tab, setTab] = useState<Tab>(init.tab);
  const [f, setF] = useState<F>(init.f);
  const [data, setData] = useState<Partial<Record<View, unknown>>>({});
  const [loading, setLoading] = useState(false);
  const [aiOpen, setAiOpen] = useState(false); const [asked, setAsked] = useState<{ q: string; n: number } | null>(null);
  const tabs = TABS.filter(t => !(manager && t[2]));
  const qs = useMemo(() => { const q = new URLSearchParams(); (Object.keys(f) as Array<keyof F>).forEach(k => f[k] && q.set(k, f[k])); return q; }, [f]);

  useEffect(() => { // keep the URL shareable
    const q = new URLSearchParams(qs); if (tab !== "summary") q.set("view", tab);
    if (tab === "tables") { const cur = new URLSearchParams(window.location.search); for (const k of ["type", "productId", "status"]) { const v = cur.get(k); if (v) q.set(k, v); } }
    window.history.replaceState(null, "", `?${q}`);
  }, [qs, tab]);
  const load = useCallback(() => {
    if (tab === "tables") return; const c = new AbortController(); setLoading(true);
    fetch(`/api/admin/reports/hub?view=${tab}&${qs}`, { signal: c.signal }).then(r => r.ok ? r.json() : Promise.reject())
      .then(j => setData(d => ({ ...d, [tab]: j.data }))).catch(() => { if (!c.signal.aborted) toast("تعذر تحميل التقرير", "error"); }).finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  }, [tab, qs, toast]);
  useEffect(() => { setData({}); }, [qs]);
  useEffect(() => load(), [load]);

  const pick: Pick = p => { if (p.view) setTab(p.view as Tab); if (p.repId !== undefined || p.city !== undefined) setF(x => ({ ...x, ...(p.repId !== undefined ? { repId: p.repId } : {}), ...(p.city !== undefined ? { city: p.city } : {}) })); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const ask = (q: string) => { setAiOpen(true); setAsked(a => ({ q, n: (a?.n || 0) + 1 })); };
  const repName = reps.find(r => r.id === f.repId)?.name;
  const activePreset = PRESETS.find(([id]) => { const [a, b] = preset(id); return a === f.from && b === f.to; })?.[0];
  const d = tab !== "tables" ? data[tab] : null;
  const pdf = `/admin/reports/print?view=${tab}&${qs}`;
  const field = "h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm";

  return <div className="space-y-4">
    <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white p-1.5" aria-label="التقارير">
      {tabs.map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}
        className={`min-h-11 flex-1 whitespace-nowrap rounded-xl px-4 text-sm font-extrabold transition ${tab === k ? "bg-[var(--navy)] text-white shadow" : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--navy)]"}`}>{l}</button>)}
    </nav>

    {tab !== "tables" && <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-white p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map(([id, l]) => <button key={id} type="button" onClick={() => { const [a, b] = preset(id); setF(x => ({ ...x, from: a, to: b })); }}
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${activePreset === id ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--navy)]"}`}>{l}</button>)}
        <div className="mr-auto flex gap-2">
          <button type="button" onClick={() => ask(CHIPS[tab as View])} className="h-10 rounded-xl bg-[var(--navy)] px-4 text-sm font-bold text-white">✨ اشرح لي</button>
          <a href={pdf} target="_blank" rel="noreferrer" className="flex h-10 items-center rounded-xl border border-[var(--border)] px-4 text-sm font-bold text-[var(--navy)]">⬇ PDF</a>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <input type="date" aria-label="من" value={f.from} max={f.to} onChange={e => e.target.value && setF(x => ({ ...x, from: e.target.value }))} className={field} />
        <input type="date" aria-label="إلى" value={f.to} min={f.from} onChange={e => e.target.value && setF(x => ({ ...x, to: e.target.value }))} className={field} />
        <select aria-label="المندوب" value={f.repId} onChange={e => setF(x => ({ ...x, repId: e.target.value }))} className={field}><option value="">كل المناديب</option>{reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        <select aria-label="المدينة" value={f.city} onChange={e => setF(x => ({ ...x, city: e.target.value }))} className={field}><option value="">كل المدن</option>{cities.map(c => <option key={c} value={c}>{c}</option>)}</select>
      </div>
      {(f.repId || f.city) && <div className="flex flex-wrap gap-1.5 text-xs">
        {repName && <button type="button" onClick={() => setF(x => ({ ...x, repId: "" }))} className="rounded-full bg-[var(--sky-light)] px-3 py-1 font-bold text-[var(--navy)]">{repName} ✕</button>}
        {f.city && <button type="button" onClick={() => setF(x => ({ ...x, city: "" }))} className="rounded-full bg-[var(--sky-light)] px-3 py-1 font-bold text-[var(--navy)]">{f.city} ✕</button>}
      </div>}
    </div>}

    {tab === "tables" ? <ReportsWorkspace reps={reps} products={products} cities={cities} />
      : !d || loading ? <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="es-shimmer h-28 rounded-[22px]" />)}</div>
      : tab === "summary" ? <SummaryView d={d as HubData["summary"]} pick={pick} />
      : tab === "sales" ? <SalesView d={d as HubData["sales"]} pick={pick} />
      : tab === "reps" ? <RepsView d={d as HubData["reps"]} pick={pick} />
      : tab === "market" ? <MarketView d={d as HubData["market"]} pick={pick} />
      : <MoneyView d={d as HubData["money"]} pick={pick} />}

    {aiOpen && typeof document !== "undefined" && createPortal(
      <div className="fixed inset-0 z-[60] bg-[var(--navy)]/25 backdrop-blur-[2px]" onClick={() => setAiOpen(false)}>
        <section dir="rtl" role="dialog" aria-modal="true" aria-label="المستشار" onClick={e => e.stopPropagation()} className="absolute inset-y-0 left-0 flex w-[min(560px,100vw)] flex-col bg-[var(--bg)] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-[var(--border)] bg-white p-3"><b className="text-[var(--navy)]">✨ المستشار</b><button type="button" onClick={() => setAiOpen(false)} aria-label="إغلاق" className="mr-auto grid h-9 w-9 place-items-center rounded-full bg-[var(--bg)]">✕</button></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {ai || aiSetup ? <AiAdvisor d={{ ai }} reload={() => location.reload()} chips={tab === "tables" ? [] : [CHIPS[tab]]} ask={asked} endpoint="/api/admin/reports/ai" canSetup={aiSetup}
              extra={{ view: tab === "tables" ? "summary" : tab, from: f.from, to: f.to, repId: f.repId, city: f.city }} placeholder="اسأل عن أي رقم في التقرير…" />
              : <p className="p-6 text-center text-sm text-[var(--muted)]">المستشار الذكي مش متوصل — المدير يربطه من التقارير</p>}
          </div>
        </section>
      </div>, document.body)}
  </div>;
}
