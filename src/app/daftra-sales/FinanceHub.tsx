"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { computeFinance } from "@/lib/finance";
import { ExcelBtn, sar, short } from "./kit";
import { Sales, Book } from "./tabs";
import AdminSales from "../sales/AdminSales";

export type FinData = ReturnType<typeof computeFinance> & { ai?: boolean; link?: import("@/lib/fin-link").FinLink | null; docs?: { total: number; before_start: number; in_period: number }; sync: { started_at: string | null; finished_at: string | null; ok: boolean | null; message: string; invoices?: number; running: boolean }; today: string };
export type Tab = "sales" | "team" | "ar" | "settings";
export type Ask = (q: string) => void;
const TAB_IDS: Tab[] = ["sales", "team", "ar", "settings"];
const OLD_TAB: Record<string, Tab> = { workspace: "team", targets: "team", items: "settings", catalog: "settings", approvals: "settings", close: "settings", overview: "sales", goals: "sales", plan: "sales" };
const NO_RANGE: Partial<Record<Tab, boolean>> = { team: true, settings: true };
const tz = "Asia/Riyadh";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
const back = (months: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - months); return `${new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d).slice(0, 7)}-01`; };
const lastDay = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const PRESETS: Array<[string, () => [string, string]]> = [["الشهر ده", () => [`${today().slice(0, 7)}-01`, today()]], ["الشهر اللي فات", () => [back(1), lastDay(back(1).slice(0, 7))]], ["آخر 3 شهور", () => [back(2), today()]], ["آخر 6 شهور", () => [back(5), today()]], ["السنة دي", () => [`${today().slice(0, 4)}-01-01`, today()]], ["آخر 12 شهر", () => [back(11), today()]]];


export default function FinanceHub({ subdomain }: { subdomain: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("sales");
  const [preset, setPreset] = useState(0);
  const [range, setRange] = useState<[string, string]>(PRESETS[0][1]());
  const [d, setD] = useState<FinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch(`/api/admin/finance?from=${range[0]}&to=${range[1]}`).then(async r => (await r.json().catch(() => null)) ?? { error: `تعذر تحميل البيانات (خطأ ${r.status} من السيرفر)` }).catch(() => null);
    setLoading(false);
    if (j?.kpi) setD(j); else toast(j?.error || "تعذر تحميل البيانات", "error");
  }, [range, toast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!d?.sync?.running) return; const t = setTimeout(() => void load(), 6000); return () => clearTimeout(t); }, [d, load]);
  useEffect(() => {
    // deep links (/daftra-sales?tab=ar) win over the remembered tab; old tab names open the sales tab
    const pick = (t: string | null) => (TAB_IDS as string[]).includes(t || "") ? t as Tab : null;
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q) { setTab(pick(q) || OLD_TAB[q] || "sales"); return; }
    try { const t = pick(sessionStorage.getItem("fin-tab")); if (t) setTab(t); } catch { /* ignore */ }
  }, []);
  const go = (t: Tab) => { setTab(t); try { sessionStorage.setItem("fin-tab", t); } catch { /* ignore */ } };
  const ask: Ask = () => { window.open("https://finance.eliteskinsa.com", "_blank"); };
  const pickMonth = (m: string) => { setPreset(-1); setRange([`${m}-01`, lastDay(m)]); };
  async function sync() {
    setSyncing(true);
    const r = await fetch("/api/admin/daftra/sync", { method: "POST" }); const j = await r.json().catch(() => null); setSyncing(false);
    if (!r.ok) toast(j?.error || "تعذرت المزامنة", "error"); else { toast("تم تحديث البيانات من دفترة", "success"); await load(); }
  }
  const x = (section: string) => `/api/admin/finance/export?from=${range[0]}&to=${range[1]}&section=${section}`;
  const lastSync = d?.sync?.finished_at ? new Date(d.sync.finished_at).toLocaleString("ar-EG-u-nu-latn", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }) : "—";

  // ── the four linked parts, each a live button: number now, what it means, where it stands against the others
  const L = d?.link || null;
  const tone = (ok: boolean | null) => ok === null ? "text-[var(--muted)]" : ok ? "text-emerald-700" : "text-red-700";
  const cards: Array<{ id: Tab; label: string; icon: string; value: string; line: string; cls: string; bar: number | null; q: string }> = [
    { id: "sales", label: "المبيعات", icon: "sales", value: L ? sar(L.sales.mtd) : "—", line: L ? `بالمعدل ده هتقفل الشهر ${short(L.sales.projected)}` : "", cls: tone(null), bar: null,
      q: "لخّص لي وضع الشهر في 5 سطور: المبيعات لحد النهارده، هقفل على كام، بعيد قد إيه عن هدف الشهر وعن الخطة، والتحصيل المتأخر، وأهم 3 حاجات أعملها الأسبوع ده." },
    { id: "team", label: "الفريق", icon: "reps", value: L?.team?.total ? `${L.team.on_track} من ${L.team.total}` : "حدد الأهداف", line: L?.team?.total ? (L.team.behind.length ? `متأخر: ${L.team.behind.slice(0, 2).map(b => `${b.name.split(" ")[0]} ${b.pct}%`).join("، ")}` : "كل المناديب ماشيين على هدفهم") : "لسه مفيش أهداف شهرية للمناديب",
      cls: tone(L?.team?.total ? L.team.on_track === L.team.total : null), bar: L?.team?.total ? L.team.on_track / L.team.total * 100 : null,
      q: "مين من المناديب متأخر عن هدفه الشهر ده (نصيبه من الخطة) وليه؟ لكل واحد: باع كام من كام، وأنهي أصناف وعملاء يركز عليهم الأسبوع ده." },
    { id: "ar", label: "مديونيات العملاء", icon: "time", value: L ? sar(L.ar.overdue) : "—", line: L ? (L.ar.overdue ? `متأخر عند ${L.ar.clients} عميل · ${short(L.ar.old60)} أقدم من 60 يوم` : "مفيش متأخرات") : "", cls: tone(L ? L.ar.overdue === 0 : null), bar: L && L.ar.total ? L.ar.overdue / L.ar.total * 100 : null,
      q: "رتّب لي أهم 5 عملاء أحصّل منهم الأسبوع ده: كل واحد عليه كام ومتأخر قد إيه وأقول له إيه. وقولّي لو حصّلتهم يغطوا كام من الفرق عن هدف الشهر ومن مصاريف الخطة." },
  ];

  return <div className="mt-5 space-y-4 pb-20">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{cards.map(c => { const on = tab === c.id; return <div key={c.id} className={`relative overflow-hidden rounded-[22px] border bg-white transition ${on ? "border-[var(--navy)] shadow-lg ring-2 ring-[var(--navy)]/10" : "border-[var(--border)] hover:border-[var(--sky-border)]"}`}>
      <button type="button" onClick={() => go(c.id)} aria-pressed={on} className="block w-full p-4 pb-3 text-right">
        <span className="flex items-center gap-2 text-[13px] font-extrabold text-[var(--navy)]"><span className={`flex h-8 w-8 items-center justify-center rounded-xl ${on ? "bg-[var(--navy)] text-white" : "bg-[var(--sky-light)] text-[var(--navy)]"}`}><Icon name={c.icon} size={16} /></span>{c.label}</span>
        <span className={`mt-2 block text-2xl font-extrabold tabular-nums ${c.cls === "text-[var(--muted)]" ? "text-[var(--navy)]" : c.cls}`}>{c.value}</span>
        <span className="mt-0.5 block min-h-[2.25rem] text-[11.5px] leading-[1.15rem] text-[var(--muted)]">{c.line}</span>
        {c.bar !== null && <span className="relative mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--bg)]"><span className={`block h-full rounded-full ${c.id === "ar" ? "bg-red-500" : c.cls.includes("red") ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, Math.max(0, c.bar))}%` }} /></span>}
      </button>
    </div>; })}</div>

    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-white p-2.5">
      {!NO_RANGE[tab] && <>
        <div className="flex flex-wrap gap-1 rounded-xl bg-[var(--bg)] p-1">{PRESETS.map(([l, f], i) => <button key={l} type="button" onClick={() => { setPreset(i); setRange(f()); }} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${preset === i ? "bg-white text-[var(--navy)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--navy)]"}`}>{l}</button>)}</div>
        <div className="flex items-center gap-1 text-xs"><input type="date" value={range[0]} max={range[1]} onChange={e => { setPreset(-1); setRange([e.target.value, range[1]]); }} className="rounded-lg border border-[var(--border)] px-2 py-1.5" /><span className="text-[var(--muted)]">←</span><input type="date" value={range[1]} min={range[0]} onChange={e => { setPreset(-1); setRange([range[0], e.target.value]); }} className="rounded-lg border border-[var(--border)] px-2 py-1.5" /></div>
      </>}
      <div className="mr-auto flex items-center gap-2">
        <button type="button" onClick={() => go(tab === "settings" ? "sales" : "settings")} aria-pressed={tab === "settings"} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${tab === "settings" ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)] text-[var(--navy)] hover:bg-[var(--sky-light)]"}`}><Icon name="pen" size={14} />الموافقات والإعدادات</button>
        <span className="hidden items-center gap-1.5 text-[11px] text-[var(--muted)] sm:flex"><span className={`h-2 w-2 rounded-full ${d?.sync?.running ? "animate-pulse bg-amber-500" : d?.sync?.ok === false ? "bg-red-500" : "bg-emerald-500"}`} />{d?.sync?.running ? "جارٍ التحديث من دفترة…" : `آخر تحديث ${lastSync}`}</span>
        <button type="button" disabled={syncing} onClick={() => void sync()} className="flex items-center gap-1.5 rounded-xl bg-[var(--navy)] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"><span className={syncing ? "animate-spin" : ""}><Icon name="repeat" size={14} /></span>{syncing ? "جارٍ التحديث…" : "حدّث من دفترة"}</button>
        {!NO_RANGE[tab] && <ExcelBtn href={x(tab)} />}
      </div>
    </div>
    {d?.books_start && !NO_RANGE[tab] && tab !== "ar" && d.period.from > range[0] && <div className="rounded-xl bg-sky-50 px-3 py-2 text-[12px] font-bold text-sky-900 ring-1 ring-sky-200">الأرقام من {d.books_start} (بداية الحسابات)</div>}
    {d?.sync && !d.sync.running && !d.sync.finished_at && <div className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900 ring-1 ring-amber-200">لسه ماتسحبتش أي بيانات من دفترة — اضغط «حدّث من دفترة» واستنى دقيقة.</div>}
    {d?.sync?.ok && d.sync.invoices === 0 && <div className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900 ring-1 ring-amber-200">المزامنة نجحت بس دفترة رجّعت 0 فاتورة بيع — اتأكد إن مفتاح الـ API والـ subdomain بتوع نفس الحساب اللي فيه الفواتير.</div>}
    {d?.docs && d.docs.before_start > 0 && !NO_RANGE[tab] && tab !== "ar" && <div className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900 ring-1 ring-amber-200">{d.docs.before_start} من {d.docs.total} فاتورة بيع تاريخها قبل بداية الحسابات ({d.books_start}) فمش داخلة في الأرقام{d.docs.in_period === 0 ? " — ومفيش ولا فاتورة في الفترة المختارة" : ""}.</div>}
    {d?.sync?.ok === false && <div className="rounded-xl bg-red-50 p-3 text-xs text-red-800 ring-1 ring-red-200">آخر تحديث من دفترة فشل: {d.sync.message}</div>}
    {!d ? <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white" />)}</div>
      : <div className={`transition-opacity ${loading ? "opacity-50" : ""}`}>
        {tab === "sales" && <Sales d={d} pickMonth={pickMonth} x={x} subdomain={subdomain} ask={ask} go={go} />}
        {tab === "ar" && <Book d={d} subdomain={subdomain} ask={ask} />}
        {tab === "team" && <AdminSales only={["team", "targets"]} />}
        {tab === "settings" && <AdminSales only={["approvals", "items", "catalog", "close"]} />}
      </div>}

  </div>;
}
