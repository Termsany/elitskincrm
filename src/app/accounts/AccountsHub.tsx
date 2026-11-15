"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { FinData } from "../daftra-sales/FinanceHub";
import type { Attention } from "@/lib/fin-books";
import { ExcelBtn, sar } from "../daftra-sales/kit";
import { Summary } from "./summary";
import { Parties, StatementDrawer, type PartyKind } from "./parties";
import { Expenses, Pnl, Vat, Products } from "./books";
import { CashTab } from "./cash";
import { AuditTab } from "./audit";

export type AccData = FinData & { attention?: Attention[] };
/** Old tab names ("ar", "ap", "pricing") still work so restored links keep opening the right place. */
export type Tab = "summary" | "clients" | "suppliers" | "expenses" | "pnl" | "vat" | "cash" | "products" | "audit" | "ar" | "ap" | "pricing";
export type Open = (kind: PartyKind, name: string) => void;
const ALIAS: Partial<Record<Tab, Tab>> = { ar: "clients", ap: "suppliers", pricing: "products" };
const TABS: Array<[Tab, string, string]> = [["summary", "الملخص", "dashboard"], ["clients", "العملاء", "doctors"], ["suppliers", "الموردين", "send"], ["expenses", "المصروفات", "wallet"],
  ["pnl", "الأرباح والخسائر", "reports"], ["vat", "الضريبة", "file"], ["cash", "السيولة", "time"], ["products", "المنتجات والأسعار", "products"], ["audit", "مراجعة الحسابات", "check"]];
const EXCEL: Partial<Record<Tab, string>> = { summary: "summary", clients: "ar", suppliers: "ap", expenses: "pnl", pnl: "pnl", vat: "summary", products: "pricing" };
const NO_RANGE: Partial<Record<Tab, boolean>> = { clients: true, suppliers: true, cash: true };

const tz = "Asia/Riyadh";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
const back = (months: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - months); return `${new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d).slice(0, 7)}-01`; };
const lastDay = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const PRESETS: Array<[string, () => [string, string]]> = [["الشهر ده", () => [`${today().slice(0, 7)}-01`, today()]], ["الشهر اللي فات", () => [back(1), lastDay(back(1).slice(0, 7))]],
  ["آخر 3 شهور", () => [back(2), today()]], ["السنة دي", () => [`${today().slice(0, 4)}-01-01`, today()]], ["آخر 12 شهر", () => [back(11), today()]]];
const ago = (iso: string | null) => { if (!iso) return "—"; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? "دلوقتي" : m < 60 ? `من ${m} دقيقة` : m < 1440 ? `من ${Math.round(m / 60)} ساعة` : `من ${Math.round(m / 1440)} يوم`; };

export default function AccountsHub({ subdomain }: { subdomain: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("summary");
  const [preset, setPreset] = useState(0);
  const [range, setRange] = useState<[string, string]>(PRESETS[0][1]());
  const [d, setD] = useState<AccData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [party, setParty] = useState<{ kind: PartyKind; name: string } | null>(null);
  const [editStart, setEditStart] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch(`/api/admin/finance?from=${range[0]}&to=${range[1]}`, { cache: "no-store" })
      .then(async r => (await r.json().catch(() => null)) ?? { error: `تعذر تحميل البيانات (خطأ ${r.status})` }).catch(() => null);
    setLoading(false);
    if (j?.kpi) setD(j); else toast(j?.error || "تعذر تحميل البيانات", "error");
  }, [range, toast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!d?.sync?.running) return; const t = setTimeout(() => void load(), 6000); return () => clearTimeout(t); }, [d, load]);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    const ok = (t: string | null): t is Tab => !!t && TABS.some(x => x[0] === (ALIAS[t as Tab] || t));
    if (ok(q)) { setTab(ALIAS[q] || q); return; }
    try { const t = sessionStorage.getItem("acc-tab"); if (ok(t)) setTab(ALIAS[t] || t); } catch { /* ignore */ }
  }, []);
  const go = useCallback((t: Tab) => { const x = ALIAS[t] || t; setTab(x); try { sessionStorage.setItem("acc-tab", x); } catch { /* ignore */ } window.scrollTo({ top: 0, behavior: "smooth" }); }, []);
  const open: Open = useCallback((kind, name) => setParty({ kind, name }), []);
  const pickMonth = (m: string) => { setPreset(-1); setRange([`${m}-01`, lastDay(m)]); };

  async function sync() {
    setSyncing(true);
    const r = await fetch("/api/admin/daftra/sync", { method: "POST" }); const j = await r.json().catch(() => null); setSyncing(false);
    if (!r.ok) toast(j?.error || "تعذرت المزامنة", "error"); else { toast("تم تحديث البيانات من دفترة", "success"); await load(); }
  }
  async function saveStart(v: string | null) {
    const r = await fetch("/api/admin/finance/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ books_start: v }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) { toast(j?.error || "تعذر الحفظ", "error"); return; }
    toast(v ? `الحسابات بقت من ${v}` : "الحسابات بقت من أول فاتورة", "success"); setEditStart(null); await load();
  }
  const x = (section: string) => `/api/admin/finance/export?from=${range[0]}&to=${range[1]}&section=${section}`;

  return <div className="space-y-4 pb-20">
    {/* header */}
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1"><h1 className="text-2xl font-extrabold text-[var(--ink)]">الحسابات</h1>
        <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">مرجعك لكل الفلوس: عملاء، موردين، مصروفات، ربح وخسارة — من دفترة</p></div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <Search open={open} subdomain={subdomain} />
        <button type="button" disabled={syncing} onClick={() => void sync()} className="flex items-center gap-1.5 rounded-full bg-[var(--navy)] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60"><span className={syncing ? "animate-spin" : ""}><Icon name="repeat" size={14} /></span>{syncing ? "جارٍ التحديث…" : "حدّث من دفترة"}</button>
        <ThemeToggle className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-bold text-[var(--navy)]" />
      </div>
    </div>

    {/* confidence strip */}
    {d && <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl bg-[var(--sky-light)] px-4 py-2.5 text-[12px] font-semibold text-[var(--muted)]">
      <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${d.sync?.running ? "animate-pulse bg-amber-500" : d.sync?.ok === false ? "bg-red-500" : "bg-emerald-500"}`} />
        {d.sync?.running ? "جارٍ التحديث من دفترة…" : `آخر مزامنة ${ago(d.sync?.finished_at)}`}</span>
      <span title="نسبة المبيعات اللي نعرف تكلفتها من فواتير الشراء — كل ما قلت، الربح المحسوب أقل دقة">تكلفة <b className={d.kpi.cost_coverage < 90 ? "text-amber-700" : "text-[var(--ink)]"}>{Math.round(d.kpi.cost_coverage)}%</b> من المبيعات معروفة</span>
      {d.docs && <span>{d.docs.total} فاتورة بيع في البرنامج</span>}
      {editStart === null
        ? <button type="button" onClick={() => setEditStart(d.books_start || "")} className="font-bold text-[var(--navy)] hover:underline">الحسابات {d.books_start ? `من ${d.books_start}` : "من أول فاتورة"} · غيّر</button>
        : <span className="flex flex-wrap items-center gap-1.5"><span>الحسابات من</span>
          <input type="date" value={editStart} onChange={e => setEditStart(e.target.value)} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs" />
          <button type="button" onClick={() => void saveStart(editStart || null)} className="rounded-lg bg-[var(--navy)] px-2.5 py-1 text-xs font-bold text-white">حفظ</button>
          <button type="button" onClick={() => void saveStart(null)} className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--navy)]">من أول فاتورة</button>
          <button type="button" onClick={() => setEditStart(null)} className="rounded-lg px-2 py-1 text-xs">إلغاء</button></span>}
    </div>}
    {d?.docs && d.docs.before_start > 0 && tab !== "clients" && tab !== "suppliers" && <div className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900 ring-1 ring-amber-200">
      {d.docs.before_start} من {d.docs.total} فاتورة بيع تاريخها قبل بداية الحسابات ({d.books_start}) فمش داخلة في الربح والمصروفات{d.docs.in_period === 0 ? " — ومفيش ولا فاتورة في الفترة المختارة" : ""}.
      <button type="button" onClick={() => setEditStart(d.books_start || "")} className="mr-1 underline">غيّر بداية الحسابات</button></div>}
    {d?.sync?.ok === false && <div className="rounded-xl bg-red-50 p-3 text-xs text-red-800 ring-1 ring-red-200">آخر تحديث من دفترة فشل: {d.sync.message}</div>}

    {/* tabs + period */}
    <div className="flex gap-1 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1.5" role="tablist">
      {TABS.map(([k, l, i]) => { const on = tab === k; const n = k === "summary" ? (d?.attention || []).filter(a => a.level === "danger").length : 0;
        return <button key={k} type="button" role="tab" aria-selected={on} onClick={() => go(k)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold transition ${on ? "bg-[var(--navy)] text-white shadow" : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--navy)]"}`}>
          <Icon name={i} size={15} />{l}{n > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[10px] text-white">{n}</span>}</button>; })}
    </div>
    {!NO_RANGE[tab] && <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1 rounded-xl bg-[var(--sky-light)] p-1">{PRESETS.map(([l, f], i) => <button key={l} type="button" onClick={() => { setPreset(i); setRange(f()); }} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${preset === i ? "bg-[var(--card)] text-[var(--navy)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--navy)]"}`}>{l}</button>)}</div>
      <div className="flex items-center gap-1 text-xs"><input type="date" value={range[0]} max={range[1]} onChange={e => { setPreset(-1); setRange([e.target.value, range[1]]); }} className="rounded-lg border border-[var(--border)] px-2 py-1.5" /><span className="text-[var(--muted)]">←</span><input type="date" value={range[1]} min={range[0]} onChange={e => { setPreset(-1); setRange([range[0], e.target.value]); }} className="rounded-lg border border-[var(--border)] px-2 py-1.5" /></div>
      {EXCEL[tab] && <span className="mr-auto"><ExcelBtn href={x(EXCEL[tab]!)} /></span>}
    </div>}

    {!d ? <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-[var(--card)]" />)}</div>
      : <div className={`transition-opacity ${loading ? "opacity-50" : ""}`}>
        {tab === "summary" && <Summary d={d} go={go} open={open} pickMonth={pickMonth} />}
        {tab === "clients" && <Parties d={d} kind="client" open={open} x={x} />}
        {tab === "suppliers" && <Parties d={d} kind="supplier" open={open} x={x} />}
        {tab === "expenses" && <Expenses d={d} reload={load} pickMonth={pickMonth} />}
        {tab === "pnl" && <Pnl d={d} pickMonth={pickMonth} />}
        {tab === "vat" && <Vat d={d} />}
        {tab === "cash" && <CashTab go={go} />}
        {tab === "products" && <Products d={d} reload={load} subdomain={subdomain} x={x} />}
        {tab === "audit" && <AuditTab range={range} subdomain={subdomain} go={go} />}
      </div>}

    {party && <StatementDrawer kind={party.kind} name={party.name} subdomain={subdomain} onClose={() => setParty(null)} />}
  </div>;
}

type Hit = { name: string; n: number; unpaid: number | null; last: string };
type InvHit = { kind: "sale" | "purchase"; id: number; no: string; date: string; party: string; total: number; unpaid: number };
/** One box for customers, suppliers and invoice numbers (all time, not just the chosen period). */
function Search({ open, subdomain }: { open: Open; subdomain: string }) {
  const [q, setQ] = useState(""); const [res, setRes] = useState<{ clients: Hit[]; suppliers: Hit[]; invoices: InvHit[] } | null>(null); const [show, setShow] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => { fetch(`/api/admin/finance/search?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal }).then(r => r.ok ? r.json() : null).then(j => j && setRes(j)).catch(() => {}); }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);
  useEffect(() => { const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setShow(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const pick = (k: PartyKind, n: string) => { setShow(false); setQ(""); open(k, n); };
  const url = (i: InvHit) => `https://${subdomain}.daftra.com/owner/${i.kind === "sale" ? "invoices" : "purchase_invoices"}/view/${i.id}`;
  const empty = res && !res.clients.length && !res.suppliers.length && !res.invoices.length;
  return <div ref={box} className="relative min-w-0 flex-1 sm:w-80 sm:flex-none">
    <input value={q} onChange={e => { setQ(e.target.value); setShow(true); }} onFocus={() => setShow(true)} onKeyDown={e => { if (e.key === "Escape") setShow(false); }}
      placeholder="ابحث عن عميل، مورد، أو رقم فاتورة" aria-label="بحث في الحسابات" className="w-full rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm" />
    {show && res && <div className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-96 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-xl">
      {empty && <div className="p-3 text-center text-xs text-[var(--muted)]">مفيش نتايج</div>}
      {([["client", "العملاء", res.clients], ["supplier", "الموردين", res.suppliers]] as const).map(([k, l, rows]) => rows.length > 0 && <div key={k} className="mb-1">
        <div className="px-2 py-1 text-[11px] font-extrabold text-[var(--muted)]">{l}</div>
        {rows.map(r => <button key={r.name} type="button" onClick={() => pick(k, r.name)} className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-right text-sm hover:bg-[var(--sky-light)]">
          <span className="min-w-0 truncate font-bold">{r.name}</span><span className="shrink-0 text-[11px] text-[var(--muted)]">{r.unpaid ? <b className="text-orange-700">{sar(r.unpaid)}</b> : `${r.n} فاتورة`}</span></button>)}
      </div>)}
      {res.invoices.length > 0 && <div><div className="px-2 py-1 text-[11px] font-extrabold text-[var(--muted)]">فواتير</div>
        {res.invoices.map(i => <a key={`${i.kind}${i.id}`} href={url(i)} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 text-sm hover:bg-[var(--sky-light)]">
          <span className="min-w-0 truncate"><b dir="ltr">{i.no}</b> · {i.party}</span><span className="shrink-0 text-[11px] text-[var(--muted)]">{i.kind === "sale" ? "بيع" : "شراء"} · {i.date} · {sar(i.total)}</span></a>)}</div>}
    </div>}
  </div>;
}
