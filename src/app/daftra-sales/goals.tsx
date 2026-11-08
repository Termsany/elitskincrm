"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { planOf, type Goals, type scorecard as Scorecard, type levers as Levers, type suggestGoals } from "@/lib/fin-goals";
import { sar, pct, MONTHS, C, Hint, Kpi, Card, MonthChart, Table } from "./kit";
import { riyadhToday } from "@/lib/fmt";

type SC = ReturnType<typeof Scorecard>;
type Data = { year: number; today: string; goals: Goals | null; updated_at: string | null; suggestion: Goals; basis: ReturnType<typeof suggestGoals>["basis"]; seasonal: number[]; scorecard: SC | null; preview: SC; levers: ReturnType<typeof Levers>; rep_targets?: { reps: Array<{ id: string; name: string; annual: number; locked: boolean }>; total: number }; baseline: { sales: number; cogs: number; opex: number; other: number; net: number } | null; years: number[] };
const isEqual = (w: number[]) => w.every(x => Math.abs(x - 1 / 12) < 1e-6);

function Num({ label, hint, value, onChange, suffix, step = 1 }: { label: string; hint?: string; value: number; onChange: (v: number) => void; suffix: string; step?: number }) {
  return <label className="block"><span className="text-xs font-bold">{label}{hint && <Hint text={hint} />}</span>
    <div className="mt-1 flex items-center rounded-xl border border-[var(--border)] bg-white focus-within:ring-2 focus-within:ring-[var(--sky)]"><input type="number" inputMode="decimal" step={step} value={Number.isFinite(value) ? value : ""} onChange={e => onChange(Number(e.target.value))} className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-2 text-sm font-bold" dir="ltr" /><span className="px-3 text-[11px] text-[var(--muted)]">{suffix}</span></div></label>;
}

function Slider({ label, v, set }: { label: string; v: number; set: (n: number) => void }) {
  return <label className="block"><div className="flex justify-between text-xs font-bold"><span>{label}</span><b className={v > 0 ? "text-emerald-700" : v < 0 ? "text-red-700" : "text-[var(--muted)]"}>{v > 0 ? "+" : ""}{v}%</b></div><input type="range" min={-20} max={20} value={v} onChange={e => set(Number(e.target.value))} className="mt-2 w-full accent-[var(--sky)]" /></label>;
}

export function GoalsTab() {
  const toast = useToast();
  const cy = Number(riyadhToday().slice(0, 4));
  // from November on, the useful plan is next year's
  const [year, setYear] = useState(() => Number(riyadhToday().slice(5, 7)) >= 11 ? cy + 1 : cy);
  const [d, setD] = useState<Data | null>(null);
  const [g, setG] = useState<Goals | null>(null);
  const [saving, setSaving] = useState(false);
  const [lv, setLv] = useState({ price: 0, volume: 0, cogs: 0, opex: 0 });
  const load = useCallback(async () => {
    const j = await fetch(`/api/admin/finance/goals?year=${year}`).then(r => r.json()).catch(() => null);
    if (j?.suggestion) { setD(j); setG(j.goals || j.suggestion); } else toast(j?.error || "تعذر تحميل الأهداف", "error");
  }, [year, toast]);
  useEffect(() => { void load(); }, [load]);
  const plan = useMemo(() => g ? planOf(g) : null, [g]);
  if (!d || !g || !plan) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  const dirty = JSON.stringify(g) !== JSON.stringify(d.goals);
  const set = (k: keyof Goals, v: number) => setG({ ...g, [k]: v });
  async function save() {
    setSaving(true);
    const r = await fetch("/api/admin/finance/goals", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ year, goals: g }) });
    const j = await r.json().catch(() => null); setSaving(false);
    if (!r.ok) toast(j?.error || "تعذر الحفظ", "error"); else { toast(`اتحفظت أهداف ${year}`, "success"); await load(); }
  }
  const sc = d.scorecard, b = d.basis, years = [...new Set([cy, cy + 1, ...d.years])].sort();
  const B = d.baseline;
  const sim = B ? (() => { const p = lv.price / 100, v = lv.volume / 100, c = lv.cogs / 100, o = lv.opex / 100; const sales = B.sales * (1 + p) * (1 + v), cogs = B.cogs * (1 + v) * (1 + c), opex = B.opex * (1 + o); return { sales, net: sales - cogs - opex + B.other }; })() : null;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-1.5">{years.map(y => <button key={y} type="button" onClick={() => setYear(y)} className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${y === year ? "bg-[var(--navy)] text-white" : "bg-white ring-1 ring-[var(--border)]"}`}>أهداف {y}{d.years.includes(y) ? " ✓" : ""}</button>)}
      {d.updated_at && <span className="mr-auto text-[11px] text-[var(--muted)]">آخر تعديل {new Date(d.updated_at).toLocaleDateString("ar-EG-u-nu-latn")}</span>}</div>

    {!d.goals && <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-[12.5px] leading-6 text-sky-950">
      <span className="text-sky-700"><Icon name="sparkle" size={20} /></span>
      <div className="min-w-0 flex-1"><b className="block text-sm">اقتراحي لأهداف {year} (لسه ما اتحفظتش)</b>
        {b.annual_sales <= 0 ? <>لسه مفيش أرقام كفاية من بداية الحسابات ({b.books_start || "—"}) عشان أبني عليها — المتوسط بيتحسب بعد أسبوع. حطيت لك هدف مبدئي = <b>نقطة التعادل {sar(b.break_even_annual)}</b> على مصاريف {sar(Math.max(b.fixed_month, b.opex_month))} في الشهر وهامش {pct(b.gross_margin)}. ارجع للتبويب ده بعد ما أول شهر يقفل وهتلاقي اقتراح مبني على أرقامك.</> : <>{b.provisional ? <>من أول {b.books_start} (أرقام تقديرية لحد ما الشهر يقفل): مبيعاتك بمعدل</> : <>{b.books_start ? `من ${b.books_start} (${b.months} شهر)` : `آخر ${b.months} شهر`}: مبيعاتك بمعدل</>} <b>{sar(b.annual_sales)}</b> في السنة، هامش مجمل ربح <b>{pct(b.gross_margin)}</b>، ومصاريف تشغيل <b>{sar(b.opex_month)}</b> في الشهر{b.fixed_month ? <> (الثابتة اللي مسجلها {sar(b.fixed_month)})</> : null}. يعني <b>نقطة التعادل السنوية {sar(b.break_even_annual)}</b> — تحتها الشركة بتخسر.
        اقترحت نمو 20% (ولحد 40% لو ده يقرّبك من التعادل) — أكتر من كده مش واقعي من المبيعات لوحدها، والباقي لازم ييجي من المصاريف أو الأسعار. عدّل اللي انت شايفه واحفظ.</>}</div>
    </div>}

    <Card title={`أهداف ${year}`} hint="كل الأرقام قبل الضريبة إلا التحصيل (بيتحسب على الفاتورة شاملة الضريبة). الأهداف بتتوزع على الشهور، وبعدين بقارنها بالفعلي من دفترة كل شهر."
      right={dirty && <button type="button" disabled={saving} onClick={() => void save()} className="rounded-xl bg-[var(--navy)] px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{saving ? "جارٍ الحفظ…" : d.goals ? "احفظ التعديل" : "اعتمد الأهداف دي"}</button>}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Num label="المبيعات السنوية" value={g.sales} onChange={v => set("sales", v)} suffix="ر.س" step={10000} hint="صافي المبيعات بعد المرتجعات وقبل الضريبة." />
        <Num label="هامش مجمل الربح" value={g.gross_margin} onChange={v => set("gross_margin", v)} suffix="%" hint="من كل 100 ريال مبيعات، كام بيفضل بعد تكلفة البضاعة. بيعلى برفع الأسعار أو تقليل الخصومات أو تكلفة شراء أقل." />
        <Num label="المصاريف الشهرية" value={g.opex_month} onChange={v => set("opex_month", v)} suffix="ر.س" step={1000} hint="ميزانية الرواتب والإيجار والتسويق والفعاليات وكل مصاريف التشغيل في الشهر." />
        <Num label="نسبة التحصيل" value={g.collection_rate} onChange={v => set("collection_rate", v)} suffix="%" hint="من كل فاتورة بتطلعها، كام في المية لازم يتحصل كاش في نفس الفترة." />
        <Num label="أقصى مدة تحصيل" value={g.dso_days} onChange={v => set("dso_days", v)} suffix="يوم" hint="متوسط عدد الأيام من الفاتورة لحد ما الفلوس توصل (DSO). كل ما يقل، السيولة أحسن." />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="font-bold">توزيع المبيعات على الشهور:</span>
        <button type="button" onClick={() => setG({ ...g, weights: Array(12).fill(1 / 12) })} className={`rounded-full px-3 py-1 font-bold ${isEqual(g.weights) ? "bg-[var(--navy)] text-white" : "bg-white ring-1 ring-[var(--border)]"}`}>بالتساوي</button>
        {!isEqual(d.seasonal) && <button type="button" onClick={() => setG({ ...g, weights: d.seasonal })} className={`rounded-full px-3 py-1 font-bold ${!isEqual(g.weights) ? "bg-[var(--navy)] text-white" : "bg-white ring-1 ring-[var(--border)]"}`}>حسب موسم السنة اللي فاتت</button>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="صافي الربح المتوقع في السنة" value={sar(plan.net)} sub={`${pct(plan.net_margin)} من المبيعات`} icon="trophy" color={plan.net >= 0 ? C.green : C.red} tone={plan.net < 0 ? "bad" : "good"} />
        <Kpi label="متوسط المبيعات الشهرية" value={sar(g.sales / 12)} icon="calendar" color={C.teal} />
        <Kpi label="نقطة التعادل الشهرية" value={sar(plan.break_even_month)} sub="أقل مبيعات شهرية من غير خسارة" icon="coverage" color={C.amber} />
        <Kpi label="التحصيل المطلوب في السنة" value={sar(plan.months.reduce((s, m) => s + m.collect, 0))} sub="شامل الضريبة" icon="wallet" color={C.blue} />
      </div>
      {plan.net < 0 && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs leading-6 text-red-800 ring-1 ring-red-200"><b>الخطة دي فيها خسارة {sar(-plan.net)}:</b> مجمل الربح ما بيغطيش المصاريف. عشان تقفل السنة من غير خسارة محتاج واحدة من دول أو مزيج منهم: مبيعات <b>{sar(plan.break_even_month === null ? null : plan.break_even_month * 12)}</b> في السنة، أو مصاريف <b>{sar(g.sales * g.gross_margin / 100 / 12)}</b> في الشهر، أو هامش مجمل ربح <b>{pct(g.sales ? g.opex_month * 12 / g.sales * 100 : null)}</b> (برفع الأسعار وتقليل الخصومات).</p>}
    </Card>

    {d.goals && d.rep_targets && <RepTargets year={year} goal={d.goals.sales} rt={d.rep_targets} onDone={() => void load()} />}

    {sc ? <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`المبيعات (${sc.ytd.months} شهر)`} value={sar(sc.ytd.sales.actual)} sub={`المستهدف ${sar(sc.ytd.sales.target)} · ${sc.ytd.sales.target ? pct(sc.ytd.sales.actual / sc.ytd.sales.target * 100) : "—"}`} icon="sales" color={C.teal} tone={sc.ytd.sales.actual >= sc.ytd.sales.target * 0.95 ? "good" : "bad"} />
        <Kpi label="صافي الربح لحد دلوقتي" value={sar(sc.ytd.net.actual)} sub={`المستهدف ${sar(sc.ytd.net.target)}`} icon="trophy" color={C.green} tone={sc.ytd.net.actual >= sc.ytd.net.target ? "good" : "bad"} />
        <Kpi label="هامش مجمل الربح الفعلي" value={pct(sc.gross_margin_actual)} sub={`المستهدف ${pct(g.gross_margin)}`} icon="coverage" color={C.violet} tone={sc.gross_margin_actual !== null && sc.gross_margin_actual >= g.gross_margin - 1 ? "good" : "bad"} />
        <Kpi label="التحصيل الفعلي" value={sar(sc.ytd.collected.actual)} sub={`المستهدف ${sar(sc.ytd.collected.target)}${sc.dso !== null ? ` · مدة التحصيل ${sc.dso} يوم (الهدف ${g.dso_days})` : ""}`} icon="wallet" color={C.blue} tone={sc.ytd.collected.actual >= sc.ytd.collected.target * 0.95 ? "good" : "bad"} />
      </div>
      {sc.current && <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-gradient-to-l from-[var(--navy)] to-[#1b6f75] p-4 text-white">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><Icon name="calendar" size={22} /></span>
        <div className="min-w-0 flex-1 text-[12.5px] leading-6"><b className="block text-[15px]">{MONTHS[sc.current.month - 1]}: يوم {sc.current.day} من {sc.current.days}</b>
          بعت {sar(sc.current.sales)} من هدف {sar(sc.current.target)}. لو كملت بنفس المعدل هتقفل الشهر على <b>{sar(sc.current.projected)}</b> ({pct(sc.current.pct)}).
          {sc.current.needed_per_day > 0 && <> عشان تحقق الهدف محتاج <b>{sar(sc.current.needed_per_day)} في اليوم</b> لحد آخر الشهر.</>}</div>
        {sc.run_rate !== null && <div className="rounded-xl bg-white/10 px-3 py-2 text-center text-[11px]">لو السنة كملت كده<b className="block text-base">{sar(sc.run_rate)}</b>من {sar(g.sales)}</div>}
      </div>}
      <Card title="المستهدف والفعلي شهر بشهر">
        <MonthChart data={sc.rows.map(r => ({ m: `${year}-${String(r.month).padStart(2, "0")}`, target: r.target.sales, actual: r.actual.sales }))} series={[{ key: "target", label: "المستهدف", color: "#c9d6d8" }, { key: "actual", label: "الفعلي", color: C.teal }]} />
        <div className="mt-4"><Table rows={sc.rows.map(r => ({ ...r, key: String(r.month) }))} rowKey={r => r.key} max={12} cols={[
          { key: "month", label: "الشهر", className: "text-right font-bold", render: r => <>{MONTHS[r.month - 1]}{r.state === "current" && <span className="mr-1 rounded-full bg-sky-100 px-1.5 text-[10px] text-sky-800">الحالي</span>}{r.state === "excluded" && <span className="mr-1 text-[10px] font-normal text-[var(--muted)]">(قبل بداية الحسابات)</span>}</> },
          { key: "ts", label: "مبيعات مستهدفة", value: r => r.target.sales, render: r => sar(r.target.sales) },
          { key: "as", label: "مبيعات فعلية", value: r => r.actual.sales, render: r => (r.state === "future" || r.state === "excluded") ? "—" : sar(r.actual.sales) },
          { key: "pct", label: "نسبة التحقيق", render: r => (r.state === "future" || r.state === "excluded") || r.pct === null ? "—" : <b className={r.pct >= 100 ? "text-emerald-700" : r.pct >= 80 ? "text-amber-700" : "text-red-700"}>{pct(r.pct)}</b> },
          { key: "tn", label: "ربح مستهدف", value: r => r.target.net, render: r => sar(r.target.net) },
          { key: "an", label: "ربح فعلي", value: r => r.actual.net, render: r => (r.state === "future" || r.state === "excluded") ? "—" : <span className={r.actual.net < 0 ? "text-red-700" : ""}>{sar(r.actual.net)}</span> },
          { key: "ac", label: "تحصيل فعلي", value: r => r.actual.collected, render: r => (r.state === "future" || r.state === "excluded") ? "—" : sar(r.actual.collected) },
        ]} /></div>
      </Card>
    </> : <Card><p className="text-center text-sm text-[var(--muted)]">احفظ الأهداف فوق، وهتابع معاك هنا المحقق مقابل المستهدف كل شهر، وتوقع آخر الشهر، والمطلوب يومياً.</p></Card>}

    {B && d.levers && sim && <Card title="أسرع طريق لزيادة الربح" hint="محاكاة على متوسط شهرك (آخر 12 شهر). حرّك أي مؤشر وشوف أثره على صافي الربح الشهري.">
      <div className="mb-4 grid grid-cols-2 gap-2 text-center text-[11.5px] lg:grid-cols-4">
        {([["رفع الأسعار 1%", d.levers.price1, "أقوى رافعة — بتنزل كلها ربح صافي"], ["زيادة الكمية 1%", d.levers.volume1, "بتجيب مجمل الربح بس"], ["تخفيض تكلفة الشراء 1%", d.levers.cost1, "فاوض الموردين"], ["تخفيض المصاريف 1%", d.levers.opex1, ""]] as const).map(([l, v, s]) => <div key={l} className="rounded-xl bg-[var(--bg)] p-3"><span className="block text-[var(--muted)]">{l}</span><b className="block text-base text-emerald-700">+{sar(v)}</b><span className="text-[10.5px] text-[var(--muted)]">في الشهر{s ? ` · ${s}` : ""}</span></div>)}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Slider label="الأسعار" v={lv.price} set={v => setLv({ ...lv, price: v })} />
        <Slider label="الكميات المباعة" v={lv.volume} set={v => setLv({ ...lv, volume: v })} />
        <Slider label="تكلفة الشراء" v={lv.cogs} set={v => setLv({ ...lv, cogs: v })} />
        <Slider label="المصاريف" v={lv.opex} set={v => setLv({ ...lv, opex: v })} />
      </div>
      <div className="mt-4 rounded-2xl bg-[var(--sky-light)] p-4 text-[13px] leading-7">صافي ربحك الشهري دلوقتي <b>{sar(B.net)}</b> ← هيبقى <b className={sim.net >= B.net ? "text-emerald-700" : "text-red-700"}>{sar(sim.net)}</b> ({sim.net >= B.net ? "+" : ""}{sar(sim.net - B.net)} في الشهر = {sar((sim.net - B.net) * 12)} في السنة).
        {lv.price > 0 && lv.volume >= -lv.price && <span className="block text-[12px] text-[var(--muted)]">ملاحظة: رفع السعر ممكن يقلل الكمية شوية — جرّب تنزّل الكميات بنفس النسبة وهتلاقي إنك لسه كسبان غالباً.</span>}
        {(lv.price || lv.volume || lv.cogs || lv.opex) ? <button type="button" onClick={() => setLv({ price: 0, volume: 0, cogs: 0, opex: 0 })} className="mt-1 text-xs font-bold text-[var(--navy)] hover:underline">رجّع الصفر</button> : null}</div>
    </Card>}
  </div>;
}

/** One target chain: company annual goal → reps' annual targets (each rep then splits by month in المبيعات والأهداف). */
function RepTargets({ year, goal, rt, onDone }: { year: number; goal: number; rt: NonNullable<Data["rep_targets"]>; onDone: () => void }) {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  const gap = goal - rt.total, ok = Math.abs(gap) < Math.max(1000, goal * 0.005);
  async function distribute() {
    if (!confirm(`هيتوزع هدف الشركة (${Math.round(goal).toLocaleString("en-US")} ر.س) على المناديب بنسبة تارجت كل واحد الحالي (ولو فيه مندوب مالوش تارجت، بالتساوي). المناديب اللي وزّعوا تارجتهم على الشهور بيفضلوا زي ما هم. تكمل؟`)) return;
    setBusy(true);
    const r = await fetch("/api/admin/finance/goals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "distribute", year }) });
    const j = await r.json().catch(() => null); setBusy(false);
    if (!r.ok) { toast(j?.error || "تعذر التوزيع", "error"); return; }
    toast(`اتحدث تارجت ${j.updated} مندوب${j.failed?.length ? ` · ما اتغيرش: ${j.failed.join("، ")}` : ""}`, j.failed?.length ? "info" : "success"); onDone();
  }
  return <Card title={`تارجت المناديب ${year}`} hint="هدف الشركة لازم يساوي مجموع تارجت المناديب — وإلا يا إما الشركة مش هتحقق هدفها حتى لو كل مندوب حقق تارجته، يا إما المناديب بيتحاسبوا على أكتر من المطلوب. المحقق لكل مندوب بيتحسب من فواتير دفترة لعملاءه."
    right={!ok && <button type="button" disabled={busy} onClick={() => void distribute()} className="rounded-xl bg-[var(--navy)] px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{busy ? "جارٍ التوزيع…" : "وزّع هدف الشركة على المناديب"}</button>}>
    <div className={`mb-3 rounded-xl p-3 text-[12.5px] ring-1 ${ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>
      هدف الشركة <b>{sar(goal)}</b> · مجموع تارجت المناديب <b>{sar(rt.total)}</b>{ok ? " — متطابقين ✓" : <> — الفرق <b>{sar(Math.abs(gap))}</b> {gap > 0 ? "ناقص على المناديب" : "زيادة على هدف الشركة"}</>}
    </div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{rt.reps.map(r => <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"><span className="min-w-0 truncate font-bold">{r.name}</span><span className="shrink-0">{sar(r.annual)}{r.locked && <span className="mr-1 text-[10px] text-[var(--muted)]">(موزّع على الشهور)</span>}</span></div>)}</div>
  </Card>;
}
