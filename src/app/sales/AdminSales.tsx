"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import ItemProductMap from "./ItemProductMap";
import { useToast } from "@/components/Toast";
import { actionRequest, buildReportRows, canCloseMonth, postForecastAction, riyadhMonth } from "../forecast/ForecastClient";
import { targetRequest } from "../forecast/TargetPlanningClient";

type Product = { id: string; name: string; unit_price: number | null };
type Clinic = { id: string; name: string; city: string; daftra_client_id: number; rep_id: string | null; rep_name: string | null; unpaid: number };
type TP = { rep_id: string; period: string; product_id: string; product: string; mode: "amount" | "units"; quantity: number; unit_price: number; amount: number };
type PlanRep = { id: string; name: string; annual_amount: number; months: Array<{ month: string; amount: number | string; source: string; status: string }>; year_plan: { status: string } | null; approved_year_plan: { status: string } | null };
type Q = { id: string; rep_id: string; rep_name?: string; month?: string; year?: number; reason?: string | null; months?: Array<{ month: string; amount: number | string }>; lines?: Array<{ clinic_id: string; product_id: string; quantity: number | string; unit_price?: number | string }> };
type Pending = { id: string; rep_id: string; rep_name: string; status: string; submitted_at?: string; reason?: string | null; lines: Array<{ clinic_id: string; product_id: string; quantity: number }> };
type PSale = { id: string; rep_name: string; clinic_id: string; product_id: string; quantity: number; unit_price: string; kind: string; direction: number; reason?: string | null };
type MonthView = { pending: Pending[]; pending_sales: PSale[]; team: Array<{ rep_id: string; rep_name: string; target: number; actual: number; target_value: number; actual_value: number; pending: number }>; targets: Array<{ rep_id: string; clinic_id: string; product_id: string; quantity: number; unit_price: string }>; approved_sales: Array<{ rep_id: string; clinic_id: string; product_id: string; quantity: number; unit_price: string; kind: string; direction: number }>; approved_forecasts: Array<{ rep_id: string; clinic_id: string; product_id: string; quantity: number }>; is_closed: boolean; prices: Array<{ clinic_id: string; product_id: string; price: number }> };
type View = { year: number; month: string; plan: { reps: PlanRep[]; pending_year_allocations: Q[]; pending_breakdowns: Q[] }; monthView: MonthView; products: Product[]; clinics: Clinic[]; targetProducts: TP[]; specialPrices: Array<{ clinic_id: string; product_id: string; price: number; month: string }> };
type Hub = { unassigned?: number; team: Array<{ rep_id: string; rep_name: string; annual: number; ytd: number; month_target: number; month_actual: number; month_forecast: number; pending: number }> };
type Tab = "team" | "targets" | "approvals" | "catalog" | "close";

const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} ر.س`;
const short = (n: number) => Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n));
const mName = (m: string, long = true) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: long ? "long" : "short", ...(long ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
const shiftM = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const card = "rounded-[28px] border border-[var(--border)] bg-white p-4 sm:p-5";
const pct = (a: number, b: number) => b ? Math.round(a / b * 100) : 0;
const btn = { ok: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20", edit: "bg-sky-600 text-white hover:bg-sky-700 shadow-sm shadow-sky-600/20", no: "bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50", primary: "bg-[var(--navy)] text-white hover:opacity-95", ghost: "bg-white text-[var(--navy)] ring-1 ring-[var(--border)] hover:bg-[var(--sky-light)]" };
const B = ({ k, children, ...p }: { k: keyof typeof btn } & React.ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...p} className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition disabled:opacity-40 ${btn[k]} ${p.className || ""}`}>{children}</button>;

export default function AdminSales() {
  const toast = useToast();
  const nowM = riyadhMonth(new Date());
  const [month, setMonth] = useState(nowM);
  const year = Number(month.slice(0, 4));
  const [tab, setTab] = useState<Tab>("team");
  const [v, setV] = useState<View | null>(null);
  const [hub, setHub] = useState<Hub | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusRep, setFocusRep] = useState("");
  const load = useCallback(async () => {
    const [a, h] = await Promise.all([fetch(`/api/admin/sales?year=${year}&month=${month}`, { cache: "no-store" }).then(r => r.json()), fetch(`/api/sales/hub?year=${year}`, { cache: "no-store" }).then(r => r.ok ? r.json() : null)]);
    if (a?.plan) setV(a); else toast(a?.error || "تعذر التحميل", "error");
    setHub(h);
  }, [year, month, toast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { try { const t = sessionStorage.getItem("adm-sales-tab") as Tab | null; if (t) setTab(t); } catch { /* */ } }, []);
  const go = (t: Tab) => { setTab(t); try { sessionStorage.setItem("adm-sales-tab", t); } catch { /* */ } };

  const run = async (url: string, body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try { await postForecastAction(url, body); toast(ok, "success"); await load(); return true; }
    catch (e) { toast(e instanceof Error ? e.message : "تعذر الحفظ", "error"); return false; } finally { setBusy(false); }
  };
  const fAct = (name: string, extra: Record<string, unknown>, ok: string) => { const r = actionRequest("admin", name, extra, month); return run(r.url, r.body, ok); };
  const tAct = (name: string, extra: Record<string, unknown>, ok: string) => { const r = targetRequest("admin", name, extra, month); return run(r.url, r.body, ok); };
  const sAct = (body: Record<string, unknown>, ok: string) => run("/api/admin/sales", body, ok);

  if (!v) return <div className="mt-4 grid gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-28 animate-pulse rounded-[28px] bg-white" />)}</div>;
  const mv = v.monthView;
  const approvals = mv.pending.length + mv.pending_sales.length + v.plan.pending_year_allocations.length + v.plan.pending_breakdowns.length;
  const team = hub?.team || [];
  const annualTotal = team.reduce((s, r) => s + r.annual, 0), ytd = team.reduce((s, r) => s + r.ytd, 0);
  const mT = team.reduce((s, r) => s + r.month_target, 0), mA = team.reduce((s, r) => s + r.month_actual, 0);
  const noPrice = v.products.filter(p => !p.unit_price).length;
  const TABS: Array<[Tab, string, string, number, string]> = [["team", "الفريق", "reps", 0, ""], ["targets", "الأهداف", "trophy", 0, ""], ["approvals", "الموافقات", "check", approvals, "bg-amber-500"], ["catalog", "العيادات والأسعار", "products", noPrice, "bg-red-500"], ["close", "إقفال الشهر", "calendar", 0, ""]];

  return <div className="mt-4 space-y-4 pb-24 lg:pb-6">
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--sky-border)] bg-[var(--sky-light)] px-4 py-3 text-[12.5px] text-[var(--navy)]"><Icon name="receipt" size={16} /><span className="min-w-0 flex-1">المحقق محسوب من <b>فواتير دفترة</b> بس (بعد المرتجعات) — أي بيعة لمنتج في أي عيادة بتتحسب <b>للمندوب المسؤول عن المنتج</b>.{hub?.unassigned ? <> فيه <b>{Math.round(hub.unassigned).toLocaleString("en-US")} ر.س</b> مبيعات السنة دي لأصناف مش مربوطة بمنتج عليه مندوب.</> : null}</span>{hub?.unassigned ? <a href="#item-map" className="rounded-xl bg-[var(--navy)] px-3 py-1.5 text-xs font-bold text-white">اربط الأصناف ‹</a> : null}</div>
    <ItemProductMap year={year} onChange={() => void load()} />
    {/* header strip: period + 4 numbers (shown once) */}
    <div className="dz-in grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div className="col-span-2 flex items-center justify-between gap-2 rounded-[24px] border border-[var(--border)] bg-white p-3 lg:col-span-1">
        <button type="button" aria-label="الشهر السابق" onClick={() => setMonth(m => shiftM(m, -1))} className="h-9 w-9 rounded-xl bg-[var(--bg)] font-bold">›</button>
        <div className="text-center"><div className="text-[10.5px] font-bold text-[var(--muted)]">الفترة</div><div className="text-sm font-extrabold text-[var(--navy)]">{mName(month)}</div></div>
        <button type="button" aria-label="الشهر التالي" onClick={() => setMonth(m => shiftM(m, 1))} className="h-9 w-9 rounded-xl bg-[var(--bg)] font-bold">‹</button>
      </div>
      <Stat l={`هدف الفريق ${year}`} v={money(annualTotal)} s={`محقق ${money(ytd)} · ${pct(ytd, annualTotal)}%`} p={pct(ytd, annualTotal)} c="#1aa865" />
      <Stat l={`هدف ${mName(month, false)}`} v={money(mT)} s={`محقق ${money(mA)} · ${pct(mA, mT)}%`} p={pct(mA, mT)} c="#33b3a6" />
      <button type="button" onClick={() => go("approvals")} className="dz-card rounded-[24px] border border-[var(--border)] bg-white p-3 text-right"><div className="text-[11px] font-bold text-[var(--muted)]">مستني موافقتك</div><div className={`mt-1 text-2xl font-extrabold ${approvals ? "text-amber-600" : "text-emerald-700"}`}>{approvals || "✓"}</div><div className="text-[10.5px] text-[var(--muted)]">{approvals ? `${mv.pending.length} توقع · ${mv.pending_sales.length} بيع · ${v.plan.pending_year_allocations.length + v.plan.pending_breakdowns.length} أهداف` : "مفيش حاجة معلقة"}</div></button>
      <button type="button" onClick={() => go("catalog")} className="dz-card rounded-[24px] border border-[var(--border)] bg-white p-3 text-right"><div className="text-[11px] font-bold text-[var(--muted)]">العيادات (من دفترة)</div><div className="mt-1 text-2xl font-extrabold text-[var(--navy)]">{v.clinics.length}</div><div className={`text-[10.5px] ${noPrice ? "font-bold text-red-600" : "text-[var(--muted)]"}`}>{noPrice ? `${noPrice} منتج من غير سعر` : `${v.products.length} منتج مسعّر`}</div></button>
    </div>

    <div className="tabs-bar z-20 -mx-4 bg-[var(--bg)]/90 px-4 py-1.5 backdrop-blur sm:mx-0 sm:px-0 lg:sticky lg:top-0">
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white p-1.5">{TABS.map(([k, l, i, n, nc]) => <button key={k} type="button" onClick={() => go(k)} className={`relative flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-bold transition ${tab === k ? "bg-[var(--navy)] text-white shadow" : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--navy)]"}`}><Icon name={i} size={16} />{l}{n > 0 && <span className={`rounded-full px-1.5 text-[10px] font-extrabold text-white ${nc}`}>{n}</span>}</button>)}</div>
    </div>

    <div key={tab} className="dz-in">
      {tab === "team" && <TeamTab v={v} hub={hub} month={month} onTarget={id => { setFocusRep(id); go("targets"); }} />}
      {tab === "targets" && <TargetsAdmin v={v} month={month} busy={busy} rep={focusRep} setRep={setFocusRep} onSave={(b, ok) => sAct({ action: "set_target", ...b }, ok)} />}
      {tab === "approvals" && <Approvals v={v} month={month} busy={busy} fAct={fAct} tAct={tAct} />}
      {tab === "catalog" && <Catalog v={v} month={month} busy={busy} onPrice={(product_id, unit_price) => sAct({ action: "set_product_price", product_id, unit_price }, "اتحفظ السعر ✓")} onSync={() => sAct({ action: "sync_clinics" }, "اتحدثت العيادات من دفترة ✓")} onSpecial={b => fAct("set_price", { month, ...b }, "اتحفظ السعر الخاص ✓")} />}
      {tab === "close" && <CloseTab v={v} month={month} busy={busy} fAct={fAct} />}
    </div>
  </div>;
}

function Stat({ l, v, s, p, c }: { l: string; v: string; s: string; p: number; c: string }) {
  return <div className="dz-card rounded-[24px] border border-[var(--border)] bg-white p-3"><div className="text-[11px] font-bold text-[var(--muted)]">{l}</div><div className="mt-1 text-lg font-extrabold text-[var(--navy)] sm:text-xl">{v}</div>
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--bg)]"><div className="dz-grow-x h-full rounded-full" style={{ width: `${Math.min(100, p)}%`, background: c }} /></div><div className="mt-1 text-[10.5px] text-[var(--muted)]">{s}</div></div>;
}
const RepAvatar = ({ name }: { name: string }) => <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--navy)] to-[#1f7a7f] text-[11px] font-extrabold text-white">{name.split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase()}</span>;
const unitsChips = (tp: TP[]) => tp.length ? <div className="flex flex-wrap gap-1">{tp.map(t => <span key={t.product_id} className="rounded-full bg-[var(--sky-light)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--navy)] ring-1 ring-[var(--sky-border)]">{t.product} · {t.quantity.toLocaleString("en-US")} وحدة</span>)}</div> : null;

/* ═════ الفريق ═════ */
function TeamTab({ v, hub, month, onTarget }: { v: View; hub: Hub | null; month: string; onTarget: (id: string) => void }) {
  const rows = v.plan.reps.map(r => { const h = hub?.team.find(t => t.rep_id === r.id); const m = r.months.find(x => x.month === month); return { r, h, mTarget: Number(m?.amount || 0), mSource: m?.source, yTP: v.targetProducts.filter(t => t.rep_id === r.id && t.period === String(v.year)), mTP: v.targetProducts.filter(t => t.rep_id === r.id && t.period === month) }; });
  return <section className={card}>
    <h3 className="mb-3 font-extrabold text-[var(--navy)]">المناديب — {v.year}</h3>
    <div className="space-y-2">{rows.map(({ r, h, mTarget, mSource, yTP, mTP }) => { const yp = pct(h?.ytd || 0, r.annual_amount), mp = pct(h?.month_actual || 0, mTarget); return <div key={r.id} className="dz-card grid grid-cols-1 items-center gap-3 rounded-2xl border border-[var(--border)] p-3 lg:grid-cols-[1.2fr_1.4fr_1.4fr_auto]">
      <div className="flex items-center gap-3"><RepAvatar name={r.name} /><div className="min-w-0"><div className="truncate font-extrabold">{r.name}</div><div className="flex flex-wrap gap-1 pt-0.5">{r.year_plan?.status === "pending" && <span className="rounded-full bg-amber-50 px-2 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200">توزيع مستني موافقتك</span>}{!r.annual_amount && <span className="rounded-full bg-red-50 px-2 text-[10px] font-bold text-red-700 ring-1 ring-red-200">من غير هدف</span>}{(h?.pending || 0) > 0 && <span className="rounded-full bg-sky-50 px-2 text-[10px] font-bold text-sky-800 ring-1 ring-sky-200">{h!.pending} معلق</span>}</div></div></div>
      <div><div className="flex justify-between text-[11px]"><span className="font-bold text-[var(--muted)]">السنة</span><b>{money(h?.ytd || 0)} / {r.annual_amount ? money(r.annual_amount) : "—"}</b></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className="dz-grow-x h-full rounded-full bg-gradient-to-l from-[#1aa865] to-[#33b3a6]" style={{ width: `${Math.min(100, yp)}%` }} /></div><div className="mt-1">{unitsChips(yTP)}</div></div>
      <div><div className="flex justify-between text-[11px]"><span className="font-bold text-[var(--muted)]">{mName(month, false)}{mSource === "admin" ? " · من المدير" : ""}</span><b>{money(h?.month_actual || 0)} / {mTarget ? money(mTarget) : "—"}</b></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className="dz-grow-x h-full rounded-full bg-[var(--navy)]" style={{ width: `${Math.min(100, mp)}%` }} /></div><div className="mt-1 text-[10.5px] text-[var(--muted)]">توقعه المعتمد {h?.month_forecast ? money(h.month_forecast) : "—"}</div>{unitsChips(mTP)}</div>
      <B k="primary" onClick={() => onTarget(r.id)}><Icon name="trophy" size={14} />حدد الهدف</B>
    </div>; })}</div>
  </section>;
}

/* ═════ الأهداف: مبلغ ⇄ وحدات حسب سعر المنتج ═════ */
function TargetsAdmin({ v, month, busy, rep, setRep, onSave }: { v: View; month: string; busy: boolean; rep: string; setRep: (id: string) => void; onSave: (b: Record<string, unknown>, ok: string) => Promise<boolean> }) {
  const [kind, setKind] = useState<"year" | "month">("year");
  const period = kind === "year" ? String(v.year) : month;
  const r = v.plan.reps.find(x => x.id === rep) || null;
  const existing = useMemo(() => v.targetProducts.filter(t => t.rep_id === rep && t.period === period), [v.targetProducts, rep, period]);
  const [rows, setRows] = useState<Record<string, { mode: "amount" | "units"; value: number }>>({});
  useEffect(() => { setRows(Object.fromEntries(v.products.map(p => { const e = existing.find(x => x.product_id === p.id); return [p.id, { mode: e?.mode || "units", value: e ? (e.mode === "units" ? e.quantity : e.amount) : 0 }]; }))); }, [existing, v.products]);
  const calc = v.products.map(p => { const x = rows[p.id] || { mode: "units" as const, value: 0 }; const price = Number(p.unit_price || 0); const units = x.mode === "units" ? Math.round(x.value) : price ? Math.floor(x.value / price) : 0; const amount = x.mode === "units" ? units * price : x.value; return { p, x, price, units, amount }; });
  const total = calc.reduce((s, c) => s + c.amount, 0), totalUnits = calc.reduce((s, c) => s + c.units, 0);
  const current = kind === "year" ? r?.annual_amount || 0 : Number(r?.months.find(m => m.month === month)?.amount || 0);
  const locked = kind === "year" && r && (r.year_plan?.status === "pending" || !!r.approved_year_plan);
  const missing = calc.filter(c => c.x.value > 0 && !c.price);
  return <div className="space-y-4">
    <section className={card}>
      <h3 className="mb-3 flex items-center gap-2 font-extrabold text-[var(--navy)]"><Icon name="trophy" size={18} />حدد هدف للمندوب</h3>
      <div className="flex flex-wrap gap-1.5">{v.plan.reps.map(x => <button key={x.id} type="button" onClick={() => setRep(x.id)} className={`flex items-center gap-2 rounded-2xl px-3 py-1.5 text-xs font-bold ring-1 transition ${rep === x.id ? "bg-[var(--navy)] text-white ring-[var(--navy)]" : "bg-white ring-[var(--border)] hover:bg-[var(--sky-light)]"}`}>{x.name}</button>)}</div>
      {!r ? <div className="mt-4 rounded-2xl bg-[var(--bg)] p-6 text-center text-sm text-[var(--muted)]">اختار المندوب من فوق</div> : <>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-xl bg-[var(--bg)] p-1">{([["year", `هدف سنوي ${v.year}`], ["month", `هدف شهر ${mName(month, false)}`]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${kind === k ? "bg-white text-[var(--navy)] shadow-sm" : "text-[var(--muted)]"}`}>{l}</button>)}</div>
          <span className="text-xs text-[var(--muted)]">الهدف الحالي: <b className="text-[var(--navy)]">{current ? money(current) : "مفيش"}</b></span>
        </div>
        {locked && <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 ring-1 ring-amber-200">المندوب بعت توزيع الهدف السنوي — الهدف السنوي مقفول. تقدر تحدد هدف شهري بدل كده، أو تراجع التوزيع من «الموافقات».</div>}
        {kind === "month" && <div className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-sky-200">هدف الشهر اللي بتحدده بيتخصم من الهدف السنوي، والمندوب بيوزّع الباقي على باقي الشهور.</div>}
        <div className="mt-4 space-y-2">{calc.map(({ p, x, price, units, amount }) => <div key={p.id} className="grid grid-cols-1 items-center gap-2 rounded-2xl border border-[var(--border)] p-3 sm:grid-cols-[1fr_auto_auto_1fr]">
          <div><div className="font-extrabold">{p.name}</div><div className={`text-[11px] ${price ? "text-[var(--muted)]" : "font-bold text-red-600"}`}>{price ? `سعر الوحدة ${money(price)}` : "من غير سعر — حدده من «العيادات والأسعار»"}</div></div>
          <div className="flex gap-1 rounded-xl bg-[var(--bg)] p-1">{([["units", "وحدات"], ["amount", "ر.س"]] as const).map(([m, l]) => <button key={m} type="button" onClick={() => setRows(o => ({ ...o, [p.id]: { mode: m, value: m === x.mode ? x.value : m === "units" ? units : amount } }))} className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${x.mode === m ? (m === "units" ? "bg-sky-600 text-white" : "bg-emerald-600 text-white") : "text-[var(--muted)]"}`}>{l}</button>)}</div>
          <input type="number" min={0} inputMode="decimal" disabled={!!locked} value={x.value || ""} placeholder="0" onChange={e => setRows(o => ({ ...o, [p.id]: { ...x, value: Math.max(0, Number(e.target.value) || 0) } }))} className="h-11 w-40 rounded-xl border border-[var(--border)] px-3 text-center text-base font-extrabold text-[var(--navy)] disabled:bg-[var(--bg)]" />
          <div className="rounded-xl bg-[var(--sky-light)] px-3 py-2 text-sm">= <b className="text-[var(--navy)]">{x.mode === "units" ? money(amount) : `${units.toLocaleString("en-US")} وحدة`}</b>{x.mode === "amount" && price > 0 && x.value > 0 && x.value % price !== 0 && <span className="block text-[10.5px] text-[var(--muted)]">الباقي {money(x.value - units * price)} أقل من وحدة</span>}</div>
        </div>)}</div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--navy)] p-4 text-white">
          <div><div className="text-[11px] text-white/70">الهدف الجديد</div><div className="text-2xl font-extrabold">{money(total)} <span className="text-sm font-bold text-white/70">· {totalUnits.toLocaleString("en-US")} وحدة</span></div>{current > 0 && <div className="text-[11px] text-white/70">{total > current ? "▲" : total < current ? "▼" : "="} {money(Math.abs(total - current))} عن الحالي</div>}</div>
          <button type="button" disabled={busy || !!locked || !total || missing.length > 0} onClick={() => void onSave({ rep_id: rep, period, lines: calc.filter(c => c.x.value > 0).map(c => ({ product_id: c.p.id, mode: c.x.mode, value: c.x.value })) }, `اتحفظ هدف ${r.name} ✓ — هيظهر في صفحته`)} className="rounded-xl bg-white px-5 py-2.5 text-sm font-extrabold text-[var(--navy)] transition hover:-translate-y-0.5 disabled:opacity-40">حفظ الهدف</button>
        </div>
      </>}
    </section>
    <section className={card}>
      <h3 className="mb-3 font-extrabold text-[var(--navy)]">أهداف الشهور — {v.year}</h3>
      <div className="-mx-4 overflow-x-auto px-4"><table className="w-full min-w-[900px] text-xs">
        <thead className="text-[10.5px] text-[var(--muted)]"><tr><th className="p-2 text-right">المندوب</th>{Array.from({ length: 12 }, (_, i) => `${v.year}-${String(i + 1).padStart(2, "0")}`).map(m => <th key={m} className={`p-2 ${m === month ? "text-[var(--navy)]" : ""}`}>{mName(m, false)}</th>)}<th className="p-2">السنة</th></tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{v.plan.reps.map(x => <tr key={x.id} className="hover:bg-[var(--sky-light)]/40"><td className="p-2 font-bold">{x.name}</td>{x.months.map(m => <td key={m.month} className={`p-2 text-center ${m.month === month ? "bg-[var(--sky-light)]" : ""}`}>{Number(m.amount) ? <span className={m.source === "admin" ? "font-extrabold text-[var(--navy)]" : ""} title={m.source === "admin" ? "حدده المدير" : "توزيع المندوب"}>{short(Number(m.amount))}</span> : <span className="text-[var(--muted)]">—</span>}</td>)}<td className="p-2 text-center font-extrabold">{x.annual_amount ? short(x.annual_amount) : "—"}</td></tr>)}</tbody>
      </table></div>
      <div className="mt-2 text-[10.5px] text-[var(--muted)]">الغامق = حدده المدير · العادي = توزيع المندوب المعتمد</div>
    </section>
  </div>;
}

/* ═════ الموافقات: كل اللي محتاج قرارك في مكان واحد ═════ */
function Approvals({ v, month, busy, fAct, tAct }: { v: View; month: string; busy: boolean; fAct: (n: string, e: Record<string, unknown>, ok: string) => Promise<boolean>; tAct: (n: string, e: Record<string, unknown>, ok: string) => Promise<boolean> }) {
  const mv = v.monthView;
  const cl = (id: string) => v.clinics.find(c => c.id === id)?.name || "عيادة";
  const pr = (id: string) => v.products.find(p => p.id === id)?.name || "منتج";
  const price = (c: string, p: string) => Number(mv.prices.find(x => x.clinic_id === c && x.product_id === p)?.price ?? v.specialPrices.find(x => x.clinic_id === c && x.product_id === p)?.price ?? v.products.find(x => x.id === p)?.unit_price ?? 0);
  const none = !mv.pending.length && !mv.pending_sales.length && !v.plan.pending_year_allocations.length && !v.plan.pending_breakdowns.length;
  if (none) return <section className={`${card} py-12 text-center`}><div className="es-pop mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Icon name="check" size={30} /></div><div className="mt-2 font-extrabold text-[var(--navy)]">مفيش حاجة مستنية قرارك</div><div className="text-sm text-[var(--muted)]">في {mName(month)}</div></section>;
  return <div className="space-y-4">
    {mv.pending.length > 0 && <Group title="توقعات المناديب" hint="التوقع مش بيتفعّل غير لما تعتمده — تقدر تعدّل الكميات قبل الاعتماد" n={mv.pending.length}>{mv.pending.map(f => <ForecastCard key={f.id} f={f} busy={busy} cl={cl} pr={pr} price={price}
      onApprove={() => fAct("approve", { forecast_id: f.id }, `اتعتمد توقع ${f.rep_name} ✓`)} onEdit={lines => fAct("approve", { forecast_id: f.id, lines }, `اتعدّل واتعتمد توقع ${f.rep_name} ✓`)} onReject={reason => fAct("reject", { forecast_id: f.id, reason }, "اترفض التوقع")} />)}</Group>}
    {mv.pending_sales.length > 0 && <Group title="مبيعات ومرتجعات" hint="مش بتدخل في المحقق غير بعد الاعتماد" n={mv.pending_sales.length}>{mv.pending_sales.map(s => <Decision key={s.id} busy={busy} who={s.rep_name} title={`${cl(s.clinic_id)} · ${pr(s.product_id)}`} badge={s.kind === "return" ? "مرتجع" : s.kind === "adjustment" ? (s.direction === -1 ? "تصحيح نقص" : "تصحيح زيادة") : "بيع"}
      detail={`${s.quantity} وحدة × ${money(Number(s.unit_price))} = ${money(s.quantity * Number(s.unit_price))}${s.reason ? ` · السبب: ${s.reason}` : ""}`} onApprove={() => fAct("approve_sale", { sale_id: s.id }, "اتعتمد ✓")} onReject={reason => fAct("reject_sale", { sale_id: s.id, reason }, "اترفض")} />)}</Group>}
    {v.plan.pending_year_allocations.length > 0 && <Group title="توزيع الهدف السنوي" hint="المندوب قسّم هدفه على الشهور" n={v.plan.pending_year_allocations.length}>{v.plan.pending_year_allocations.map(q => <Decision key={q.id} busy={busy} who={q.rep_name || ""} title={`توزيع ${q.year ?? ""}`} badge="توزيع"
      detail={<div className="mt-1 grid grid-cols-3 gap-1 sm:grid-cols-6">{(q.months || []).map(m => <span key={m.month} className="rounded-lg bg-[var(--bg)] px-2 py-1 text-center text-[10.5px]"><b>{mName(String(m.month).slice(0, 7), false)}</b><br />{short(Number(m.amount))}</span>)}</div>}
      onApprove={() => tAct("approve_year", { id: q.id }, "اتعتمد التوزيع ✓")} onReject={reason => tAct("reject_year", { id: q.id, reason }, "اترفض التوزيع")} />)}</Group>}
    {v.plan.pending_breakdowns.length > 0 && <Group title="تفصيل هدف الشهر على العيادات" hint="" n={v.plan.pending_breakdowns.length}>{v.plan.pending_breakdowns.map(q => <Decision key={q.id} busy={busy} who={q.rep_name || ""} title={`تفصيل ${q.month ? mName(q.month) : ""}`} badge="تفصيل"
      detail={<div className="mt-1 space-y-0.5">{(q.lines || []).map(l => <div key={`${l.clinic_id}${l.product_id}`} className="flex justify-between text-[11px]"><span>{cl(l.clinic_id)} · {pr(l.product_id)}</span><b>{Number(l.quantity)} × {money(Number(l.unit_price || 0))}</b></div>)}</div>}
      onApprove={() => tAct("approve_breakdown", { id: q.id }, "اتعتمد التفصيل ✓")} onReject={reason => tAct("reject_breakdown", { id: q.id, reason }, "اترفض التفصيل")} />)}</Group>}
  </div>;
}
function Group({ title, hint, n, children }: { title: string; hint: string; n: number; children: React.ReactNode }) {
  return <section className={card}><div className="mb-3 flex flex-wrap items-center gap-2"><h3 className="font-extrabold text-[var(--navy)]">{title}</h3><span className="rounded-full bg-amber-500 px-2 text-[11px] font-extrabold text-white">{n}</span>{hint && <span className="text-[11px] text-[var(--muted)]">— {hint}</span>}</div><div className="space-y-2">{children}</div></section>;
}
function Decision({ who, title, badge, detail, busy, onApprove, onReject }: { who: string; title: string; badge: string; detail: React.ReactNode; busy: boolean; onApprove: () => void; onReject: (reason: string) => void }) {
  const [rej, setRej] = useState(false); const [reason, setReason] = useState("");
  return <div className="dz-card rounded-2xl border border-[var(--border)] p-3">
    <div className="flex flex-wrap items-start gap-3"><RepAvatar name={who || "?"} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b className="text-sm">{who}</b><span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10.5px] font-bold">{badge}</span></div><div className="text-sm font-bold text-[var(--navy)]">{title}</div><div className="text-xs text-[var(--muted)]">{detail}</div></div>
      <div className="flex flex-wrap gap-1.5"><B k="ok" disabled={busy} onClick={onApprove}><Icon name="check" size={14} />اعتماد</B><B k="no" disabled={busy} onClick={() => setRej(x => !x)}>رفض</B></div></div>
    {rej && <div className="dz-in mt-2 flex gap-2"><input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="سبب الرفض (المندوب هيشوفه)…" className="h-10 min-w-0 flex-1 rounded-xl border border-red-200 px-3 text-sm" /><B k="no" className="!bg-red-600 !text-white" disabled={busy || !reason.trim()} onClick={() => onReject(reason.trim())}>تأكيد الرفض</B></div>}
  </div>;
}
function ForecastCard({ f, busy, cl, pr, price, onApprove, onEdit, onReject }: { f: Pending; busy: boolean; cl: (id: string) => string; pr: (id: string) => string; price: (c: string, p: string) => number; onApprove: () => void; onEdit: (lines: Array<{ clinic_id: string; product_id: string; qty: number }>) => void; onReject: (reason: string) => void }) {
  const [edit, setEdit] = useState(false); const [rej, setRej] = useState(false); const [reason, setReason] = useState("");
  const [q, setQ] = useState<Record<string, number>>(() => Object.fromEntries(f.lines.map(l => [`${l.clinic_id}:${l.product_id}`, Number(l.quantity)])));
  const total = f.lines.reduce((s, l) => s + (q[`${l.clinic_id}:${l.product_id}`] ?? 0) * price(l.clinic_id, l.product_id), 0), units = Object.values(q).reduce((a, b) => a + b, 0);
  return <div className="dz-card rounded-2xl border border-[var(--border)] p-3">
    <div className="flex flex-wrap items-center gap-3"><RepAvatar name={f.rep_name} /><div className="min-w-0 flex-1"><b className="text-sm">{f.rep_name}</b><div className="text-[11px] text-[var(--muted)]">{f.status === "change_requested" ? "طلب تعديل على توقع معتمد" : "توقع جديد"}{f.reason ? ` · السبب: ${f.reason}` : ""}</div></div><div className="text-left"><div className="text-lg font-extrabold text-[var(--navy)]">{money(total)}</div><div className="text-[10.5px] text-[var(--muted)]">{units} وحدة · {f.lines.length} سطر</div></div></div>
    <div className="mt-2 grid gap-1 sm:grid-cols-2">{f.lines.map(l => { const k = `${l.clinic_id}:${l.product_id}`; return <div key={k} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--bg)] px-3 py-1.5 text-xs"><span className="min-w-0 truncate"><b>{cl(l.clinic_id)}</b> · {pr(l.product_id)}</span>{edit ? <input type="number" min={0} value={q[k] ?? 0} onChange={e => setQ(o => ({ ...o, [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} className="h-8 w-20 rounded-lg border border-sky-300 bg-white text-center font-extrabold" /> : <b>{q[k]} وحدة</b>}</div>; })}</div>
    <div className="mt-2 flex flex-wrap justify-end gap-1.5">
      {!edit ? <><B k="ok" disabled={busy} onClick={onApprove}><Icon name="check" size={14} />اعتماد</B><B k="edit" disabled={busy} onClick={() => setEdit(true)}><Icon name="pen" size={14} />عدّل الكميات</B><B k="no" disabled={busy} onClick={() => setRej(x => !x)}>رفض</B></>
        : <><B k="edit" disabled={busy} onClick={() => onEdit(f.lines.map(l => ({ clinic_id: l.clinic_id, product_id: l.product_id, qty: q[`${l.clinic_id}:${l.product_id}`] ?? 0 })))}>احفظ التعديل واعتمد</B><B k="ghost" onClick={() => setEdit(false)}>إلغاء</B></>}
    </div>
    {rej && <div className="dz-in mt-2 flex gap-2"><input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="سبب الرفض (المندوب هيشوفه)…" className="h-10 min-w-0 flex-1 rounded-xl border border-red-200 px-3 text-sm" /><B k="no" className="!bg-red-600 !text-white" disabled={busy || !reason.trim()} onClick={() => onReject(reason.trim())}>تأكيد الرفض</B></div>}
  </div>;
}

/* ═════ العيادات (من دفترة) والأسعار ═════ */
function Catalog({ v, month, busy, onPrice, onSync, onSpecial }: { v: View; month: string; busy: boolean; onPrice: (id: string, p: number) => void; onSync: () => void; onSpecial: (b: Record<string, unknown>) => void }) {
  const [edits, setEdits] = useState<Record<string, string>>({}); const [q, setQ] = useState(""); const [sp, setSp] = useState({ clinic_id: "", product_id: "", price: "" });
  const list = v.clinics.filter(c => !q.trim() || `${c.name} ${c.city}`.toLowerCase().includes(q.trim().toLowerCase()));
  return <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.2fr]">
    <div className="space-y-4">
      <section className={card}>
        <h3 className="mb-1 font-extrabold text-[var(--navy)]">سعر المنتجات</h3><p className="mb-3 text-[11.5px] text-[var(--muted)]">السعر ده بيستخدم في الأهداف (مبلغ ⇄ وحدات) وفي التوقعات والمبيعات لأي عيادة مالهاش سعر خاص.</p>
        <div className="space-y-2">{v.products.map(p => { const val = edits[p.id] ?? (p.unit_price ? String(p.unit_price) : ""); const dirty = edits[p.id] !== undefined && Number(edits[p.id]) !== Number(p.unit_price || 0); return <div key={p.id} className={`flex items-center gap-2 rounded-2xl border p-2.5 ${p.unit_price ? "border-[var(--border)]" : "border-red-200 bg-red-50/40"}`}>
          <b className="flex-1">{p.name}</b><input type="number" min={0} inputMode="decimal" value={val} placeholder="السعر" onChange={e => setEdits(o => ({ ...o, [p.id]: e.target.value }))} className="h-10 w-32 rounded-xl border border-[var(--border)] px-3 text-center font-extrabold" /><span className="text-xs text-[var(--muted)]">ر.س</span>
          <B k={dirty ? "ok" : "ghost"} disabled={busy || !dirty || !(Number(val) > 0)} onClick={() => { onPrice(p.id, Number(val)); setEdits(o => { const n = { ...o }; delete n[p.id]; return n; }); }}>حفظ</B></div>; })}</div>
      </section>
      <section className={card}>
        <h3 className="mb-1 font-extrabold text-[var(--navy)]">سعر خاص لعيادة</h3><p className="mb-3 text-[11.5px] text-[var(--muted)]">اختياري — لو عيادة واخدة سعر مختلف، بيتطبق من {mName(month)} ولحد ما تغيّره.</p>
        <div className="grid gap-2 sm:grid-cols-3"><select value={sp.clinic_id} onChange={e => setSp({ ...sp, clinic_id: e.target.value })} className="h-10 rounded-xl border border-[var(--border)] px-2 text-sm"><option value="">العيادة</option>{v.clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={sp.product_id} onChange={e => setSp({ ...sp, product_id: e.target.value })} className="h-10 rounded-xl border border-[var(--border)] px-2 text-sm"><option value="">المنتج</option>{v.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><input type="number" min={0} value={sp.price} onChange={e => setSp({ ...sp, price: e.target.value })} placeholder="السعر" className="h-10 rounded-xl border border-[var(--border)] px-3 text-sm" /></div>
        <div className="mt-2 flex justify-end"><B k="primary" disabled={busy || !sp.clinic_id || !sp.product_id || !(Number(sp.price) > 0) || month !== riyadhMonth(new Date())} onClick={() => { onSpecial({ clinic_id: sp.clinic_id, product_id: sp.product_id, price: Number(sp.price) }); setSp({ clinic_id: "", product_id: "", price: "" }); }}>حفظ السعر الخاص</B></div>
        {v.specialPrices.length > 0 && <div className="mt-3 space-y-1">{v.specialPrices.map(s => <div key={`${s.clinic_id}${s.product_id}`} className="flex justify-between rounded-lg bg-[var(--bg)] px-3 py-1.5 text-xs"><span>{v.clinics.find(c => c.id === s.clinic_id)?.name || "عيادة قديمة"} · {v.products.find(p => p.id === s.product_id)?.name}</span><b>{money(s.price)} <span className="font-normal text-[var(--muted)]">من {mName(s.month.slice(0, 7), false)}</span></b></div>)}</div>}
      </section>
    </div>
    <section className={card}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold text-[var(--navy)]">العيادات — من عملاء دفترة ({v.clinics.length})</h3><B k="ghost" disabled={busy} onClick={onSync}><Icon name="repeat" size={14} />تحديث من دفترة</B></div>
      <p className="mb-3 text-[11.5px] text-[var(--muted)]">نفس قائمة العملاء في «مبيعات دفترة» — هي اللي بتظهر للمناديب في التوقعات والمبيعات والأهداف. أي عميل جديد في دفترة بيتضاف لوحده مع كل تحديث.</p>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 دوّر…" className="mb-2 h-10 w-full rounded-xl border border-[var(--border)] px-3 text-sm" />
      <div className="max-h-[560px] space-y-1.5 overflow-y-auto">{list.map(c => <div key={c.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2">
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold" dir="auto">{c.name}</div><div className="text-[10.5px] text-[var(--muted)]">{c.city || "—"} · دفترة #{c.daftra_client_id}</div></div>
        {c.unpaid > 0 && <span className="text-[11px] font-bold text-amber-700">ليك {short(c.unpaid)}</span>}
        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ${c.rep_name ? "bg-[var(--sky-light)] text-[var(--navy)] ring-[var(--sky-border)]" : "bg-slate-50 text-slate-500 ring-slate-200"}`}>{c.rep_name || "مش مربوط بمندوب"}</span>
      </div>)}</div>
      <a href="/daftra-sales?tab=ar" className="mt-2 block text-center text-[11px] font-bold text-[var(--sky-deep)] hover:underline">ربط العملاء بالمناديب من «مبيعات دفترة» ‹</a>
    </section>
  </div>;
}

/* ═════ إقفال الشهر ═════ */
function CloseTab({ v, month, busy, fAct }: { v: View; month: string; busy: boolean; fAct: (n: string, e: Record<string, unknown>, ok: string) => Promise<boolean> }) {
  const mv = v.monthView; const [rep, setRep] = useState(""); const [reason, setReason] = useState(""); const [sure, setSure] = useState(false);
  const rows = buildReportRows({ targets: mv.targets.map(t => ({ ...t, qty: Number(t.quantity) })) as never, approved_sales: mv.approved_sales as never, approved_forecasts: mv.approved_forecasts as never });
  const name = (id: string, list: Array<{ id: string; name: string }>) => list.find(x => x.id === id)?.name || "—";
  const repsList = v.plan.reps.map(r => ({ id: r.id, name: r.name }));
  const closable = canCloseMonth(month, { ...mv, sales: mv.pending_sales } as unknown as Parameters<typeof canCloseMonth>[1]);
  return <div className="space-y-4">
    <section className={card}>
      <h3 className="mb-3 font-extrabold text-[var(--navy)]">تقرير {mName(month)} — المندوب × العيادة × المنتج</h3>
      {!rows.length ? <div className="rounded-2xl bg-[var(--bg)] p-6 text-center text-sm text-[var(--muted)]">لسه مفيش أهداف أو مبيعات معتمدة في الشهر ده</div>
        : <div className="-mx-4 overflow-x-auto px-4"><table className="w-full min-w-[760px] text-xs"><thead className="text-[10.5px] text-[var(--muted)]"><tr>{["المندوب", "العيادة", "المنتج", "التوقع", "الهدف", "المحقق", "قيمة الهدف", "قيمة المحقق"].map(h => <th key={h} className="p-2 text-right">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-[var(--border)]">{rows.map(r => <tr key={`${r.rep_id}${r.clinic_id}${r.product_id}`}><td className="p-2 font-bold">{name(r.rep_id, repsList)}</td><td className="p-2">{name(r.clinic_id, v.clinics)}</td><td className="p-2">{name(r.product_id, v.products)}</td><td className="p-2">{r.forecast_qty}</td><td className="p-2">{r.target_qty}</td><td className={`p-2 font-bold ${r.sold_qty >= r.target_qty && r.target_qty ? "text-emerald-700" : ""}`}>{r.sold_qty}</td><td className="p-2">{money(r.target_value)}</td><td className="p-2 font-bold">{money(r.sold_value)}</td></tr>)}</tbody></table></div>}
    </section>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={card}>
        <h3 className="mb-1 font-extrabold text-[var(--navy)]">سماح بإرسال توقع متأخر</h3><p className="mb-3 text-[11.5px] text-[var(--muted)]">بعد يوم 3 المندوب مش بيقدر يبعت توقعه غير باستثناء منك.</p>
        <div className="flex flex-wrap gap-1.5">{repsList.map(r => <button key={r.id} type="button" onClick={() => setRep(r.id)} className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${rep === r.id ? "bg-[var(--navy)] text-white ring-[var(--navy)]" : "bg-white ring-[var(--border)]"}`}>{r.name}</button>)}</div>
        <div className="mt-2 flex gap-2"><input value={reason} onChange={e => setReason(e.target.value)} placeholder="السبب…" className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--border)] px-3 text-sm" /><B k="edit" disabled={busy || !rep || !reason.trim() || month !== riyadhMonth(new Date())} onClick={() => void fAct("allow_late", { rep_id: rep, reason: reason.trim() }, "اتسمح له ✓").then(ok => { if (ok) { setRep(""); setReason(""); } })}>اسمح</B></div>
      </section>
      <section className={card}>
        <h3 className="mb-1 font-extrabold text-[var(--navy)]">إقفال الشهر</h3><p className="mb-3 text-[11.5px] text-[var(--muted)]">بعد الإقفال مفيش تعديل على توقعات أو مبيعات الشهر. لازم مفيش حاجة معلقة.</p>
        {mv.is_closed ? <div className="rounded-xl bg-slate-100 p-3 text-sm font-bold text-slate-600">الشهر ده مقفول ✓</div>
          : <B k={sure ? "no" : "primary"} className={sure ? "!bg-red-600 !text-white" : ""} disabled={busy || !closable} onClick={() => { if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return; } setSure(false); void fAct("close", { month }, "اتقفل الشهر ✓"); }}>{sure ? "متأكد؟ اضغط تاني — مفيش رجوع" : `اقفل ${mName(month)}`}</B>}
        {!closable && !mv.is_closed && <div className="mt-2 text-[11px] text-[var(--muted)]">الإقفال بيتاح آخر يوم في الشهر وبعد ما تخلّص كل الموافقات.</div>}
      </section>
    </div>
  </div>;
}
