"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { computePlan, draftPlan, type CatalogRow, type PlanCost, type PlanData, type PlanItem } from "@/lib/plan";
import { C, Card, ExcelBtn, Hint, Kpi, MONTHS, Pill, num, pct, sar } from "./kit";

type Resp = { month: string; today: string; plan: PlanData | null; updated_at: string | null; catalog: CatalogRow[]; fixed: PlanCost[]; daftraCosts: PlanCost[]; saved_months: string[]; history: { from: string; to: string }; target_net_margin: number; has_daftra_month: boolean };
const shift = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
const mName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const riyadh = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const nowMonth = () => riyadh().slice(0, 7);
/** After the 20th we're usually planning next month. */
const startMonth = () => { const d = riyadh(); return Number(d.slice(8, 10)) >= 20 ? shift(d.slice(0, 7), 1) : d.slice(0, 7); };
const uid = () => Math.random().toString(36).slice(2, 10);
const LV: Record<string, [string, string, string]> = { danger: ["عاجل", "border-red-200 bg-red-50", "flag"], warn: ["مهم", "border-amber-200 bg-amber-50", "warn"], good: ["فرصة", "border-emerald-200 bg-emerald-50", "trophy"], info: ["للعلم", "border-sky-200 bg-sky-50", "sparkle"] };

function Num({ v, set, ph, w = "w-24", nullable, dis }: { v: number | null; set: (n: number | null) => void; ph?: string; w?: string; nullable?: boolean; dis?: boolean }) {
  return <input type="number" inputMode="decimal" step="any" min={0} disabled={dis} value={v ?? ""} placeholder={ph}
    onChange={e => { const s = e.target.value; set(s === "" ? (nullable ? null : 0) : Number(s)); }}
    className={`${w} rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-center text-sm font-bold text-[var(--navy)] placeholder:font-normal placeholder:text-slate-400 focus:border-[var(--sky)] focus:outline-none disabled:bg-[var(--bg)]`} />;
}

export function Planner() {
  const toast = useToast();
  const [month, setMonth] = useState(startMonth);
  const [r, setR] = useState<Resp | null>(null);
  const [data, setData] = useState<PlanData | null>(null);
  const [state, setState] = useState<"draft" | "saved" | "saving" | "dirty">("draft");
  const [confirmReset, setConfirmReset] = useState(false);
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
    if (!j?.catalog) { toast("تعذر تحميل الخطة", "error"); return; }
    setR(j);
    if (j.plan) { setData(j.plan); setState("saved"); }
    else { setData(draftPlan(j.catalog, j.fixed.length ? j.fixed : j.daftraCosts, j.target_net_margin)); setState("draft"); }
  }, [toast]);
  useEffect(() => { void load(month); }, [month, load]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); void save(); }, [save]);

  const update = (fn: (d: PlanData) => PlanData) => setData(d => {
    if (!d) return d; const n = fn(d); pending.current = { month, data: n }; setState("dirty");
    if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void save(), 1200); return n;
  });
  const setItem = (key: string, patch: Partial<PlanItem>) => update(d => ({ ...d, items: d.items.map(i => i.key === key ? { ...i, ...patch } : i) }));
  const setCost = (id: string, patch: Partial<PlanCost>) => update(d => ({ ...d, costs: d.costs.map(c => c.id === id ? { ...c, ...patch } : c) }));
  const goMonth = async (m: string) => { if (!m || m === month) return; await flush(); setData(null); setMonth(m); };

  const res = useMemo(() => data && r ? computePlan(data, r.catalog) : null, [data, r]);
  const rowOf = useMemo(() => new Map((res?.rows || []).map(x => [x.key, x])), [res]);
  const cat = useMemo(() => new Map((r?.catalog || []).map(c => [c.key, c])), [r]);

  async function copyPrev() {
    const j = await fetch(`/api/admin/finance/plan?month=${shift(month, -1)}`).then(x => x.json()).catch(() => null) as Resp | null;
    if (!j?.plan) { toast(`مفيش خطة محفوظة لشهر ${mName(shift(month, -1))}`, "error"); return; }
    update(() => ({ ...j.plan!, items: j.plan!.items.map(i => ({ ...i, actual_qty: null, actual_price: null })), costs: j.plan!.costs.map(c => ({ ...c, actual: null })) }));
    toast("اتنسخت خطة الشهر اللي فات (من غير الأرقام الفعلية)", "success");
  }
  function reset() {
    if (!r) return; if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 4000); return; }
    setConfirmReset(false); update(() => draftPlan(r.catalog, r.fixed.length ? r.fixed : r.daftraCosts, r.target_net_margin)); toast("رجعت الخطة لمسودة من بيانات دفترة", "success");
  }
  function fillActual() {
    update(d => { const have = new Set(d.items.map(i => i.key));
      const items = d.items.map(i => { const c = cat.get(i.key); return c && (c.d_qty || i.include) ? { ...i, actual_qty: c.d_qty || 0, actual_price: c.d_price ?? null } : i; });
      for (const c of r?.catalog || []) if (c.d_qty > 0 && !have.has(c.key)) items.push({ key: c.key, name: c.name, include: false, cost: c.avg_cost ?? c.last_cost ?? 0, price: c.d_price ?? c.price ?? 0, mix: 0, qty: null, actual_qty: c.d_qty, actual_price: c.d_price });
      return { ...d, items }; });
    toast("اتملت الكميات والأسعار الفعلية من فواتير دفترة للشهر ده", "success");
  }
  function addItem(key: string) {
    const c = cat.get(key); if (!c || !data) return; setAdding("");
    if (data.items.some(i => i.key === key)) { setItem(key, { include: true }); return; }
    update(d => ({ ...d, items: [...d.items, { key, name: c.name, include: true, cost: c.avg_cost ?? c.last_cost ?? 0, price: c.price ?? c.list_price ?? 0, mix: Math.max(1, Math.round(c.hist_qty)), qty: null, actual_qty: null, actual_price: null }] }));
  }

  if (!r || !data || !res) return <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-white" />)}</div>;
  const t = res.t, cur = nowMonth(), isPast = month < cur, isNow = month === cur;
  const notIn = r.catalog.filter(c => !data.items.some(i => i.key === c.key && i.include));
  const per100 = t.plan_revenue > 0 ? [["تكلفة البضاعة", t.plan_cogs, C.slate], ["عمولات ومتغيرة", t.plan_variable, C.violet], ["رواتب ومصاريف", t.fixed, C.orange], [t.plan_profit >= 0 ? "صافي ربحك" : "خسارة", Math.abs(t.plan_profit), t.plan_profit >= 0 ? C.green : C.red]] as Array<[string, number, string]> : [];
  const per100Tot = per100.reduce((s, x) => s + x[1], 0) || 1;
  const statusPill = (key: string) => { const x = rowOf.get(key); if (!x) return null;
    if (x.issue === "loss") return <Pill text="بيخسر" cls="bg-red-50 text-red-700 ring-red-200" />;
    if (x.issue === "no_price") return <Pill text="اكتب السعر" cls="bg-red-50 text-red-700 ring-red-200" />;
    if (x.issue === "no_cost") return <Pill text="من غير تكلفة" cls="bg-amber-50 text-amber-800 ring-amber-200" />;
    if (x.issue === "thin") return <Pill text="هامش ضعيف" cls="bg-amber-50 text-amber-800 ring-amber-200" />;
    if (x.stretch !== null && x.stretch > 2 && x.plan_qty >= 5) return <Pill text={`${x.stretch.toFixed(1)}× المعتاد`} cls="bg-orange-50 text-orange-700 ring-orange-200" />;
    if (x.hist_qty === 0 && x.plan_qty > 0) return <Pill text="صنف جديد" cls="bg-sky-50 text-sky-700 ring-sky-200" />;
    return <Pill text="تمام" cls="bg-emerald-50 text-emerald-700 ring-emerald-200" />; };

  return <div className="space-y-4">
    {/* header */}
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-white p-3">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => void goMonth(shift(month, -1))} className="rounded-lg bg-[var(--bg)] px-2.5 py-1.5 text-sm font-bold" aria-label="الشهر السابق">›</button>
        <input type="month" value={month} onChange={e => void goMonth(e.target.value)} className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm font-bold" />
        <button type="button" onClick={() => void goMonth(shift(month, 1))} className="rounded-lg bg-[var(--bg)] px-2.5 py-1.5 text-sm font-bold" aria-label="الشهر التالي">‹</button>
      </div>
      <h2 className="text-lg font-extrabold text-[var(--navy)]">خطة {mName(month)}</h2>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${state === "saved" ? "bg-emerald-50 text-emerald-700" : state === "draft" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800"}`}>{state === "saved" ? "محفوظة ✓" : state === "saving" ? "بتتحفظ…" : state === "dirty" ? "هتتحفظ تلقائياً…" : "مسودة من دفترة — أي تعديل بيتحفظ لوحده"}</span>
      <div className="mr-auto flex flex-wrap gap-2">
        <button type="button" onClick={() => void copyPrev()} className="rounded-xl bg-[var(--bg)] px-3 py-2 text-xs font-bold text-[var(--navy)] hover:bg-[var(--sky-light)]">انسخ خطة الشهر اللي فات</button>
        <button type="button" onClick={reset} className={`rounded-xl px-3 py-2 text-xs font-bold ${confirmReset ? "bg-red-600 text-white" : "bg-[var(--bg)] text-[var(--navy)] hover:bg-[var(--sky-light)]"}`}>{confirmReset ? "متأكد؟ اضغط تاني" : "ابدأ من جديد"}</button>
        {state === "saved" || state === "saving" ? <ExcelBtn href={`/api/admin/finance/export?section=plan&month=${month}`} label="الخطة Excel" /> : <button type="button" onClick={() => void flush()} className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">احفظ الأول عشان Excel</button>}
      </div>
      {r.saved_months.length > 0 && <div className="flex w-full flex-wrap gap-1 text-[11px]"><span className="text-[var(--muted)]">خطط محفوظة:</span>{r.saved_months.map(m => <button key={m} type="button" onClick={() => void goMonth(m)} className={`rounded-full px-2 py-0.5 font-bold ${m === month ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)] text-[var(--navy)]"}`}>{mName(m)}</button>)}</div>}
    </div>

    {/* ① costs & target */}
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <Card className="xl:col-span-3" title="① رواتب ومصاريف الشهر" hint="كل اللي بتدفعه في الشهر سواء بعت أو ما بعتش: رواتب، إيجار، تسويق، اشتراكات… (قبل الضريبة). العمود 'الفعلي' اختياري — املاه آخر الشهر لو المصروف اختلف."
        right={<div className="flex flex-wrap gap-1.5">
          {r.fixed.length > 0 && <button type="button" onClick={() => update(d => ({ ...d, costs: r.fixed.map(c => ({ ...c, id: uid() })) }))} className="rounded-lg bg-[var(--bg)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--navy)]">من مصاريفي الثابتة</button>}
          <button type="button" onClick={() => update(d => ({ ...d, costs: r.daftraCosts.map(c => ({ ...c, id: uid() })) }))} className="rounded-lg bg-[var(--bg)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--navy)]">متوسط دفترة (آخر 6 شهور)</button>
        </div>}>
        <div className="-mx-4 overflow-x-auto px-4"><table className="w-full min-w-[520px] text-sm">
          <thead className="text-xs text-[var(--muted)]"><tr><th className="p-1.5 text-right">النوع</th><th className="p-1.5 text-right">البند</th><th className="p-1.5">المخطط شهرياً</th><th className="p-1.5">الفعلي</th><th /></tr></thead>
          <tbody>{data.costs.map(c => <tr key={c.id} className="border-t border-[var(--border)]">
            <td className="p-1.5"><select value={c.kind} onChange={e => setCost(c.id, { kind: e.target.value as PlanCost["kind"] })} className="rounded-lg border border-[var(--border)] bg-white px-1.5 py-1.5 text-xs font-bold"><option value="salary">راتب</option><option value="expense">مصروف</option></select></td>
            <td className="p-1.5"><input value={c.name} onChange={e => setCost(c.id, { name: e.target.value })} className="w-full min-w-[140px] rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm" /></td>
            <td className="p-1.5 text-center"><Num v={c.planned} set={n => setCost(c.id, { planned: n ?? 0 })} w="w-28" /></td>
            <td className="p-1.5 text-center"><Num v={c.actual} set={n => setCost(c.id, { actual: n })} ph={String(c.planned)} w="w-28" nullable /></td>
            <td className="p-1.5"><button type="button" onClick={() => update(d => ({ ...d, costs: d.costs.filter(x => x.id !== c.id) }))} className="rounded-lg px-2 py-1 text-red-600 hover:bg-red-50" aria-label="حذف">✕</button></td>
          </tr>)}</tbody>
          <tfoot><tr className="border-t-2 border-[var(--border)] font-extrabold"><td className="p-1.5" colSpan={2}>الإجمالي <span className="text-xs font-normal text-[var(--muted)]">(رواتب {sar(t.salaries)} · مصاريف {sar(t.fixed - t.salaries)})</span></td><td className="p-1.5 text-center">{sar(t.fixed)}</td><td className="p-1.5 text-center">{sar(t.fixed_actual)}</td><td /></tr></tfoot>
        </table></div>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => update(d => ({ ...d, costs: [...d.costs, { id: uid(), name: "راتب", kind: "salary", planned: 0, actual: null }] }))} className="rounded-lg bg-[var(--sky-light)] px-3 py-1.5 text-xs font-bold text-[var(--navy)]">+ راتب</button>
          <button type="button" onClick={() => update(d => ({ ...d, costs: [...d.costs, { id: uid(), name: "مصروف", kind: "expense", planned: 0, actual: null }] }))} className="rounded-lg bg-[var(--sky-light)] px-3 py-1.5 text-xs font-bold text-[var(--navy)]">+ مصروف</button>
        </div>
      </Card>
      <Card className="xl:col-span-2" title="② هدفك للشهر">
        <label className="block text-xs font-bold">صافي الربح اللي عايزه في الشهر (بعد كل المصاريف)<Hint text="ده المكسب اللي يفضل في جيبك بعد تكلفة البضاعة والرواتب والمصاريف. اكتب 0 لو عايز تعرف بس نقطة التعادل." /></label>
        <div className="mt-2 flex flex-wrap items-center gap-2"><Num v={data.target_profit} set={n => update(d => ({ ...d, target_profit: n ?? 0 }))} w="w-36" /><span className="text-xs text-[var(--muted)]">ر.س</span>
          {[0, 10000, 25000, 50000, 100000].map(v => <button key={v} type="button" onClick={() => update(d => ({ ...d, target_profit: v }))} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${data.target_profit === v ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)] text-[var(--navy)]"}`}>{v ? num(v) : "تعادل بس"}</button>)}</div>
        <label className="mt-5 block text-xs font-bold"><span className="flex justify-between"><span>تكاليف بتزيد مع كل بيعة<Hint text="عمولات المناديب، شحن وتوصيل، عينات مجانية، خصم تعجيل الدفع… كنسبة من سعر البيع. لو مفيش سيبها 0%." /></span><b className="text-[var(--navy)]">{data.variable_pct}%</b></span>
          <input type="range" min={0} max={30} step={0.5} value={data.variable_pct} onChange={e => update(d => ({ ...d, variable_pct: Number(e.target.value) }))} className="mt-2 w-full accent-[var(--sky)]" /></label>
        <div className="mt-4 rounded-xl bg-[var(--bg)] p-3 text-[12.5px] leading-6">
          محتاج تغطي <b>{sar(t.fixed)}</b> مصاريف + <b>{sar(Math.max(0, t.target_profit))}</b> ربح = <b className="text-[var(--navy)]">{sar(t.fixed + Math.max(0, t.target_profit))}</b> من ربح الأصناف.
          {t.avg_unit_profit > 0 && <> متوسط ربح الحبة <b>{sar(t.avg_unit_profit, 2)}</b> ← محتاج <b className="text-[var(--navy)]">{num(t.target_pieces)} حبة</b>.</>}
        </div>
      </Card>
    </div>

    {/* ③ products */}
    <Card title="③ الأصناف — اكتب سعر البيع والكميات بتتحسب لوحدها" hint="التكلفة = متوسط سعر الشراء المرجّح من فواتير دفترة (قبل الضريبة) وتقدر تعدّلها. 'نسبته من البيع' = من كل 100 حبة بتبيعها كام حبة من الصنف ده — مبدئياً من بيعك الفعلي آخر 6 شهور. الكمية المطلوبة بتتحسب تلقائياً، ولو كتبت كمية بإيدك هتعتمدها.">
      <div className="-mx-4 overflow-x-auto px-4"><table className="w-full min-w-[1000px] text-sm">
        <thead className="bg-[var(--bg)] text-[11px] text-[var(--muted)]"><tr>
          <th className="p-2" /><th className="p-2 text-right">الصنف</th><th className="p-2">تكلفة الحبة</th><th className="p-2">سعر البيع</th><th className="p-2">ربح الحبة</th>
          <th className="p-2">نسبته من البيع %</th><th className="p-2">الكمية المطلوبة</th><th className="p-2">للتعادل</th><th className="p-2">مبيعات متوقعة</th><th className="p-2">ربح متوقع</th><th className="p-2">الحالة</th></tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{data.items.filter(i => i.include).map(i => { const x = rowOf.get(i.key), c = cat.get(i.key); return <tr key={i.key} className="hover:bg-[var(--sky-light)]/40">
          <td className="p-2"><button type="button" title="شيله من الخطة" onClick={() => setItem(i.key, { include: false })} className="rounded-lg px-1.5 py-1 text-[var(--muted)] hover:bg-red-50 hover:text-red-600">✕</button></td>
          <td className="max-w-[200px] p-2"><div className="truncate font-bold" dir="auto" title={i.name}>{i.name}</div><div className="text-[10.5px] text-[var(--muted)]">بتبيع ~{num(c?.hist_qty ?? 0, 1)} حبة/شهر · مخزون {num(c?.stock ?? 0)}</div></td>
          <td className="p-2 text-center"><Num v={i.cost} set={n => setItem(i.key, { cost: n ?? 0 })} />{c?.last_cost ? <div className="text-[10px] text-[var(--muted)]">آخر شراء {num(c.last_cost, 2)}</div> : null}</td>
          <td className="p-2 text-center"><Num v={i.price} set={n => setItem(i.key, { price: n ?? 0 })} />{x?.min_price ? <div className="text-[10px] text-[var(--muted)]">أقل سعر {num(x.min_price, 2)}</div> : null}</td>
          <td className={`p-2 text-center font-extrabold ${x && x.unit_profit <= 0 ? "text-red-700" : "text-emerald-700"}`}>{sar(x?.unit_profit ?? 0, 2)}<div className="text-[10.5px] font-bold opacity-80">{pct(x?.unit_margin ?? null)}</div></td>
          <td className="p-2 text-center"><Num v={i.mix} set={n => setItem(i.key, { mix: n ?? 0 })} w="w-20" /><div className="text-[10px] text-[var(--muted)]">= {pct(x?.share ?? 0)}</div></td>
          <td className="p-2 text-center"><div className="flex items-center justify-center gap-1"><Num v={i.qty} set={n => setItem(i.key, { qty: n === null ? null : Math.round(n) })} ph={String(x?.target_qty ?? 0)} w="w-20" nullable />{i.qty !== null && <button type="button" title="رجّعها للمقترح" onClick={() => setItem(i.key, { qty: null })} className="text-xs text-[var(--sky-deep)]">↺</button>}</div><div className="text-[10px] text-[var(--muted)]">{i.qty !== null ? `المقترح ${num(x?.target_qty)}` : "مقترح"}</div></td>
          <td className="p-2 text-center text-[var(--muted)]">{num(x?.be_qty)}</td>
          <td className="p-2 text-center">{sar(x?.plan_revenue)}</td>
          <td className={`p-2 text-center font-bold ${(x?.plan_profit ?? 0) < 0 ? "text-red-700" : ""}`}>{sar(x?.plan_profit)}</td>
          <td className="p-2 text-center">{statusPill(i.key)}</td>
        </tr>; })}</tbody>
        <tfoot><tr className="bg-[var(--sky-light)] font-extrabold"><td /><td className="p-2">الإجمالي</td><td colSpan={4} /><td className="p-2 text-center">{num(t.plan_pieces)} حبة</td><td className="p-2 text-center">{num(t.be_pieces)}</td><td className="p-2 text-center">{sar(t.plan_revenue)}</td><td className="p-2 text-center">{sar(t.plan_gross)}</td><td /></tr></tfoot>
      </table></div>
      <div className="mt-3 flex flex-wrap items-center gap-2"><select value={adding} onChange={e => addItem(e.target.value)} className="max-w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"><option value="">+ ضيف صنف للخطة…</option>{notIn.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}</select>
        <span className="text-[11px] text-[var(--muted)]">الأسعار والتكاليف هنا قبل ضريبة القيمة المضافة.</span></div>
    </Card>

    {/* ④ result */}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Kpi label="نقطة التعادل" value={sar(t.be_revenue)} sub={`${num(t.be_pieces)} حبة — أقل من كده خسارة`} icon="coverage" color={C.amber} hint="المبيعات اللي بتغطي تكلفة البضاعة وكل الرواتب والمصاريف من غير ربح ولا خسارة." />
      <Kpi label="هدف المبيعات" value={sar(t.target_revenue)} sub={`${num(t.target_pieces)} حبة لربح ${sar(t.target_profit)}`} icon="trophy" color={C.green} />
      <Kpi label="ربحك لو حققت الخطة" value={sar(t.plan_profit)} sub={`هامش صافي ${pct(t.plan_margin)}`} icon="wallet" color={t.plan_profit >= 0 ? C.green : C.red} tone={t.plan_profit >= 0 ? "good" : "bad"} />
      <Kpi label="هامش الأمان" value={pct(t.safety)} sub="ممكن المبيعات تقل بالنسبة دي من غير خسارة" icon="warn" color={C.blue} hint="كل ما يكون أعلى كل ما أمان أكتر. أقل من 15% يعتبر خطر." />
      <Kpi label="بضاعة محتاج تشتريها" value={sar(t.buy_cash)} sub="الناقص عن المخزون بسعر التكلفة" icon="products" color={C.violet} />
    </div>
    {per100.length > 0 && <Card title="كل 100 ريال هتبيعها بتروح فين؟" hint="توزيع المبيعات المتوقعة في الخطة.">
      <div className="flex h-7 overflow-hidden rounded-full">{per100.map(([l, v, c]) => <div key={l} style={{ width: `${v / per100Tot * 100}%`, background: c }} title={l} />)}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">{per100.map(([l, v, c]) => <div key={l} className="flex items-center gap-1.5"><i className="h-3 w-3 rounded" style={{ background: c }} /><span>{l}</span><b className="mr-auto">{(v / t.plan_revenue * 100).toFixed(0)} ر.س</b></div>)}</div>
    </Card>}
    <Card title="رأي المستشار في الخطة"><div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{res.advice.map((a, k) => { const [tag, cls, ic] = LV[a.level]; return <div key={k} className={`rounded-2xl border p-4 ${cls}`}><div className="flex items-start gap-2"><Icon name={ic} size={18} /><div className="min-w-0"><div className="text-[10.5px] font-bold opacity-70">{tag}</div><div className="font-extrabold text-[var(--navy)]">{a.title}</div><p className="mt-1 text-[12.5px] leading-6 text-slate-700">{a.text}</p></div></div></div>; })}</div></Card>

    {/* ⑤ actual */}
    <Card title={`④ الفعلي — اللي اتباع فعلاً في ${mName(month)}`} hint="اكتب الكميات اللي اتباعت فعلاً وسعر البيع الفعلي (لو اختلف). أو اضغط 'املأ من دفترة' وأنا أجيبها من فواتير الشهر. لو سبت السعر فاضي هيتحسب بسعر الخطة."
      right={r.has_daftra_month ? <button type="button" onClick={fillActual} className="flex items-center gap-1.5 rounded-xl bg-[var(--navy)] px-3 py-2 text-xs font-bold text-white"><Icon name="repeat" size={14} />املأ من دفترة</button> : <span className="text-[11px] text-[var(--muted)]">الشهر لسه ما بدأش</span>}>
      {!isPast && !isNow && !t.has_actual ? <p className="text-sm text-[var(--muted)]">لما الشهر يبدأ تقدر تسجل البيع الفعلي هنا وتقارنه بالخطة.</p> : <>
        <div className="-mx-4 overflow-x-auto px-4"><table className="w-full min-w-[820px] text-sm">
          <thead className="bg-[var(--bg)] text-[11px] text-[var(--muted)]"><tr><th className="p-2 text-right">الصنف</th><th className="p-2">المخطط</th><th className="p-2">اتباع فعلاً</th><th className="p-2">سعر البيع الفعلي</th><th className="p-2">مبيعات فعلية</th><th className="p-2">ربح فعلي</th><th className="p-2 w-40">التحقيق</th></tr></thead>
          <tbody className="divide-y divide-[var(--border)]">{data.items.filter(i => i.include || i.actual_qty !== null).map(i => { const x = rowOf.get(i.key), c = cat.get(i.key), a = x?.achieve ?? null; return <tr key={i.key}>
            <td className="max-w-[230px] p-2"><div className="truncate font-bold" dir="auto">{i.name}{!i.include && <span className="mr-1 text-[10px] font-normal text-[var(--muted)]">(برّه الخطة)</span>}</div>{c && c.d_qty > 0 && <div className="text-[10.5px] text-[var(--muted)]">في دفترة: {num(c.d_qty)} حبة × {num(c.d_price, 2)}</div>}</td>
            <td className="p-2 text-center">{num(x?.plan_qty ?? 0)}</td>
            <td className="p-2 text-center"><Num v={i.actual_qty} set={n => setItem(i.key, { actual_qty: n })} ph="—" w="w-20" nullable /></td>
            <td className="p-2 text-center"><Num v={i.actual_price} set={n => setItem(i.key, { actual_price: n })} ph={String(i.price)} nullable /></td>
            <td className="p-2 text-center">{sar(x?.actual_revenue ?? null)}</td>
            <td className={`p-2 text-center font-bold ${(x?.actual_profit ?? 0) < 0 ? "text-red-700" : "text-emerald-700"}`}>{sar(x?.actual_profit ?? null)}</td>
            <td className="p-2">{a === null ? <span className="text-[var(--muted)]">—</span> : <div><div className="h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, a)}%`, background: a >= 100 ? C.green : a >= 70 ? C.amber : C.red }} /></div><div className="mt-0.5 text-center text-[11px] font-bold">{a.toFixed(0)}%</div></div>}</td>
          </tr>; })}</tbody></table></div>
        {t.has_actual && <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] p-4"><div className="mb-2 font-extrabold text-[var(--navy)]">الخطة × الفعلي</div>
            <table className="w-full text-sm"><thead className="text-xs text-[var(--muted)]"><tr><th className="p-1.5 text-right">البند</th><th className="p-1.5">الخطة</th><th className="p-1.5">الفعلي</th><th className="p-1.5">الفرق</th></tr></thead><tbody>
              {([["المبيعات", t.plan_revenue, t.actual_revenue, 1], ["ربح الأصناف (بعد التكلفة والعمولات)", t.plan_gross, t.actual_gross, 1], ["الرواتب والمصاريف", t.fixed, t.fixed_actual, -1], ["صافي الربح", t.plan_profit, t.actual_profit, 1]] as Array<[string, number, number, number]>).map(([l, p, a, s]) => <tr key={l} className="border-t border-[var(--border)]"><td className="p-1.5 font-bold">{l}</td><td className="p-1.5 text-center">{sar(p)}</td><td className="p-1.5 text-center font-bold">{sar(a)}</td><td className={`p-1.5 text-center font-bold ${(a - p) * s >= 0 ? "text-emerald-700" : "text-red-700"}`}>{a - p >= 0 ? "+" : ""}{sar(a - p)}</td></tr>)}
            </tbody></table></div>
          <div className={`rounded-2xl p-4 ${t.actual_profit >= t.target_profit ? "bg-emerald-50" : t.actual_profit >= 0 ? "bg-amber-50" : "bg-red-50"}`}>
            <div className="text-xs font-bold text-[var(--muted)]">صافي الربح الفعلي</div>
            <div className={`mt-1 text-3xl font-extrabold ${t.actual_profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{sar(t.actual_profit)}</div>
            <div className="mt-1 text-xs">هامش {pct(t.actual_margin)} · حققت {pct(t.achieve_revenue)} من مبيعات الخطة</div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, t.target_profit > 0 ? t.actual_profit / t.target_profit * 100 : t.actual_profit >= 0 ? 100 : 0))}%`, background: t.actual_profit >= t.target_profit ? C.green : C.amber }} /></div>
            <div className="mt-1 text-[11px] text-[var(--muted)]">من هدف {sar(t.target_profit)}</div>
          </div>
        </div>}
      </>}
    </Card>
  </div>;
}
