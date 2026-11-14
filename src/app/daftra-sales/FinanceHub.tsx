"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { computeFinance } from "@/lib/finance";
import { ExcelBtn, sar, short } from "./kit";
import { Sales, Book } from "./tabs";
import { Planner } from "./plan";
import { GoalsTab } from "./goals";
import { AiAdvisor } from "./ai";

export type FinData = ReturnType<typeof computeFinance> & { prev?: import("@/lib/fin-ai").PrevKpi; ai?: boolean; link?: import("@/lib/fin-link").FinLink | null; sync: { started_at: string | null; finished_at: string | null; ok: boolean | null; message: string; running: boolean }; today: string };
export type Tab = "sales" | "ar" | "goals" | "plan";
export type Ask = (q: string) => void;
const TAB_IDS: Tab[] = ["sales", "ar", "goals", "plan"];
const NO_RANGE: Partial<Record<Tab, boolean>> = { plan: true, goals: true };
const tz = "Asia/Riyadh";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
const back = (months: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - months); return `${new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d).slice(0, 7)}-01`; };
const lastDay = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const PRESETS: Array<[string, () => [string, string]]> = [["الشهر ده", () => [`${today().slice(0, 7)}-01`, today()]], ["الشهر اللي فات", () => [back(1), lastDay(back(1).slice(0, 7))]], ["آخر 3 شهور", () => [back(2), today()]], ["آخر 6 شهور", () => [back(5), today()]], ["السنة دي", () => [`${today().slice(0, 4)}-01-01`, today()]], ["آخر 12 شهر", () => [back(11), today()]]];

/** Questions the advisor offers on each tab; every one ties the tab to the other three. */
const CHIPS: Record<Tab, string[]> = {
  sales: ["لخّص لي وضع الشهر: المبيعات والهدف والخطة والتحصيل", "أنهي منتجات وعملاء أركّز عليهم عشان أقفل الفرق عن الهدف؟", "مبيعاتي ماشية أحسن ولا أسوأ من الفترة اللي فاتت وليه؟"],
  ar: ["رتّب لي العملاء اللي أحصّل منهم الأسبوع ده وأقول لكل واحد إيه", "لو حصّلت المتأخر، يغطي كام من مصاريف خطة الشهر؟", "مين العملاء اللي أوقف البيع الآجل ليهم؟"],
  goals: ["هحقق هدف الشهر والسنة بالمعدل الحالي؟ ولو لأ أعمل إيه؟", "هدف السنة واقعي على أرقامي؟", "وزّع لي المطلوب يومياً على المنتجات والعملاء"],
  plan: ["راجع خطة الشهر: واقعية؟ وفين الخطر؟", "أنهي أصناف في الخطة محتاجة دفعة وأبيعها لمين؟", "قارن الخطة بالمبيعات الفعلية لحد النهارده"],
};

export default function FinanceHub({ subdomain }: { subdomain: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("sales");
  const [preset, setPreset] = useState(0);
  const [range, setRange] = useState<[string, string]>(PRESETS[0][1]());
  const [d, setD] = useState<FinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [aiOpen, setAiOpen] = useState(false); const [asked, setAsked] = useState<{ q: string; n: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch(`/api/admin/finance?from=${range[0]}&to=${range[1]}`).then(r => r.json()).catch(() => null);
    setLoading(false);
    if (j?.kpi) setD(j); else toast(j?.error || "تعذر تحميل البيانات", "error");
  }, [range, toast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!d?.sync?.running) return; const t = setTimeout(() => void load(), 6000); return () => clearTimeout(t); }, [d, load]);
  useEffect(() => {
    // deep links (/daftra-sales?tab=ar) win over the remembered tab; old tab names open the sales tab
    const pick = (t: string | null) => (TAB_IDS as string[]).includes(t || "") ? t as Tab : null;
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q) { setTab(pick(q) || "sales"); return; }
    try { const t = pick(sessionStorage.getItem("fin-tab")); if (t) setTab(t); } catch { /* ignore */ }
  }, []);
  const go = (t: Tab) => { setTab(t); try { sessionStorage.setItem("fin-tab", t); } catch { /* ignore */ } };
  const ask: Ask = q => { setAiOpen(true); setAsked(a => ({ q, n: (a?.n || 0) + 1 })); };
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
    { id: "ar", label: "مديونيات العملاء", icon: "time", value: L ? sar(L.ar.overdue) : "—", line: L ? (L.ar.overdue ? `متأخر عند ${L.ar.clients} عميل · ${short(L.ar.old60)} أقدم من 60 يوم` : "مفيش متأخرات") : "", cls: tone(L ? L.ar.overdue === 0 : null), bar: L && L.ar.total ? L.ar.overdue / L.ar.total * 100 : null,
      q: "رتّب لي أهم 5 عملاء أحصّل منهم الأسبوع ده: كل واحد عليه كام ومتأخر قد إيه وأقول له إيه. وقولّي لو حصّلتهم يغطوا كام من الفرق عن هدف الشهر ومن مصاريف الخطة." },
    { id: "goals", label: "الأهداف السنوية", icon: "trophy", value: L?.goals ? `${L.goals.month_pct ?? 0}%` : "حط أهدافك", line: L?.goals ? (L.goals.month_target ? `من هدف الشهر ${short(L.goals.month_target)} · محتاج ${short(L.goals.needed_per_day)} في اليوم` : "مفيش هدف للشهر ده") : "لسه مفيش أهداف للسنة",
      cls: tone(L?.goals?.month_pct != null ? L.goals.month_pct >= L.pace_pct : null), bar: L?.goals?.month_pct ?? null,
      q: L?.goals ? "هحقق هدف الشهر وهدف السنة بالمعدل الحالي؟ لو لأ، الفرق كام وأقفله بأنهي منتجات وأنهي عملاء؟" : "اقترح عليّ أهداف واقعية للسنة مبنية على أرقامي، وقولّي أحطها إزاي." },
    { id: "plan", label: "خطة الشهر", icon: "plans", value: L?.plan ? `${L.plan.pct ?? 0}%` : "اعمل الخطة", line: L?.plan ? `من خطة ${short(L.plan.revenue)} · ربح مخطط ${short(L.plan.profit)}` : "لسه مفيش خطة للشهر ده",
      cls: tone(L?.plan?.pct != null ? L.plan.pct >= L.pace_pct : null), bar: L?.plan?.pct ?? null,
      q: L?.plan ? "راجع خطة الشهر مقابل الفعلي لحد النهارده: ماشي عليها ولا متأخر؟ وأنهي أصناف محتاجة دفعة وأبيعها لمين؟" : "ساعدني أعمل خطة الشهر: أبيع كام من كل صنف عشان أغطي مصاريفي وأحقق ربح معقول؟" },
  ];

  return <div className="mt-5 space-y-4 pb-20">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(c => { const on = tab === c.id; return <div key={c.id} className={`relative overflow-hidden rounded-[22px] border bg-white transition ${on ? "border-[var(--navy)] shadow-lg ring-2 ring-[var(--navy)]/10" : "border-[var(--border)] hover:border-[var(--sky-border)]"}`}>
      <button type="button" onClick={() => go(c.id)} aria-pressed={on} className="block w-full p-4 pb-3 text-right">
        <span className="flex items-center gap-2 text-[13px] font-extrabold text-[var(--navy)]"><span className={`flex h-8 w-8 items-center justify-center rounded-xl ${on ? "bg-[var(--navy)] text-white" : "bg-[var(--sky-light)] text-[var(--navy)]"}`}><Icon name={c.icon} size={16} /></span>{c.label}</span>
        <span className={`mt-2 block text-2xl font-extrabold tabular-nums ${c.cls === "text-[var(--muted)]" ? "text-[var(--navy)]" : c.cls}`}>{c.value}</span>
        <span className="mt-0.5 block min-h-[2.25rem] text-[11.5px] leading-[1.15rem] text-[var(--muted)]">{c.line}</span>
        {c.bar !== null && <span className="relative mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--bg)]"><span className={`block h-full rounded-full ${c.id === "ar" ? "bg-red-500" : c.cls.includes("red") ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, Math.max(0, c.bar))}%` }} />
          {c.id !== "ar" && L && <span className="absolute inset-y-0 w-0.5 bg-[var(--navy)]" style={{ right: `${L.pace_pct}%` }} title="المفروض توصل له النهارده" />}</span>}
      </button>
      <button type="button" onClick={() => ask(c.q)} className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--border)] bg-[var(--bg)] py-2 text-[12px] font-bold text-[var(--navy)] transition hover:bg-[var(--sky-light)]"><Icon name="sparkle" size={13} />اسأل المستشار</button>
    </div>; })}</div>

    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-white p-2.5">
      {!NO_RANGE[tab] && <>
        <div className="flex flex-wrap gap-1 rounded-xl bg-[var(--bg)] p-1">{PRESETS.map(([l, f], i) => <button key={l} type="button" onClick={() => { setPreset(i); setRange(f()); }} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${preset === i ? "bg-white text-[var(--navy)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--navy)]"}`}>{l}</button>)}</div>
        <div className="flex items-center gap-1 text-xs"><input type="date" value={range[0]} max={range[1]} onChange={e => { setPreset(-1); setRange([e.target.value, range[1]]); }} className="rounded-lg border border-[var(--border)] px-2 py-1.5" /><span className="text-[var(--muted)]">←</span><input type="date" value={range[1]} min={range[0]} onChange={e => { setPreset(-1); setRange([range[0], e.target.value]); }} className="rounded-lg border border-[var(--border)] px-2 py-1.5" /></div>
      </>}
      <div className="mr-auto flex items-center gap-2">
        <span className="hidden items-center gap-1.5 text-[11px] text-[var(--muted)] sm:flex"><span className={`h-2 w-2 rounded-full ${d?.sync?.running ? "animate-pulse bg-amber-500" : d?.sync?.ok === false ? "bg-red-500" : "bg-emerald-500"}`} />{d?.sync?.running ? "جارٍ التحديث من دفترة…" : `آخر تحديث ${lastSync}`}</span>
        <button type="button" disabled={syncing} onClick={() => void sync()} className="flex items-center gap-1.5 rounded-xl bg-[var(--navy)] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"><span className={syncing ? "animate-spin" : ""}><Icon name="repeat" size={14} /></span>{syncing ? "جارٍ التحديث…" : "حدّث من دفترة"}</button>
        {!NO_RANGE[tab] && <ExcelBtn href={x(tab)} />}
      </div>
    </div>
    {d?.books_start && !NO_RANGE[tab] && tab !== "ar" && d.period.from > range[0] && <div className="rounded-xl bg-sky-50 px-3 py-2 text-[12px] font-bold text-sky-900 ring-1 ring-sky-200">الأرقام من {d.books_start} (بداية الحسابات)</div>}
    {d?.sync?.ok === false && <div className="rounded-xl bg-red-50 p-3 text-xs text-red-800 ring-1 ring-red-200">آخر تحديث من دفترة فشل: {d.sync.message}</div>}
    {!d ? <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white" />)}</div>
      : <div className={`transition-opacity ${loading ? "opacity-50" : ""}`}>
        {tab === "sales" && <Sales d={d} pickMonth={pickMonth} x={x} subdomain={subdomain} ask={ask} go={go} />}
        {tab === "ar" && <Book d={d} subdomain={subdomain} ask={ask} />}
        {tab === "goals" && <GoalsTab ask={ask} />}
        {tab === "plan" && <Planner />}
      </div>}

    {mounted && d && createPortal(<div dir="rtl">
      {!aiOpen && <button type="button" onClick={() => setAiOpen(true)} className="fixed bottom-20 left-4 z-[70] flex h-13 items-center gap-2 rounded-full bg-[var(--navy)] px-5 py-3.5 text-sm font-extrabold text-white shadow-2xl transition hover:-translate-y-0.5 lg:bottom-6"><Icon name="sparkle" size={18} />المستشار</button>}
      {aiOpen && <button type="button" aria-label="إغلاق" onClick={() => setAiOpen(false)} className="fixed inset-0 z-[75] bg-[#0b1d20]/35 lg:hidden" />}
      <aside aria-hidden={!aiOpen} className={`fixed inset-y-0 left-0 z-[80] flex w-[min(460px,100vw)] flex-col bg-white shadow-2xl transition-transform duration-200 ${aiOpen ? "translate-x-0" : "invisible -translate-x-full"}`}>
        <div className="flex items-center justify-between gap-2 bg-[var(--navy)] px-4 py-3 text-white"><span className="flex items-center gap-2 font-extrabold"><Icon name="sparkle" size={18} />المستشار المالي</span>
          <button type="button" onClick={() => setAiOpen(false)} aria-label="إغلاق" className="grid h-9 w-9 place-items-center rounded-full text-lg hover:bg-white/15">✕</button></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3"><AiAdvisor d={d} range={range} reload={load} chips={CHIPS[tab]} ask={asked} /></div>
      </aside>
    </div>, document.body)}
  </div>;
}
