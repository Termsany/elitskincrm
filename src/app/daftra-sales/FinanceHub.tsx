"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { computeFinance } from "@/lib/finance";
import { ExcelBtn } from "./kit";
import { Overview, Sales, Purchases, Book, Pricing, Pnl, Advisor } from "./tabs";

export type FinData = ReturnType<typeof computeFinance> & { sync: { started_at: string | null; finished_at: string | null; ok: boolean | null; message: string; running: boolean }; today: string };
export type Tab = "overview" | "sales" | "purchases" | "ar" | "ap" | "pricing" | "pnl" | "advisor";
const TABS: Array<[Tab, string, string]> = [["overview", "الملخص", "dashboard"], ["sales", "المبيعات", "sales"], ["purchases", "المشتريات", "products"], ["ar", "ليا (العملاء)", "time"], ["ap", "عليا (الموردين)", "send"], ["pricing", "المنتجات والتسعير", "coverage"], ["pnl", "الأرباح والمصروفات", "reports"], ["advisor", "المستشار المالي", "sparkle"]];
const tz = "Asia/Riyadh";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
const back = (months: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - months); return `${new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d).slice(0, 7)}-01`; };
const lastDay = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const PRESETS: Array<[string, () => [string, string]]> = [["الشهر ده", () => [`${today().slice(0, 7)}-01`, today()]], ["الشهر اللي فات", () => [back(1), lastDay(back(1).slice(0, 7))]], ["آخر 3 شهور", () => [back(2), today()]], ["آخر 6 شهور", () => [back(5), today()]], ["السنة دي", () => [`${today().slice(0, 4)}-01-01`, today()]], ["آخر 12 شهر", () => [back(11), today()]], ["من البداية", () => ["2024-01-01", today()]]];

export default function FinanceHub({ subdomain }: { subdomain: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [preset, setPreset] = useState(5);
  const [range, setRange] = useState<[string, string]>(PRESETS[5][1]());
  const [d, setD] = useState<FinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch(`/api/admin/finance?from=${range[0]}&to=${range[1]}`).then(r => r.json()).catch(() => null);
    setLoading(false);
    if (j?.kpi) setD(j); else toast(j?.error || "تعذر تحميل البيانات", "error");
  }, [range, toast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!d?.sync?.running) return; const t = setTimeout(() => void load(), 6000); return () => clearTimeout(t); }, [d, load]);
  useEffect(() => { try { const t = sessionStorage.getItem("fin-tab"); if (t && TABS.some(x => x[0] === t)) setTab(t as Tab); } catch { /* ignore */ } }, []);
  const go = (t: Tab) => { setTab(t); try { sessionStorage.setItem("fin-tab", t); } catch { /* ignore */ } window.scrollTo({ top: 0, behavior: "smooth" }); };
  const pickMonth = (m: string) => { setPreset(-1); setRange([`${m}-01`, lastDay(m)]); toast(`بتشوف تفاصيل ${m}`, "success"); };
  async function sync() {
    setSyncing(true);
    const r = await fetch("/api/admin/daftra/sync", { method: "POST" }); const j = await r.json().catch(() => null); setSyncing(false);
    if (!r.ok) toast(j?.error || "تعذرت المزامنة", "error"); else { toast("تم تحديث البيانات من دفترة", "success"); await load(); }
  }
  const x = (section: string) => `/api/admin/finance/export?from=${range[0]}&to=${range[1]}&section=${section}`;
  const lastSync = d?.sync?.finished_at ? new Date(d.sync.finished_at).toLocaleString("ar-EG-u-nu-latn", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }) : "—";

  return <div className="mt-5 space-y-4">
    <div className="sticky top-0 z-30 -mx-4 space-y-2 bg-[var(--bg)]/95 px-4 pb-2 pt-1 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-white p-2.5">
        <div className="flex flex-wrap gap-1 rounded-xl bg-[var(--bg)] p-1">{PRESETS.map(([l, f], i) => <button key={l} type="button" onClick={() => { setPreset(i); setRange(f()); }} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${preset === i ? "bg-white text-[var(--navy)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--navy)]"}`}>{l}</button>)}</div>
        <div className="flex items-center gap-1 text-xs"><input type="date" value={range[0]} max={range[1]} onChange={e => { setPreset(-1); setRange([e.target.value, range[1]]); }} className="rounded-lg border border-[var(--border)] px-2 py-1.5" /><span className="text-[var(--muted)]">←</span><input type="date" value={range[1]} min={range[0]} onChange={e => { setPreset(-1); setRange([range[0], e.target.value]); }} className="rounded-lg border border-[var(--border)] px-2 py-1.5" /></div>
        <div className="mr-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-[11px] text-[var(--muted)] sm:flex"><span className={`h-2 w-2 rounded-full ${d?.sync?.running ? "animate-pulse bg-amber-500" : d?.sync?.ok === false ? "bg-red-500" : "bg-emerald-500"}`} />{d?.sync?.running ? "جارٍ التحديث من دفترة…" : `آخر تحديث ${lastSync}`}</span>
          <button type="button" disabled={syncing} onClick={() => void sync()} className="flex items-center gap-1.5 rounded-xl bg-[var(--navy)] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"><span className={syncing ? "animate-spin" : ""}><Icon name="repeat" size={14} /></span>{syncing ? "جارٍ التحديث…" : "تحديث من دفترة"}</button>
          <ExcelBtn href={x("all")} label="تقرير Excel كامل" />
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white p-1.5">{TABS.map(([k, l, i]) => <button key={k} type="button" onClick={() => go(k)} className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold transition ${tab === k ? "bg-[var(--navy)] text-white shadow" : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--navy)]"}`}><Icon name={i} size={16} />{l}{k === "advisor" && d && d.advice.some(a => a.level === "danger") && <span className="h-2 w-2 rounded-full bg-red-500" />}</button>)}</div>
    </div>
    {d?.sync?.ok === false && <div className="rounded-xl bg-red-50 p-3 text-xs text-red-800 ring-1 ring-red-200">آخر تحديث من دفترة فشل: {d.sync.message}</div>}
    {!d ? <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3, 4, 5, 6, 7].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white" />)}</div>
      : <div className={`transition-opacity ${loading ? "opacity-50" : ""}`}>
        {tab === "overview" && <Overview d={d} go={go} pickMonth={pickMonth} x={x} />}
        {tab === "sales" && <Sales d={d} pickMonth={pickMonth} x={x} subdomain={subdomain} />}
        {tab === "purchases" && <Purchases d={d} pickMonth={pickMonth} x={x} subdomain={subdomain} />}
        {tab === "ar" && <Book d={d} kind="ar" x={x} subdomain={subdomain} />}
        {tab === "ap" && <Book d={d} kind="ap" x={x} subdomain={subdomain} />}
        {tab === "pricing" && <Pricing d={d} x={x} reload={load} />}
        {tab === "pnl" && <Pnl d={d} pickMonth={pickMonth} x={x} reload={load} />}
        {tab === "advisor" && <Advisor d={d} go={go} x={x} reload={load} />}
      </div>}
    <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-[11px] text-[var(--muted)]"><Icon name="check" size={13} />القراءة فقط من دفترة — أي تعديل أو تصنيف هنا يتحفظ في الـ CRM بس وما يغيّرش أي حاجة في دفترة.</p>
  </div>;
}
