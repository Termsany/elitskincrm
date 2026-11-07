"use client";
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { actionRequest, fetchForecast, fetchPreviousMonthLines, fetchSourceSales, postForecastAction, riyadhMonth, type ForecastData } from "../forecast/ForecastClient";
import { fetchTargetPlan, targetRequest, type TargetPlanningClient } from "../forecast/TargetPlanningClient";

type Line = { clinic_id: string; product_id: string; qty: number; unit_price?: string };
type Sale = ForecastData["sales"][number];
type HubMonth = { month: string; target: number; actual: number; actual_qty: number; forecast: number; allocated: boolean };
type Hub = { year: number; nowMonth: string; annual: number; monthly: HubMonth[]; pending: { forecasts: number; sales: number; targets: number }; byProduct: Array<{ name: string; value: number; qty: number }>; byClinic: Array<{ name: string; city: string | null; value: number; qty: number }> };
type Plan = ComponentProps<typeof TargetPlanningClient>["data"];
type Tab = "month" | "forecast" | "targets" | "year";

const L = "ar-EG-u-nu-latn";
const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} ر.س`;
const short = (n: number) => Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)} مليون` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(n % 1e3 ? 1 : 0)} ألف` : Math.round(n).toLocaleString("en-US");
const mName = (m: string, long = true) => new Intl.DateTimeFormat(L, { month: long ? "long" : "short", ...(long ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
const shiftM = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const pct = (a: number, b: number) => b ? Math.round(a / b * 100) : 0;
const ST: Record<string, [string, string]> = { approved: ["معتمد", "bg-emerald-50 text-emerald-700 ring-emerald-200"], pending: ["مستني موافقة", "bg-amber-50 text-amber-800 ring-amber-200"], submitted: ["مستني موافقة", "bg-amber-50 text-amber-800 ring-amber-200"], rejected: ["مرفوض", "bg-red-50 text-red-700 ring-red-200"], draft: ["مسودة", "bg-slate-100 text-slate-600 ring-slate-200"], change_requested: ["طلب تعديل", "bg-sky-50 text-sky-800 ring-sky-200"], closed: ["مقفول", "bg-slate-100 text-slate-600 ring-slate-200"] };
const Pill = ({ s, t }: { s: string; t?: string }) => { const [l, c] = ST[s] || [s, "bg-slate-100 text-slate-600 ring-slate-200"]; return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${c}`}>{t || l}</span>; };

function useCount(v: number, ms = 900) {
  const [n, setN] = useState(0);
  useEffect(() => { if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(v); return; } let raf = 0; const t0 = performance.now(); const step = (t: number) => { const p = Math.min(1, (t - t0) / ms); setN(v * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, [v, ms]);
  return n;
}
function Ring({ value, marker, size = 128, color = ["#33b3a6", "#10484f"], children }: { value: number; marker?: number; size?: number; color?: [string, string]; children: React.ReactNode }) {
  const sw = 11, r = (size - sw) / 2, c = 2 * Math.PI * r, v = useCount(Math.min(100, Math.max(0, value)));
  const id = `rg${size}${color[0].slice(1)}`;
  return <div className="relative shrink-0" style={{ width: size, height: size }}>
    <svg width={size} height={size} className="-rotate-90"><defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={color[0]} /><stop offset="100%" stopColor={color[1]} /></linearGradient></defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f5" strokeWidth={sw} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={sw} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />
      {marker !== undefined && marker > 0 && <circle cx={size / 2 + r * Math.cos(2 * Math.PI * Math.min(1, marker / 100))} cy={size / 2 + r * Math.sin(2 * Math.PI * Math.min(1, marker / 100))} r={4.5} fill="#e99608" stroke="#fff" strokeWidth={2}><title>المفروض توصل له النهارده</title></circle>}
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">{children}</div>
  </div>;
}
const tone = (p: number, pace: number) => p >= pace ? { l: "على المسار ✓", c: "bg-emerald-50 text-emerald-700 ring-emerald-200", ring: ["#33b3a6", "#1aa865"] as [string, string] } : p >= pace - 15 ? { l: "قريب من المسار", c: "bg-amber-50 text-amber-800 ring-amber-200", ring: ["#f2b544", "#e99608"] as [string, string] } : { l: "محتاج تسرّع", c: "bg-red-50 text-red-700 ring-red-200", ring: ["#ff8c50", "#e1483e"] as [string, string] };

export default function RepSales() {
  const toast = useToast();
  const nowM = riyadhMonth(new Date());
  const [month, setMonth] = useState(nowM);
  const [tab, setTab] = useState<Tab>("month");
  const [hub, setHub] = useState<Hub | null>(null);
  const [fd, setFd] = useState<ForecastData | null>(null);
  const [plan, setPlan] = useState<Plan>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [tp, setTp] = useState<Array<{ period: string; product: string; quantity: number; amount: number }>>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const year = Number(month.slice(0, 4));

  const load = useCallback(async () => {
    setErr("");
    try {
      const [h, f, p] = await Promise.all([
        fetch(`/api/sales/hub?year=${year}`, { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject(new Error("تعذر تحميل المبيعات"))),
        fetchForecast(month, "sales_rep") as Promise<ForecastData>, fetchTargetPlan(month, "sales_rep"),
      ]);
      setHub(h); setFd(f); setPlan(p as Plan); setLines((f.forecast?.lines ?? []).map(x => ({ ...x })));
      fetch(`/api/sales/target-products?year=${year}`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => j && setTp(j.lines || [])).catch(() => {});
    } catch (e) { setErr(e instanceof Error ? e.message : "تعذر التحميل"); }
  }, [month, year]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { try { const t = sessionStorage.getItem("rep-sales-tab") as Tab | null; if (t && ["month", "forecast", "targets", "year"].includes(t)) setTab(t); } catch { /* */ } }, []);
  const go = (t: Tab) => { setTab(t); try { sessionStorage.setItem("rep-sales-tab", t); } catch { /* */ } };

  async function act(name: string, extra: Record<string, unknown> = {}, ok = "اتحفظ ✓") {
    setBusy(true);
    try {
      const payload = name === "request_change" ? { ...extra, lines } : extra;
      if (Array.isArray(payload.lines)) payload.lines = (payload.lines as Line[]).filter(x => x.qty > 0);
      const rq = actionRequest("sales_rep", name, payload, month); await postForecastAction(rq.url, rq.body);
      toast(ok, "success"); await load(); return true;
    } catch (e) { toast(e instanceof Error ? e.message : "تعذر الحفظ", "error"); return false; } finally { setBusy(false); }
  }
  async function targetAct(name: string, extra: Record<string, unknown>) {
    setBusy(true);
    try { const rq = targetRequest("sales_rep", name, extra, month); await postForecastAction(rq.url, rq.body); toast("اتبعت للمراجعة ✓", "success"); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : "تعذر الحفظ", "error"); } finally { setBusy(false); }
  }

  if (err && !fd) return <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-6 text-center"><div className="font-bold text-red-800">{err}</div><button type="button" onClick={() => void load()} className="mt-3 rounded-xl bg-[var(--navy)] px-4 py-2 text-sm font-bold text-white">إعادة المحاولة</button></div>;
  if (!hub || !fd) return <div className="mt-4 grid gap-3 lg:grid-cols-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-40 animate-pulse rounded-[28px] bg-white" />)}</div>;

  // ── derived ──
  const cur = hub.nowMonth;
  const past = hub.monthly.filter(m => m.month <= cur);
  const ytd = past.reduce((a, m) => a + m.actual, 0);
  const yearPace = (() => { const d = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date())}T12:00:00Z`); const y = hub.year; if (y < d.getUTCFullYear()) return 100; if (y > d.getUTCFullYear()) return 0; return Math.round((d.getTime() - Date.UTC(y, 0, 1)) / (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) * 100); })();
  const yp = pct(ytd, hub.annual), yT = tone(yp, yearPace);
  const monthsLeft = hub.year === Number(cur.slice(0, 4)) ? 12 - Number(cur.slice(5, 7)) + 1 : 0;
  const need = hub.annual > ytd && monthsLeft ? (hub.annual - ytd) / monthsLeft : 0;
  const s = fd.summary;
  const tv = Number(s.target_value || 0), av = Number(s.actual_value || 0), tq = Number(s.target_qty || 0), sq = Number(s.sold_qty || 0);
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const monthPace = month < nowM ? 100 : month > nowM ? 0 : Math.round((days - Number(s.days_remaining || 0)) / days * 100);
  const mp = tv ? pct(av, tv) : pct(sq, tq), mT = tone(mp, monthPace);
  const status = fd.forecast?.status ?? "draft";
  const isNow = month === nowM;
  const editable = isNow && !fd.is_closed && (status === "draft" || (status === "rejected" && !fd.approved_baseline) || !fd.forecast);
  const canChange = isNow && !fd.is_closed && (status === "approved" || (status === "rejected" && !!fd.approved_baseline));
  const pendingSales = fd.sales.filter(x => x.status === "pending").length, rejectedSales = fd.sales.filter(x => x.status === "rejected").length;
  const rp = plan as unknown as { annual_target?: number | string | null; year_plan?: { status: string } | null; approved_year_plan?: { status: string } | null; months?: Array<{ month: string; amount: number | string }>; breakdowns?: Array<{ month: string; status: string }> } | null;
  const monthTarget = Number(rp?.months?.find(m => m.month === month)?.amount ?? 0);
  const bd = rp?.breakdowns?.find(b => b.month === month);

  // ── next steps (removes the guesswork) ──
  const steps: Array<{ icon: string; color: string; title: string; text: string; tab?: Tab; level: "do" | "wait" | "bad" | "ok" }> = [];
  if (rp && Number(rp.annual_target || 0) > 0 && !rp.approved_year_plan && rp.year_plan?.status !== "pending") steps.push({ icon: "calendar", color: "#e99608", title: "وزّع هدفك السنوي على الشهور", text: `هدفك السنة دي ${money(Number(rp.annual_target))} — قسّمه على الشهور وابعته للمدير`, tab: "targets", level: "do" });
  if (rp?.year_plan?.status === "pending") steps.push({ icon: "time", color: "#3b90e8", title: "توزيعك السنوي مستني موافقة المدير", text: "هيتعتمد أو يرجعلك بملاحظة", tab: "targets", level: "wait" });
  if (monthTarget > 0 && (!bd || bd.status === "rejected" || bd.status === "draft")) steps.push({ icon: "plans", color: "#e99608", title: `فصّل هدف ${mName(month, false)} على العيادات والمنتجات`, text: `هدف الشهر ${money(monthTarget)}${bd?.status === "rejected" ? " — التفصيل اترفض، عدّله" : ""}`, tab: "targets", level: bd?.status === "rejected" ? "bad" : "do" });
  if (isNow && fd.is_late && (!fd.forecast || status === "draft")) steps.push({ icon: "flag", color: "#c92f36", title: "فات ميعاد إرسال التوقع (يوم 3)", text: "اطلب استثناء من المدير عشان تقدر تبعته", tab: "forecast", level: "bad" });
  else if (editable) steps.push({ icon: "send", color: "#10484f", title: status === "rejected" ? "توقعك اترفض — عدّله وابعته تاني" : "ابعت توقعك للشهر", text: fd.forecast?.rejection_reason ? `السبب: ${fd.forecast.rejection_reason}` : "قبل يوم 3 من الشهر — كام وحدة متوقع تبيع في كل عيادة", tab: "forecast", level: status === "rejected" ? "bad" : "do" });
  if (status === "pending" || status === "submitted") steps.push({ icon: "time", color: "#3b90e8", title: "توقعك مستني موافقة المدير", text: fd.forecast?.review_due_at ? `المراجعة قبل ${fd.forecast.review_due_at}` : "", tab: "forecast", level: "wait" });
  if (rejectedSales) steps.push({ icon: "flag", color: "#c92f36", title: `${rejectedSales} بيع اترفض`, text: "افتح مبيعاتك وشوف السبب", tab: "month", level: "bad" });
  if (pendingSales) steps.push({ icon: "time", color: "#3b90e8", title: `${pendingSales} بيع مستني موافقة`, text: "مش هيدخل في المحقق غير بعد الاعتماد", tab: "month", level: "wait" });
  if ((s.late_clinics?.length ?? 0) > 0) steps.push({ icon: "doctors", color: "#e16201", title: `${s.late_clinics!.length} عيادة متأخرة عن هدفها`, text: s.late_clinics!.slice(0, 3).map(c => c.name).join("، "), tab: "month", level: "bad" });

  const TABS: Array<[Tab, string, string, number]> = [["month", "الشهر ده", "sales", pendingSales + rejectedSales], ["forecast", "توقعي", "send", editable || status === "rejected" ? 1 : 0], ["targets", "أهدافي", "trophy", steps.filter(x => x.tab === "targets" && x.level !== "wait").length], ["year", "السنة كلها", "reports", 0]];

  return <div className="mt-4 space-y-4 pb-24 lg:pb-6">
    {/* ── hero: year + month ── */}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <button type="button" onClick={() => go("year")} className="dz-card dz-in group relative overflow-hidden rounded-[28px] border border-[var(--border)] bg-white p-5 text-right" style={{ "--d": "0ms" } as React.CSSProperties}>
        <div className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-[var(--sky-soft)] transition-transform duration-700 group-hover:scale-110" />
        <div className="relative flex items-start justify-between gap-2"><div><div className="text-xs font-bold text-[var(--muted)]">هدفك السنوي {hub.year}</div>{hub.annual > 0 && <span className={`mt-1.5 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ring-1 ${yT.c}`}>{yT.l}</span>}</div><span className="dz-ico dz-rise !h-10 !w-10" style={{ color: "#1aa865", background: "linear-gradient(140deg,#1aa8652e,#1aa8650f)" }}><Icon name="trophy" size={19} /></span></div>
        <div className="relative mt-3 flex items-center gap-5">
          <Ring value={yp} marker={hub.annual ? yearPace : undefined} color={yT.ring}><span className="text-3xl font-extrabold text-[var(--navy)]">{yp}%</span><span className="mt-1 text-[10px] text-[var(--muted)]">من الهدف</span></Ring>
          <div className="min-w-0 flex-1 space-y-2">
            <Row l="المحقق" v={money(ytd)} c="text-emerald-700 text-lg" /><Row l="الهدف" v={hub.annual ? money(hub.annual) : "لسه ما اتحددش"} /><Row l="الباقي" v={hub.annual ? money(Math.max(0, hub.annual - ytd)) : "—"} c="text-[#c2410c]" />
            {need > 0 && <div className="rounded-xl bg-[var(--bg)] px-3 py-1.5 text-[11.5px]">محتاج <b className="text-[var(--navy)]">{money(need)}</b> كل شهر</div>}
            <Units rows={tp.filter(t => t.period === String(hub.year))} />
          </div>
        </div>
      </button>
      <div className="dz-card dz-in relative overflow-hidden rounded-[28px] border border-[var(--border)] bg-white p-5" style={{ "--d": "80ms" } as React.CSSProperties}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-[var(--bg)] p-1"><button type="button" aria-label="الشهر السابق" onClick={() => setMonth(m => shiftM(m, -1))} className="h-8 w-8 rounded-lg text-sm font-bold hover:bg-white">›</button><span className="px-2 text-sm font-extrabold text-[var(--navy)]">{mName(month)}</span><button type="button" aria-label="الشهر التالي" disabled={month >= nowM} onClick={() => setMonth(m => shiftM(m, 1))} className="h-8 w-8 rounded-lg text-sm font-bold hover:bg-white disabled:opacity-30">‹</button></div>
          <div className="flex items-center gap-2">{isNow && <span className="text-[11px] text-[var(--muted)]">باقي {s.days_remaining ?? 0} يوم</span>}<Pill s={fd.is_closed ? "closed" : status} t={fd.is_closed ? "الشهر مقفول" : `التوقع: ${(ST[status] || [status])[0]}`} /></div>
        </div>
        <div className="mt-3 flex items-center gap-5">
          <Ring value={mp} marker={isNow ? monthPace : undefined} color={mT.ring}><span className="text-3xl font-extrabold text-[var(--navy)]">{mp}%</span><span className="mt-1 text-[10px] text-[var(--muted)]">{tv ? "من هدف الشهر" : "من الوحدات"}</span></Ring>
          <div className="min-w-0 flex-1 space-y-2">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ring-1 ${mT.c}`}>{mT.l}</span>
            <Row l="بعت (معتمد)" v={money(av)} c="text-emerald-700 text-lg" /><Row l="هدف الشهر" v={tv ? money(tv) : monthTarget ? money(monthTarget) : "—"} />
            <div className="text-[11.5px] text-[var(--muted)]">{sq.toLocaleString("en-US")} من {tq.toLocaleString("en-US")} وحدة{isNow && s.pacing_qty ? ` · المفروض لحد النهارده ${s.pacing_qty}` : ""}</div>
            <Units rows={tp.filter(t => t.period === month)} />
          </div>
        </div>
        <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className="dz-grow-x h-full rounded-full" style={{ width: `${Math.min(100, mp)}%`, background: `linear-gradient(to left, ${mT.ring[0]}, ${mT.ring[1]})` }} />{isNow && <span className="absolute inset-y-0 w-0.5 bg-[var(--navy)]" style={{ right: `${monthPace}%` }} />}</div>
      </div>
    </div>

    {/* ── what to do next ── */}
    <section className="dz-in rounded-[28px] border border-[var(--border)] bg-white p-4" style={{ "--d": "140ms" } as React.CSSProperties}>
      <div className="mb-2 flex items-center gap-2 font-extrabold text-[var(--navy)]"><Icon name="sparkle" size={18} />خطوتك الجاية</div>
      {!steps.length ? <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ كله تمام — سجّل مبيعاتك أول بأول من «الشهر ده»</div>
        : <div className="grid gap-2 sm:grid-cols-2">{steps.slice(0, 6).map((x, k) => <button key={k} type="button" onClick={() => x.tab && go(x.tab)} className={`group flex items-center gap-3 rounded-2xl border p-3 text-right transition hover:-translate-y-0.5 hover:shadow-md ${x.level === "bad" ? "border-red-200 bg-red-50/60" : x.level === "do" ? "border-amber-200 bg-amber-50/60" : "border-sky-200 bg-sky-50/50"}`}>
          <span className="dz-ico dz-bob !h-10 !w-10 !rounded-xl" style={{ color: x.color, background: `${x.color}1f` }}><Icon name={x.icon} size={18} /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-[var(--ink)]">{x.title}</span>{x.text && <span className="block truncate text-[11px] text-[var(--muted)]">{x.text}</span>}</span>
          {x.tab && <span className="text-[var(--muted)] transition group-hover:-translate-x-1">‹</span>}
        </button>)}</div>}
    </section>

    {/* ── tabs ── */}
    <div className="tabs-bar z-20 -mx-4 bg-[var(--bg)]/90 px-4 py-1.5 backdrop-blur sm:mx-0 sm:px-0 lg:sticky lg:top-0">
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white p-1.5">{TABS.map(([k, l, i, n]) => <button key={k} type="button" onClick={() => go(k)} className={`relative flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-bold transition ${tab === k ? "bg-[var(--navy)] text-white shadow" : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--navy)]"}`}><Icon name={i} size={16} />{l}{n > 0 && <span className={`rounded-full px-1.5 text-[10px] font-extrabold ${tab === k ? "bg-white/25" : "bg-amber-100 text-amber-800"}`}>{n}</span>}</button>)}</div>
    </div>

    <div key={tab} className="dz-in">
      {tab === "month" && <MonthTab fd={fd} />}
      {tab === "forecast" && <ForecastTab fd={fd} lines={lines} setLines={setLines} editable={editable} canChange={canChange} busy={busy} month={month}
        onSave={() => act("save", { lines }, "اتحفظت المسودة ✓")} onSubmit={() => act("submit", { lines }, "اتبعت التوقع للمدير ✓")} onChange={(reason) => act("request_change", { reason }, "اتبعت طلب التعديل ✓")}
        onCopy={async () => { setBusy(true); try { setLines(await fetchPreviousMonthLines(month)); toast("اتنسخ توقع الشهر اللي فات — راجعه واحفظ", "success"); } catch (e) { toast(e instanceof Error ? e.message : "تعذر النسخ", "error"); } finally { setBusy(false); } }} />}
      {tab === "targets" && (plan ? <TargetsTab plan={plan as unknown as RepPlanT} fd={fd} month={month} busy={busy} onAction={(n, b) => void targetAct(n, b)} /> : <div className={`${card} text-center text-sm text-[var(--muted)]`}>مفيش بيانات أهداف</div>)}
      {tab === "year" && <YearTab hub={hub} onMonth={(m) => { setMonth(m); go("month"); }} />}
    </div>
  </div>;
}

const Units = ({ rows }: { rows: Array<{ product: string; quantity: number }> }) => rows.length ? <div className="flex flex-wrap gap-1">{rows.map(r => <span key={r.product} className="rounded-full bg-[var(--sky-light)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--navy)] ring-1 ring-[var(--sky-border)]" title="هدف حدده المدير">🎯 {r.product} · {r.quantity.toLocaleString("en-US")} وحدة</span>)}</div> : null;
const Row = ({ l, v, c = "" }: { l: string; v: string; c?: string }) => <div className="flex items-baseline justify-between gap-2"><span className="text-[11px] font-bold text-[var(--muted)]">{l}</span><b className={`text-sm font-extrabold text-[var(--navy)] ${c}`}>{v}</b></div>;
const card = "rounded-[28px] border border-[var(--border)] bg-white p-4 sm:p-5";
const clinicName = (fd: ForecastData, id: string) => { const c = fd.clinics.find(x => x.id === id); return c ? `${c.name}${c.city ? ` — ${c.city}` : ""}` : "—"; };
// clinic special price first, then the product list price set by the admin
const priceOf = (fd: ForecastData, c: string, p: string) => Number(fd.prices.find(x => x.clinic_id === c && x.product_id === p)?.price ?? (fd.products.find(x => x.id === p) as { unit_price?: number | string | null } | undefined)?.unit_price ?? 0);

/* ═════ الشهر ده: سجّل بيع + مبيعاتي ═════ */
function MonthTab({ fd }: { fd: ForecastData }) {
  const sales = [...fd.sales].sort((a, b) => (a.status === "rejected" ? -1 : 0) - (b.status === "rejected" ? -1 : 0));
  return <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
    <section className={card}>
      <h3 className="mb-3 flex items-center gap-2 font-extrabold text-[var(--navy)]"><Icon name="receipt" size={18} />مبيعاتك من دفترة</h3>
      <div className="space-y-2 text-[13px] leading-6 text-[var(--ink-soft)]">
        <p>المحقق بيتحسب تلقائياً من <b>فواتير دفترة</b> لعملاءك — مفيش تسجيل يدوي ولا انتظار اعتماد.</p>
        <p className="rounded-2xl bg-[var(--sky-light)] p-3 text-xs">لو فاتورة عميلك مش ظاهرة هنا، يبقى العميل لسه مش مربوط بيك في دفترة — كلّم المدير يربطه.</p>
      </div>
    </section>
    <section className={card}>
      <h3 className="mb-3 flex items-center justify-between gap-2 font-extrabold text-[var(--navy)]"><span className="flex items-center gap-2"><Icon name="receipt" size={18} />فواتير الشهر</span><span className="text-xs font-bold text-[var(--muted)]">{fd.sales.length} عملية</span></h3>
      {!sales.length ? <div className="rounded-2xl border border-dashed border-[var(--border-strong)] p-8 text-center text-sm text-[var(--muted)]">لسه مفيش فواتير الشهر ده لعملاءك في دفترة</div>
        : <div className="max-h-[420px] space-y-1.5 overflow-y-auto">{sales.map(x => { const sx = x as Sale & { review_note?: string; quantity?: number }; const neg = x.kind === "return" || x.direction === -1; const val = x.qty * Number(x.unit_price ?? priceOf(fd, x.clinic_id, x.product_id)); return <div key={x.id} className={`rounded-xl border px-3 py-2 ${x.status === "rejected" ? "border-red-200 bg-red-50/50" : "border-[var(--border)]"}`}>
          <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-sm font-bold" dir="auto">{(x as { client_name?: string }).client_name || clinicName(fd, x.clinic_id)}</span>{(x as { invoice_no?: string }).invoice_no ? <span className="shrink-0 text-[11px] text-[var(--muted)]">فاتورة {(x as { invoice_no?: string }).invoice_no}</span> : <Pill s={x.status} />}</div>
          <div className="mt-0.5 flex flex-wrap justify-between gap-2 text-[11px] text-[var(--muted)]"><span dir="auto">{fd.products.find(p => p.id === x.product_id)?.name || (x as { item?: string }).item} · {neg ? "−" : ""}{x.qty} وحدة{x.kind === "return" ? " · مرتجع" : x.kind === "adjustment" ? " · تصحيح" : ""}</span><b className={neg ? "text-red-700" : "text-[var(--navy)]"}>{neg ? "−" : ""}{money(val)}</b></div>
          {x.status === "rejected" && sx.review_note && <div className="mt-1 text-[11px] font-bold text-red-700">السبب: {sx.review_note}</div>}
        </div>; })}</div>}
    </section>
  </div>;
}

function Stepper({ v, set, min = 0 }: { v: number; set: (n: number) => void; min?: number }) {
  return <div className="flex items-center overflow-hidden rounded-xl ring-1 ring-[var(--border)]"><button type="button" onClick={() => set(Math.max(min, v - 1))} className="h-10 w-10 text-lg font-bold text-[var(--navy)] hover:bg-[var(--bg)]">−</button><input type="number" inputMode="numeric" min={min} value={v} onChange={e => { const n = Math.floor(Number(e.target.value)); if (Number.isFinite(n) && n >= min) set(n); }} className="h-10 w-16 border-x border-[var(--border)] text-center text-sm font-extrabold" /><button type="button" onClick={() => set(v + 1)} className="h-10 w-10 text-lg font-bold text-[var(--navy)] hover:bg-[var(--bg)]">+</button></div>;
}

/* ═════ توقعي: بس العيادات اللي ليها توقع أو هدف + إضافة عيادة ═════ */
function ForecastTab({ fd, lines, setLines, editable, canChange, busy, month, onSave, onSubmit, onChange, onCopy }: { fd: ForecastData; lines: Line[]; setLines: (f: (l: Line[]) => Line[]) => void; editable: boolean; canChange: boolean; busy: boolean; month: string; onSave: () => void; onSubmit: () => void; onChange: (reason: string) => void; onCopy: () => void }) {
  const [extra, setExtra] = useState<string[]>([]); const [reason, setReason] = useState(""); const [add, setAdd] = useState("");
  const status = fd.forecast?.status ?? "draft"; const open = editable || canChange;
  const rows = useMemo(() => { const ids = new Set<string>([...lines.filter(l => l.qty > 0).map(l => l.clinic_id), ...fd.targets.map(t => t.clinic_id), ...extra]); return fd.clinics.filter(c => ids.has(c.id)); }, [lines, fd.targets, fd.clinics, extra]);
  const get = (c: string, p: string) => lines.find(l => l.clinic_id === c && l.product_id === p)?.qty ?? 0;
  const set = (c: string, p: string, v: number) => setLines(old => [...old.filter(l => l.clinic_id !== c || l.product_id !== p), { clinic_id: c, product_id: p, qty: v }]);
  const totQ = lines.reduce((n, l) => n + l.qty, 0), totV = lines.reduce((n, l) => n + l.qty * priceOf(fd, l.clinic_id, l.product_id), 0);
  return <section className={card}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="flex items-center gap-2 font-extrabold text-[var(--navy)]"><Icon name="send" size={18} />توقعي لشهر {mName(month)}</h3><p className="mt-0.5 text-[11.5px] text-[var(--muted)]">كام وحدة متوقع تبيع في كل عيادة — تقديرك إنت، والهدف الرسمي بيحدده المدير.</p></div>
      <div className="flex items-center gap-2"><Pill s={status} />{editable && <button type="button" disabled={busy} onClick={onCopy} className="rounded-xl bg-[var(--bg)] px-3 py-1.5 text-xs font-bold text-[var(--navy)] hover:bg-[var(--sky-light)]">انسخ الشهر اللي فات</button>}</div>
    </div>
    {fd.forecast?.rejection_reason && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-800 ring-1 ring-red-200">اترفض: {fd.forecast.rejection_reason}</div>}
    {fd.is_late && editable && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-800 ring-1 ring-red-200">فات ميعاد الإرسال (يوم 3) — اطلب استثناء من المدير</div>}
    {fd.approved_baseline && <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900 ring-1 ring-emerald-200">التوقع المعتمد الساري: <b>{fd.approved_baseline.lines.reduce((n, l) => n + l.qty, 0)} وحدة</b> — أي تعديل بيتبعت كطلب ومش بيغيّر المعتمد غير بعد الموافقة.</div>}
    {!rows.length ? <div className="mt-4 rounded-2xl border border-dashed border-[var(--border-strong)] p-6 text-center text-sm text-[var(--muted)]">ضيف العيادات اللي متوقع تبيع فيها الشهر ده</div>
      : <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"><table className="w-full min-w-[520px] text-sm">
        <thead className="text-[11px] text-[var(--muted)]"><tr><th className="p-2 text-right">العيادة</th>{fd.products.map(p => <th key={p.id} className="p-2">{p.name}</th>)}<th className="p-2">القيمة</th></tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{rows.map(c => { const v = fd.products.reduce((n, p) => n + get(c.id, p.id) * priceOf(fd, c.id, p.id), 0); return <tr key={c.id} className="transition-colors hover:bg-[var(--sky-light)]/40">
          <td className="max-w-[200px] p-2"><div className="truncate font-bold">{c.name}</div>{c.city && <div className="text-[10.5px] text-[var(--muted)]">{c.city}</div>}</td>
          {fd.products.map(p => { const t = fd.targets.find(x => x.clinic_id === c.id && x.product_id === p.id)?.qty; return <td key={p.id} className="p-2 text-center">{open ? <div className="inline-flex flex-col items-center gap-0.5"><Stepper v={get(c.id, p.id)} set={n => set(c.id, p.id, n)} />{t ? <span className="text-[10px] text-[var(--muted)]">الهدف {t}</span> : null}</div> : <b>{get(c.id, p.id) || "—"}</b>}</td>; })}
          <td className="p-2 text-center text-xs font-bold text-[var(--navy)]">{v ? money(v) : "—"}</td></tr>; })}</tbody></table></div>}
    {open && <div className="mt-3 flex flex-wrap items-center gap-2"><select value={add} onChange={e => { const id = e.target.value; if (id) { setExtra(x => [...x, id]); setAdd(""); } }} className="h-10 max-w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm"><option value="">+ ضيف عيادة للتوقع…</option>{fd.clinics.filter(c => !rows.some(r => r.id === c.id)).map(c => <option key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ""}</option>)}</select></div>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--sky-light)] p-3">
      <div className="text-sm">الإجمالي <b className="text-[var(--navy)]">{totQ} وحدة</b> · <b className="text-[var(--navy)]">{money(totV)}</b></div>
      {editable ? <div className="flex gap-2"><button type="button" disabled={busy} onClick={onSave} className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-[var(--navy)] ring-1 ring-[var(--border)]">حفظ مسودة</button><button type="button" disabled={busy || !!fd.is_late || !totQ} onClick={onSubmit} className="rounded-xl bg-[var(--navy)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">ابعت للمدير</button></div>
        : canChange ? <div className="flex flex-wrap gap-2"><input value={reason} onChange={e => setReason(e.target.value)} placeholder="سبب التعديل…" className="h-10 rounded-xl border border-[var(--border)] px-3 text-sm" /><button type="button" disabled={busy || !reason.trim()} onClick={() => onChange(reason.trim())} className="rounded-xl bg-[var(--navy)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">اطلب تعديل</button></div>
          : <span className="text-xs text-[var(--muted)]">{status === "pending" || status === "submitted" ? "مستني قرار المدير" : "مفيش تعديل متاح للشهر ده"}</span>}
    </div>
  </section>;
}

/* ═════ السنة كلها ═════ */
function YearTab({ hub, onMonth }: { hub: Hub; onMonth: (m: string) => void }) {
  const [h, setH] = useState<number | null>(null);
  const max = Math.max(1, ...hub.monthly.map(m => Math.max(m.target, m.actual, m.forecast)));
  const cumT = hub.monthly.reduce<number[]>((a, m) => [...a, (a.at(-1) ?? 0) + m.target], []), cumA = hub.monthly.reduce<number[]>((a, m) => [...a, (a.at(-1) ?? 0) + m.actual], []);
  const x = h !== null ? hub.monthly[h] : null;
  return <div className="space-y-4">
    <section className={card}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold text-[var(--navy)]">شهر بشهر — {hub.year}</h3><div className="flex gap-3 text-[11px] text-[var(--muted)]"><Lg c="ring-2 ring-[var(--navy)]/30 bg-white" t="الهدف" /><Lg c="bg-[var(--sky-border)]" t="توقعك المعتمد" /><Lg c="bg-[var(--navy)]" t="المحقق" /></div></div>
      <div className="h-6 text-xs text-[var(--muted)]">{x ? <span><b className="text-[var(--navy)]">{mName(x.month)}</b> · الهدف {x.allocated ? money(x.target) : "غير موزع"} · التوقع {x.forecast ? money(x.forecast) : "—"} · المحقق <b className="text-emerald-700">{money(x.actual)}</b>{x.actual_qty ? ` (${x.actual_qty} وحدة)` : ""} · التراكمي {money(cumA[h!])} من {money(cumT[h!])}</span> : "مرّر على أي شهر — واضغط عشان تفتحه"}</div>
      <div className="flex h-52 items-end gap-1.5 sm:gap-3" onMouseLeave={() => setH(null)}>{hub.monthly.map((m, i) => { const now = m.month === hub.nowMonth; const hit = m.target && m.actual >= m.target; return <button key={m.month} type="button" onMouseEnter={() => setH(i)} onFocus={() => setH(i)} onClick={() => m.month <= hub.nowMonth && onMonth(m.month)} className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-lg ${h === i ? "bg-[var(--sky-light)]" : ""}`}>
        <div className="relative flex w-full max-w-12 flex-1 items-end justify-center">
          {m.target > 0 && <div className="dz-bar absolute bottom-0 w-full rounded-t-lg border-2 border-dashed border-[var(--navy)]/30 bg-white" style={{ height: `${m.target / max * 100}%`, "--d": `${i * 40}ms` } as React.CSSProperties} />}
          {m.forecast > 0 && <div className="dz-bar absolute bottom-0 w-3/4 rounded-t-md bg-[var(--sky-border)]" style={{ height: `${m.forecast / max * 100}%`, "--d": `${120 + i * 40}ms` } as React.CSSProperties} />}
          {m.actual !== 0 && <div className="dz-bar relative w-1/2 rounded-t-md" style={{ height: `${Math.max(2, Math.max(0, m.actual) / max * 100)}%`, background: hit ? "#1aa865" : now ? "var(--sky)" : "var(--navy)", "--d": `${240 + i * 40}ms` } as React.CSSProperties} />}
        </div>
        <span className={`text-[10px] ${now ? "font-extrabold text-[var(--navy)]" : "text-[var(--muted)]"}`}>{mName(m.month, false)}</span>
      </button>; })}</div>
      <div className="mt-2 text-[10.5px] text-[var(--muted)]">العمود الأخضر = حققت هدف الشهر</div>
    </section>
    <div className="grid gap-4 lg:grid-cols-2">
      <Breakdown title="مبيعاتي حسب المنتج" rows={hub.byProduct.map(r => ({ k: r.name, v: r.value, s: `${r.qty} وحدة` }))} />
      <Breakdown title="أعلى عياداتي" rows={hub.byClinic.map(r => ({ k: r.name, v: r.value, s: [r.city, `${r.qty} وحدة`].filter(Boolean).join(" · ") }))} />
    </div>
    <div className="flex flex-wrap gap-2"><Link href="/doctors" className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold ring-1 ring-[var(--border)]">الأطباء المحتاجين زيارة</Link><Link href="/calendar" className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold ring-1 ring-[var(--border)]">مخطط العمل</Link></div>
  </div>;
}
const Lg = ({ c, t }: { c: string; t: string }) => <span className="flex items-center gap-1"><i className={`inline-block h-2.5 w-2.5 rounded-sm ${c}`} />{t}</span>;
function Breakdown({ title, rows }: { title: string; rows: Array<{ k: string; v: number; s: string }> }) {
  const max = Math.max(1, ...rows.map(r => r.v));
  return <section className={card}><h3 className="mb-3 font-extrabold text-[var(--navy)]">{title}</h3>
    {!rows.length ? <div className="py-8 text-center text-sm text-[var(--muted)]">لسه مفيش مبيعات معتمدة السنة دي</div>
      : <div className="space-y-2.5">{rows.map((r, i) => <div key={r.k}><div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate font-bold">{r.k}</span><span className="whitespace-nowrap text-xs text-[var(--muted)]">{short(r.v)} ر.س · {r.s}</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className="dz-grow-x h-full rounded-full bg-gradient-to-l from-[#33b3a6] to-[var(--navy)]" style={{ width: `${Math.max(0, r.v) / max * 100}%`, animationDelay: `${i * 70}ms` }} /></div></div>)}</div>}
  </section>;
}

/* ═════ مرتجع / تصحيح ═════ */

/* ═════ أهدافي: توزيع السنة + تفصيل الشهر (بدل شبكة كل العيادات) ═════ */
type TL = { clinic_id: string; product_id: string; quantity: number; unit_price?: number | string };
type RepPlanT = { year: number; annual_target: number | string | null; months: Array<{ month: string; amount: number | string; source?: string | null; status?: string }>;
  year_plan?: { status: string; reason?: string | null; request_reason?: string | null } | null; approved_year_plan?: { status: string } | null;
  breakdowns: Array<{ month: string; status: string; lines: TL[]; approved_lines?: TL[]; reason?: string | null; request_reason?: string | null }>; prices?: Array<{ clinic_id: string; product_id: string; price: number | string }> };
const monthsOf = (y: number) => Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);

export function TargetsTab({ plan, fd, month, busy, onAction }: { plan: RepPlanT; fd: ForecastData; month: string; busy: boolean; onAction: (name: string, body: Record<string, unknown>) => void }) {
  const annual = Number(plan.annual_target ?? 0);
  const admin = plan.months.filter(m => m.source === "admin");
  const free = monthsOf(plan.year).filter(m => !admin.some(a => a.month === m));
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [yReason, setYReason] = useState("");
  useEffect(() => { setAlloc(Object.fromEntries(free.map(m => [m, Number(plan.months.find(x => x.month === m)?.amount ?? 0)]))); }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps
  const adminSum = admin.reduce((n, m) => n + Number(m.amount), 0);
  const given = free.reduce((n, m) => n + (alloc[m] || 0), 0);
  const balance = Math.round((annual - adminSum - given) * 100) / 100;
  const yPending = plan.year_plan?.status === "pending";
  const yOpen = annual > 0 && !yPending;
  const spread = () => { const left = annual - adminSum; const each = Math.floor(left / free.length); const next: Record<string, number> = {}; free.forEach((m, i) => { next[m] = i === free.length - 1 ? Math.round((left - each * (free.length - 1)) * 100) / 100 : each; }); setAlloc(next); };
  const canYear = yOpen && balance === 0 && (!plan.approved_year_plan || !!yReason.trim()) && !busy;

  // month breakdown
  const sel = plan.months.find(m => m.month === month); const target = Number(sel?.amount ?? 0);
  const bd = plan.breakdowns.find(b => b.month === month);
  const prices = plan.prices?.length ? plan.prices : fd.prices;
  const pr = (c: string, p: string) => Number(prices.find(x => x.clinic_id === c && x.product_id === p)?.price ?? (fd.products.find(x => x.id === p) as { unit_price?: number | string | null } | undefined)?.unit_price ?? 0);
  const [q, setQ] = useState<Record<string, number>>({}); const [extra, setExtra] = useState<string[]>([]); const [mReason, setMReason] = useState(""); const [add, setAdd] = useState("");
  useEffect(() => { setQ(Object.fromEntries((bd?.lines ?? []).map(l => [`${l.clinic_id}:${l.product_id}`, Number(l.quantity)]))); setExtra([]); }, [bd, month]);
  const lines: TL[] = Object.entries(q).filter(([, v]) => v > 0).map(([k, v]) => { const [c, p] = k.split(":"); return { clinic_id: c, product_id: p, quantity: v }; });
  const value = lines.reduce((n, l) => n + l.quantity * pr(l.clinic_id, l.product_id), 0);
  const missing = lines.filter(l => !(pr(l.clinic_id, l.product_id) > 0));
  const rowIds = [...new Set([...lines.map(l => l.clinic_id), ...(bd?.lines ?? []).map(l => l.clinic_id), ...fd.targets.map(t => t.clinic_id), ...extra])];
  const rows = fd.clinics.filter(c => rowIds.includes(c.id));
  const mPending = bd?.status === "pending";
  const canMonth = !!sel && !mPending && lines.length > 0 && !missing.length && (!bd?.approved_lines?.length || !!mReason.trim()) && !busy;
  const diff = value - target;

  return <div className="space-y-4">
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="flex items-center gap-2 font-extrabold text-[var(--navy)]"><Icon name="calendar" size={18} />وزّع هدفك السنوي {plan.year} على الشهور</h3><p className="mt-0.5 text-[11.5px] text-[var(--muted)]">الهدف {annual ? money(annual) : "لسه ما اتحددش"}{adminSum ? ` · المدير حدد ${money(adminSum)} لشهور معينة` : ""} — وزّع الباقي ولازم المجموع يساوي الهدف بالظبط.</p></div>
        <div className="flex items-center gap-2">{plan.year_plan && <Pill s={plan.year_plan.status} />}{yOpen && <button type="button" onClick={spread} className="rounded-xl bg-[var(--bg)] px-3 py-1.5 text-xs font-bold text-[var(--navy)] hover:bg-[var(--sky-light)]">وزّع بالتساوي</button>}</div>
      </div>
      {plan.year_plan?.status === "rejected" && plan.year_plan.reason && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-800 ring-1 ring-red-200">اترفض: {plan.year_plan.reason}</div>}
      {annual > 0 && <div className="mt-3"><div className="flex justify-between text-[11.5px]"><span className="text-[var(--muted)]">اتوزع {money(adminSum + given)} من {money(annual)}</span><b className={balance === 0 ? "text-emerald-700" : balance > 0 ? "text-amber-700" : "text-red-700"}>{balance === 0 ? "✓ متوازن" : balance > 0 ? `باقي ${money(balance)}` : `زيادة ${money(-balance)}`}</b></div>
        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (adminSum + given) / annual * 100)}%`, background: balance === 0 ? "#1aa865" : balance > 0 ? "#e99608" : "#c92f36" }} /></div></div>}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{monthsOf(plan.year).map(m => { const a = admin.find(x => x.month === m); const now = m === month; return <label key={m} className={`rounded-2xl p-2.5 ring-1 transition ${now ? "ring-2 ring-[var(--navy)]" : "ring-[var(--border)]"} ${a ? "bg-[var(--bg)]" : "bg-white"}`}>
        <div className="flex items-center justify-between text-[11px] font-bold"><span className={now ? "text-[var(--navy)]" : "text-[var(--muted)]"}>{mName(m, false)}</span>{a && <span className="rounded-full bg-[var(--navy)] px-1.5 text-[9.5px] text-white">المدير</span>}</div>
        <input type="number" min={0} inputMode="decimal" disabled={!!a || !yOpen} value={a ? Number(a.amount) : (alloc[m] ?? 0)} onChange={e => setAlloc(x => ({ ...x, [m]: Math.max(0, Number(e.target.value) || 0) }))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-center text-sm font-extrabold text-[var(--navy)] disabled:bg-transparent disabled:text-[var(--muted)]" />
      </label>; })}</div>
      {yOpen && <div className="mt-3 flex flex-wrap items-center justify-end gap-2">{plan.approved_year_plan && <input value={yReason} onChange={e => setYReason(e.target.value)} placeholder="سبب تعديل التوزيع المعتمد…" className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--border)] px-3 text-sm" />}<button type="button" disabled={!canYear} onClick={() => onAction("allocate_year", { year: plan.year, reason: yReason.trim(), months: free.map(m => ({ month: m, amount: alloc[m] || 0 })) })} className="rounded-xl bg-[var(--navy)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">ابعت التوزيع للمدير</button></div>}
      {yPending && <div className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800 ring-1 ring-sky-200">التوزيع مستني موافقة المدير</div>}
    </section>

    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="flex items-center gap-2 font-extrabold text-[var(--navy)]"><Icon name="plans" size={18} />فصّل هدف {mName(month)} على العيادات</h3><p className="mt-0.5 text-[11.5px] text-[var(--muted)]">هدف الشهر {target ? money(target) : "لسه ما اتحددش"} — ضيف العيادات اللي هتحقق منها الهدف والكميات، والقيمة بتتحسب بسعر كل عيادة.</p></div>
        {bd && <Pill s={bd.status} />}
      </div>
      {bd?.status === "rejected" && bd.reason && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-800 ring-1 ring-red-200">اترفض: {bd.reason}</div>}
      {!sel || target <= 0 ? <div className="mt-3 rounded-2xl bg-[var(--bg)] p-4 text-sm text-[var(--muted)]">لسه مفيش هدف للشهر ده — وزّع الهدف السنوي فوق وابعته (أو استنى المدير يحدد هدف الشهر)، وبعدها تقدر تفصّله على العيادات.</div> : <>
        <div className="mt-3"><div className="flex justify-between text-[11.5px]"><span className="text-[var(--muted)]">التفصيل {money(value)} من {money(target)}</span><b className={Math.abs(diff) < 1 ? "text-emerald-700" : diff < 0 ? "text-amber-700" : "text-sky-700"}>{Math.abs(diff) < 1 ? "✓ مطابق للهدف" : diff < 0 ? `ناقص ${money(-diff)}` : `أعلى بـ ${money(diff)}`}</b></div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full bg-gradient-to-l from-[#33b3a6] to-[var(--navy)] transition-all duration-500" style={{ width: `${target ? Math.min(100, value / target * 100) : 0}%` }} /></div></div>
        {!rows.length ? <div className="mt-4 rounded-2xl border border-dashed border-[var(--border-strong)] p-6 text-center text-sm text-[var(--muted)]">ضيف أول عيادة من القائمة تحت</div>
          : <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"><table className="w-full min-w-[520px] text-sm"><thead className="text-[11px] text-[var(--muted)]"><tr><th className="p-2 text-right">العيادة</th>{fd.products.map(p => <th key={p.id} className="p-2">{p.name}</th>)}<th className="p-2">القيمة</th></tr></thead>
            <tbody className="divide-y divide-[var(--border)]">{rows.map(c => { const v = fd.products.reduce((n, p) => n + (q[`${c.id}:${p.id}`] || 0) * pr(c.id, p.id), 0); return <tr key={c.id} className="hover:bg-[var(--sky-light)]/40">
              <td className="max-w-[200px] p-2"><div className="truncate font-bold">{c.name}</div>{c.city && <div className="text-[10.5px] text-[var(--muted)]">{c.city}</div>}</td>
              {fd.products.map(p => { const price = pr(c.id, p.id); return <td key={p.id} className="p-2 text-center">{mPending ? <b>{q[`${c.id}:${p.id}`] || "—"}</b> : <div className="inline-flex flex-col items-center gap-0.5"><Stepper v={q[`${c.id}:${p.id}`] || 0} set={n => setQ(x => ({ ...x, [`${c.id}:${p.id}`]: n }))} /><span className={`text-[10px] ${price ? "text-[var(--muted)]" : "font-bold text-red-600"}`}>{price ? `${money(price)} للوحدة` : "مفيش سعر — بلّغ المدير"}</span></div>}</td>; })}
              <td className="p-2 text-center text-xs font-bold text-[var(--navy)]">{v ? money(v) : "—"}</td></tr>; })}</tbody></table></div>}
        {!mPending && <div className="mt-3 flex flex-wrap items-center gap-2"><select value={add} onChange={e => { const id = e.target.value; if (id) { setExtra(x => [...x, id]); setAdd(""); } }} className="h-10 max-w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm"><option value="">+ ضيف عيادة…</option>{fd.clinics.filter(c => !rowIds.includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ""}</option>)}</select></div>}
        {missing.length > 0 && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-800 ring-1 ring-red-200">{missing.length} سطر من غير سعر — المدير لازم يحدد سعر العيادة/المنتج الأول</div>}
        {!mPending && <div className="mt-3 flex flex-wrap items-center justify-end gap-2">{!!bd?.approved_lines?.length && <input value={mReason} onChange={e => setMReason(e.target.value)} placeholder="سبب تعديل التفصيل المعتمد…" className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--border)] px-3 text-sm" />}<button type="button" disabled={!canMonth} onClick={() => onAction("submit_breakdown", { month, reason: mReason.trim(), lines })} className="rounded-xl bg-[var(--navy)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">ابعت التفصيل للمدير</button></div>}
        {mPending && <div className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800 ring-1 ring-sky-200">التفصيل مستني موافقة المدير</div>}
      </>}
    </section>
  </div>;
}
