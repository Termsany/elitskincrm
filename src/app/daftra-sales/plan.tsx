"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { computePlan, type CatalogRow, type PlanCost, type PlanData, type PlanItem } from "@/lib/plan";
import { ExcelBtn, MONTHS, sar } from "./kit";
import { riyadhToday } from "@/lib/fmt";

type Resp = { month: string; today: string; plan: PlanData | null; updated_at: string | null; catalog: CatalogRow[]; fixed: PlanCost[]; daftraCosts: PlanCost[]; saved_months: string[];
  has_daftra_month: boolean; goal: { sales: number; gross: number; opex: number; net: number } | null; forecast: { total: number; reps: number; byItem: Record<string, number> } };
const shift = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
const mName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
/** After the 20th we're usually looking at next month. */
const startMonth = () => { const d = riyadhToday(); return Number(d.slice(8, 10)) >= 20 ? shift(d.slice(0, 7), 1) : d.slice(0, 7); };
const r2 = (n: number) => Math.round(n * 100) / 100;
const item = (c: CatalogRow, qty: number | null): PlanItem => ({ key: c.key, name: c.name, include: !!qty, cost: r2(c.avg_cost ?? c.last_cost ?? 0), price: r2(c.price ?? c.list_price ?? 0), mix: qty || 0, qty, actual_qty: null, actual_price: null });

/** The month's costs come from the fixed-costs list (annual goals); without one, Daftra's 6-month average. */
const costsOf = (r: Resp) => r.fixed.length ? r.fixed : r.daftraCosts;
/** A plan is just expected quantities: no profit target, no variable %, the mix follows the quantities. */
const normalize = (p: PlanData, r: Resp): PlanData => ({ ...p, target_profit: 0, variable_pct: 0, costs: costsOf(r),
  items: p.items.map(i => ({ ...i, include: (i.qty ?? 0) > 0, mix: i.qty ?? 0 })) });
/** First draft: last 6 months' average quantities, or the reps' approved forecasts when there are any. */
function draft(r: Resp, from: "history" | "forecast"): PlanData {
  const by = r.forecast.byItem;
  const items = r.catalog.filter(c => c.hist_qty > 0 || by[c.key] !== undefined).map(c => item(c, from === "forecast" ? by[c.key] ?? 0 : Math.round(c.hist_qty)));
  return normalize({ target_profit: 0, variable_pct: 0, costs: [], items, notes: "" }, r);
}

function Num({ v, set, w = "w-24", dis }: { v: number | null; set: (n: number) => void; w?: string; dis?: boolean }) {
  return <input type="number" inputMode="decimal" step="any" min={0} disabled={dis} value={v === null ? "" : v} placeholder="0"
    onChange={e => set(e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)))}
    className={`${w} rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-center text-sm font-bold text-[var(--navy)] placeholder:font-normal placeholder:text-slate-400 focus:border-[var(--sky)] focus:outline-none disabled:bg-[var(--bg)]`} />;
}
function Step({ label, value, tone = "text-[var(--navy)]", op }: { label: string; value: number; tone?: string; op?: string }) {
  return <div className="flex items-center gap-2">{op && <span className="text-lg font-bold text-[var(--muted)]">{op}</span>}
    <div><div className="text-[11px] text-[var(--muted)]">{label}</div><div className={`text-lg font-extrabold ${tone}`}>{sar(value)}</div></div></div>;
}

/** Expected sales per item (units or amount) → cost of goods → the month's expenses → net profit. */
export function Planner({ ask }: { ask?: (q: string) => void }) {
  const toast = useToast();
  const [month, setMonth] = useState(startMonth);
  const [r, setR] = useState<Resp | null>(null);
  const [data, setData] = useState<PlanData | null>(null);
  const [state, setState] = useState<"draft" | "saved" | "saving" | "dirty">("draft");
  const [adding, setAdding] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ month: string; data: PlanData } | null>(null);

  const save = useCallback(async () => {
    const p = pending.current; if (!p) return; pending.current = null; setState("saving");
    const res = await fetch("/api/admin/finance/plan", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(p) }).catch(() => null);
    if (res?.ok) { setState(s => s === "saving" ? "saved" : s); setR(x => x && x.month === p.month && !x.saved_months.includes(p.month) ? { ...x, saved_months: [p.month, ...x.saved_months].sort().reverse() } : x); }
    else { setState("dirty"); toast("تعذر الحفظ — هحاول تاني مع أول تعديل", "error"); }
  }, [toast]);
  const flush = useCallback(async () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } await save(); }, [save]);

  const load = useCallback(async (m: string) => {
    const j = await fetch(`/api/admin/finance/plan?month=${m}`).then(x => x.json()).catch(() => null) as Resp | null;
    if (!j?.catalog) { toast("تعذر تحميل التوقع", "error"); return; }
    setR(j);
    if (j.plan) {
      // an older plan may have quantities worked out from a profit target: keep them as typed quantities
      const rows = new Map(computePlan(j.plan, j.catalog).rows.map(x => [x.key, x.plan_qty]));
      const old = j.plan.target_profit !== 0 || j.plan.variable_pct !== 0 || j.plan.items.some(i => i.include && i.qty === null);
      const p = normalize({ ...j.plan, items: j.plan.items.map(i => ({ ...i, qty: i.include ? i.qty ?? rows.get(i.key) ?? 0 : i.qty })) }, j);
      setData(p); setState("saved");
      if (old) { pending.current = { month: m, data: p }; void save(); }
    } else { setData(draft(j, Object.keys(j.forecast.byItem).length ? "forecast" : "history")); setState("draft"); }
  }, [toast, save]);
  useEffect(() => { void load(month); }, [month, load]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); void save(); }, [save]);

  const update = (fn: (d: PlanData) => PlanData) => setData(d => {
    if (!d || !r) return d; const n = normalize(fn(d), r); pending.current = { month, data: n }; setState("dirty");
    if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void save(), 1000); return n;
  });
  const setItem = (key: string, patch: Partial<PlanItem>) => update(d => ({ ...d, items: d.items.map(i => i.key === key ? { ...i, ...patch } : i) }));
  const goMonth = async (m: string) => { if (!m || m === month) return; await flush(); setData(null); setMonth(m); };

  const res = useMemo(() => data && r ? computePlan(data, r.catalog) : null, [data, r]);
  const cat = useMemo(() => new Map((r?.catalog || []).map(c => [c.key, c])), [r]);

  async function copyPrev() {
    const j = await fetch(`/api/admin/finance/plan?month=${shift(month, -1)}`).then(x => x.json()).catch(() => null) as Resp | null;
    if (!j?.plan) { toast(`مفيش توقع محفوظ لـ ${mName(shift(month, -1))}`, "error"); return; }
    update(d => ({ ...d, items: j.plan!.items.map(i => ({ ...i, actual_qty: null, actual_price: null })) }));
    toast("اتنسخ توقع الشهر اللي فات", "success");
  }
  function fill(from: "history" | "forecast") {
    if (!r) return; const by = r.forecast.byItem;
    update(d => {
      const have = new Set(d.items.map(i => i.key));
      const q = (c: CatalogRow | undefined, key: string) => from === "forecast" ? by[key] ?? 0 : Math.round(c?.hist_qty ?? 0);
      const extra = r.catalog.filter(c => !have.has(c.key) && q(c, c.key) > 0).map(c => item(c, q(c, c.key)));
      return { ...d, items: [...d.items.map(i => ({ ...i, qty: q(cat.get(i.key), i.key) })), ...extra] };
    });
    toast(from === "forecast" ? "اتملت من توقعات المناديب المعتمدة" : "اتملت من متوسط آخر 6 شهور", "success");
  }
  function addItem(key: string) {
    const c = cat.get(key); setAdding(""); if (!c || !data) return;
    if (data.items.some(i => i.key === key)) { setItem(key, { qty: Math.max(1, Math.round(c.hist_qty)) }); return; }
    update(d => ({ ...d, items: [...d.items, item(c, Math.max(1, Math.round(c.hist_qty)))] }));
  }

  if (!r || !data || !res) return <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-white" />)}</div>;
  const t = res.t, cur = riyadhToday().slice(0, 7);
  const rows = [...data.items].filter(i => (i.qty ?? 0) > 0 || cat.get(i.key)?.hist_qty).sort((a, b) => (b.qty ?? 0) * b.price - (a.qty ?? 0) * a.price || a.name.localeCompare(b.name));
  const notIn = r.catalog.filter(c => !rows.some(i => i.key === c.key));
  const costsLabel = r.fixed.length ? "الرواتب والمصاريف" : "المصاريف (متوسط دفترة)";
  const hasFc = Object.keys(r.forecast.byItem).length > 0;
  const goalDiff = r.goal ? t.plan_profit - r.goal.net : 0;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-white p-3">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => void goMonth(shift(month, -1))} className="rounded-lg bg-[var(--bg)] px-2.5 py-1.5 text-sm font-bold" aria-label="الشهر السابق">›</button>
        <input type="month" value={month} onChange={e => void goMonth(e.target.value)} className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm font-bold" />
        <button type="button" onClick={() => void goMonth(shift(month, 1))} className="rounded-lg bg-[var(--bg)] px-2.5 py-1.5 text-sm font-bold" aria-label="الشهر التالي">‹</button>
      </div>
      <h2 className="text-lg font-extrabold text-[var(--navy)]">توقع ربح {mName(month)}</h2>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${state === "saved" ? "bg-emerald-50 text-emerald-700" : state === "draft" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800"}`}>{state === "saved" ? "محفوظ ✓" : state === "saving" ? "بيتحفظ…" : state === "dirty" ? "هيتحفظ…" : "مسودة"}</span>
      <div className="mr-auto flex flex-wrap gap-2">
        <button type="button" onClick={() => fill("history")} className="rounded-xl bg-[var(--bg)] px-3 py-2 text-xs font-bold text-[var(--navy)] hover:bg-[var(--sky-light)]">متوسط آخر 6 شهور</button>
        {hasFc && <button type="button" onClick={() => fill("forecast")} className="rounded-xl bg-[var(--bg)] px-3 py-2 text-xs font-bold text-[var(--navy)] hover:bg-[var(--sky-light)]">توقعات المناديب ({sar(r.forecast.total)})</button>}
        <button type="button" onClick={() => void copyPrev()} className="rounded-xl bg-[var(--bg)] px-3 py-2 text-xs font-bold text-[var(--navy)] hover:bg-[var(--sky-light)]">انسخ الشهر اللي فات</button>
        {ask && <button type="button" onClick={() => ask(`راجع توقع ربح ${mName(month)}: إيه الأصناف اللي تزوّد الربح أكتر، وهل الكميات واقعية مقارنة بمتوسط البيع؟`)} className="rounded-xl bg-[var(--navy)] px-3 py-2 text-xs font-bold text-white">✨ اسأل المستشار</button>}
        {state === "saved" && <ExcelBtn href={`/api/admin/finance/export?section=plan&month=${month}`} label="Excel" />}
      </div>
    </div>

    <section className="sticky top-2 z-10 rounded-2xl border border-[var(--border)] bg-white/95 p-4 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Step label="المبيعات المتوقعة" value={t.plan_revenue} />
        <Step op="−" label="تكلفة البضاعة" value={t.plan_cogs} />
        <Step op="−" label={costsLabel} value={t.fixed} />
        <div className={`mr-auto rounded-2xl px-4 py-2 text-left ${t.plan_profit >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
          <div className="text-[11px] font-bold text-[var(--muted)]">صافي الربح</div>
          <div className={`text-2xl font-black ${t.plan_profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{t.plan_profit < 0 ? "−" : ""}{sar(Math.abs(t.plan_profit))}</div>
          {t.plan_margin !== null && <div className="text-[11px] text-[var(--muted)]">{t.plan_margin}% من المبيعات</div>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--border)] pt-2 text-[12.5px]">
        {t.be_revenue !== null && t.plan_revenue > 0 && <span>نقطة التعادل <b>{sar(t.be_revenue)}</b>{t.plan_revenue < t.be_revenue ? <b className="text-red-600"> · ناقص {sar(t.be_revenue - t.plan_revenue)}</b> : null}</span>}
        {r.goal && <span>هدف الشهر من السنة <b>{sar(r.goal.net)}</b> ربح · <b className={goalDiff >= 0 ? "text-emerald-700" : "text-amber-700"}>{goalDiff >= 0 ? "أعلى" : "أقل"} بـ {sar(Math.abs(goalDiff))}</b></span>}
        {month <= cur && t.has_actual && <span>الفعلي {month === cur ? "لحد النهارده" : ""} <b>{sar(t.actual_revenue)}</b> مبيعات · <b>{sar(t.actual_gross)}</b> ربح البضاعة{t.achieve_revenue !== null ? ` · ${Math.round(t.achieve_revenue)}% من المتوقع` : ""}</span>}
      </div>
    </section>

    <section className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
      <table className="w-full min-w-[760px] text-sm">
        <thead><tr className="border-b border-[var(--border)] text-[11px] text-[var(--muted)]">
          <th className="p-2.5 text-right">الصنف</th><th className="p-2.5">الكمية</th><th className="p-2.5">أو المبلغ</th><th className="p-2.5">سعر البيع</th><th className="p-2.5">التكلفة</th><th className="p-2.5">ربح الصنف</th>{month <= cur && <th className="p-2.5">اتباع</th>}<th />
        </tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{rows.map(i => {
          const q = i.qty ?? 0, rev = q * i.price, profit = q * (i.price - i.cost), c = cat.get(i.key);
          return <tr key={i.key} className={q > 0 ? "" : "opacity-60"}>
            <td className="p-2.5"><div className="font-bold" dir="auto">{i.name}</div>{c?.hist_qty ? <div className="text-[11px] text-[var(--muted)]">متوسطه {Math.round(c.hist_qty)} في الشهر</div> : null}</td>
            <td className="p-2 text-center"><Num v={q ? r2(q) : null} set={n => setItem(i.key, { qty: n })} w="w-20" /></td>
            <td className="p-2 text-center"><Num v={q ? Math.round(rev) : null} dis={!i.price} set={n => setItem(i.key, { qty: i.price ? n / i.price : 0 })} w="w-28" /></td>
            <td className="p-2 text-center"><Num v={i.price} set={n => setItem(i.key, { price: n })} /></td>
            <td className="p-2 text-center"><Num v={i.cost} set={n => setItem(i.key, { cost: n })} /></td>
            <td className={`p-2.5 text-center font-extrabold ${profit < 0 || (i.price > 0 && i.price <= i.cost) ? "text-red-600" : "text-[var(--navy)]"}`}>{q ? sar(profit) : "—"}{i.price > 0 && i.price <= i.cost && <div className="text-[10.5px] font-bold">بيخسر في كل حبة</div>}</td>
            {month <= cur && <td className="p-2.5 text-center text-xs">{i.actual_qty ? `${Math.round(i.actual_qty)}${q ? ` / ${Math.round(q)}` : ""}` : "—"}</td>}
            <td className="p-2 text-center">{q > 0 && <button type="button" onClick={() => setItem(i.key, { qty: 0 })} aria-label={`شيل ${i.name}`} className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--muted)] hover:text-red-600">✕</button>}</td>
          </tr>;
        })}</tbody>
      </table>
      {notIn.length > 0 && <div className="border-t border-[var(--border)] p-2.5">
        <select value={adding} onChange={e => addItem(e.target.value)} className="h-10 w-full max-w-md rounded-xl border border-[var(--border)] bg-white px-3 text-sm">
          <option value="">＋ ضيف صنف</option>{notIn.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
        </select>
      </div>}
    </section>
  </div>;
}
