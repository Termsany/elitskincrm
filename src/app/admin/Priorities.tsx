"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Sheet, { Field, FailBox, fieldCls, btnPrimary, btnSoft, btnGhost } from "@/components/Sheet";
import { useUndo } from "@/components/UndoToast";

type Issue = "gps" | "notes" | "far" | "burst";
export type Pri = {
  review: { count: number; snoozed: boolean; gps: number; notes: number; far: number; burst: number };
  fix: { id: string; doctor: string; rep: string; day: string; hm: string; notes: string; issues: Issue[] } | null;
  plans: Array<{ id: string; rep: string; from: string; to: string; visits: number; cities: string[]; a: number; emptyDays: number; dups: number; submitted: string }>;
  debts: null | { total: number; count: number; list: Array<{ party: string; unpaid: number; days: number; last: string | null }> };
};
type Plan = Pri["plans"][number]; type Debt = NonNullable<Pri["debts"]>["list"][number]; type Fix = NonNullable<Pri["fix"]>;
export type Extra = { key: string; tone: "red" | "amber" | "teal"; count: string; unit: string; title: string; reason: string; href: string; cta: string };

const ISSUE: Record<Issue, string> = { gps: "من غير موقع", notes: "ملاحظات قصيرة", far: "بعيدة عن العيادة", burst: "مع زيارات تانية من نفس المكان" };
const k = (n: number) => Math.round(n).toLocaleString("en-US");
const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
const TONE = { red: "#c92f36", amber: "#e99608", teal: "#33b3a6" };
async function send(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const j = r ? await r.json().catch(() => null) : null;
  return { ok: !!r?.ok, error: (j?.error as string) || (r ? "تعذر الحفظ، حاول تاني" : "الاتصال انقطع. اللي كتبته لسه موجود، حاول تاني."), field: j?.field as string | undefined };
}

/** «الأولوية الآن»: everything waiting on the manager, most urgent first; simple actions finish in place, bigger ones in a popup. */
export default function Priorities({ extras }: { manager?: boolean; extras: Extra[] }) {
  const undo = useUndo();
  const [p, setP] = useState<Pri | null>(null); const [err, setErr] = useState(false);
  const [gone, setGone] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null); const [debt, setDebt] = useState<Debt | null>(null); const [fix, setFix] = useState<Fix | null>(null);
  const load = useCallback(() => fetch("/api/admin/priorities", { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject()).then(j => { setP(j); setErr(false); }).catch(() => setErr(true)), []);
  useEffect(() => { void load(); }, [load]);
  const leave = (key: string, then: () => void) => { setGone(g => [...g, key]); setTimeout(() => { then(); setGone(g => g.filter(x => x !== key)); }, 220); };

  if (err && !p) return <section className="rounded-[28px] border border-[var(--border)] bg-white p-6 text-center text-sm">تعذر تحميل الأولويات <button onClick={() => void load()} className="mr-2 rounded-xl bg-[var(--navy)] px-3 py-1.5 font-bold text-white">إعادة المحاولة</button></section>;
  if (!p) return <div className="es-shimmer h-72 rounded-[28px]" />;

  const snooze = async () => {
    setP(x => x && { ...x, review: { ...x.review, snoozed: true } });
    const r = await send("/api/smart/dismiss", "POST", { kind: "admin_review", ref: "all", days: 1, reason: "later" });
    if (!r.ok) { setP(x => x && { ...x, review: { ...x.review, snoozed: false } }); undo({ text: r.error, err: true }); return; }
    undo({ text: "اتأجلت مراجعة الزيارات لبكرة", undo: async () => { setP(x => x && { ...x, review: { ...x.review, snoozed: false } }); await send("/api/smart/dismiss", "DELETE", { kind: "admin_review", ref: "all" }); } });
  };
  const rv = p.review, showReview = rv.count > 0 && !rv.snoozed;
  const reason = [rv.gps && `${rv.gps} من غير موقع`, rv.notes && `${rv.notes} ملاحظاتها قصيرة`, rv.far && `${rv.far} بعيدة عن العيادة`, rv.burst && `${rv.burst} مسجلة مع زيارات تانية من نفس المكان`].filter(Boolean).join("، ");
  const items = (showReview ? 1 : 0) + (p.plans.length ? 1 : 0) + (p.debts?.count ? 1 : 0) + (p.fix && !gone.includes("fix") ? 1 : 0) + extras.length;

  return <section aria-labelledby="pri-h" className="overflow-hidden rounded-[28px] border border-[var(--border)] bg-white">
    <div className="flex flex-col gap-0.5 border-b border-[var(--border)] px-5 py-4 md:flex-row md:items-baseline md:justify-between md:px-6">
      <h2 id="pri-h" className="text-xl font-extrabold text-[var(--navy)]">الأولوية الآن</h2>
      <p className="text-[13px] text-[var(--muted)]">{items ? `${items} حاجات مستنية قرارك، مترتبة بالأهم` : "مفيش حاجة مستنياك"}</p>
    </div>

    {p.debts && p.debts.count > 0 && <Row tone="red" count={k(p.debts.total)} unit="ر.س" title="تحصيل متأخر أكتر من 60 يوم" reason={`${p.debts.count} عملاء، أكبرهم ${p.debts.list[0].party} بـ ${k(p.debts.list[0].unpaid)} ر.س`}>
      <ul className="mt-3 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)]">{p.debts.list.map((d, i) => <li key={d.party} className={`pr-row flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${i >= 2 ? "max-md:hidden" : ""} ${gone.includes(`d:${d.party}`) ? "pr-gone" : ""}`}>
        <div className="min-w-0 flex-1"><b className="block truncate text-[14.5px]" dir="auto">{d.party}</b><p className="text-[12.5px] text-[var(--muted)]">{k(d.unpaid)} ر.س، متأخر {d.days} يوم، آخر متابعة: {d.last || "مفيش"}</p></div>
        <button type="button" className={`${btnSoft} max-md:w-full`} onClick={() => setDebt(d)}>سجّل متابعة</button></li>)}</ul>
      <Link href="/daftra-sales?tab=ar" className="mt-2 inline-flex min-h-10 items-center text-[13.5px] font-bold text-[var(--sky-deep)]">كل المتأخرين ({p.debts.count}) ‹</Link>
    </Row>}

    {showReview && <Row tone="amber" count={String(rv.count)} unit={rv.count === 1 ? "زيارة" : "زيارات"} title="تحتاج مراجعة" reason={reason}
      actions={<><Link href="/admin/review?status=review" className={`${btnPrimary} grid place-items-center`}>راجعها</Link><button type="button" className={btnGhost} onClick={() => void snooze()}>أجّل لبكرة</button></>} />}

    {p.plans.length > 0 && <Row tone="teal" count={String(p.plans.length)} unit={p.plans.length === 1 ? "خطة" : "خطط"} title="مستنية الاعتماد" reason="الاعتماد بيوصل للمندوب على طول وتظهر في يومه">
      <ul className="mt-3 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)]">{p.plans.map(x => <li key={x.id} className={`pr-row flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${gone.includes(`p:${x.id}`) ? "pr-gone" : ""}`}>
        <div className="min-w-0 flex-1"><b className="block text-[14.5px]">خطة {x.rep}</b><p className="text-[12.5px] text-[var(--muted)]">{dm(x.from)} – {dm(x.to)}، {x.visits} زيارة{x.cities.length ? ` في ${x.cities.slice(0, 3).join(" و")}` : ""}، {x.a} طبيب A</p></div>
        <button type="button" className={`${btnSoft} max-md:w-full`} onClick={() => setPlan(x)}>مراجعة واعتماد</button></li>)}</ul>
    </Row>}

    {p.fix && !gone.includes("fix") && <Row tone="amber" count="1" unit="زيارة" title="ممكن تتبعت للمندوب يصححها" reason={`${p.fix.doctor} مع ${p.fix.rep} يوم ${dm(p.fix.day)}: ${p.fix.issues.map(i => ISSUE[i]).join("، ")}`}
      actions={<button type="button" className={btnSoft} onClick={() => setFix(p.fix)}>اطلب تصحيح</button>} />}

    {extras.map(x => <Row key={x.key} tone={x.tone} count={x.count} unit={x.unit} title={x.title} reason={x.reason}
      actions={<Link href={x.href} className={`${btnSoft} grid place-items-center`}>{x.cta}</Link>} />)}

    {!items && <div className="px-6 py-10 text-center text-[var(--muted)]">خلّصت كل الأولويات ✓ المؤشرات تحت بتوضح الصورة كاملة.</div>}

    {plan && <PlanPopup plan={plan} onClose={() => setPlan(null)} onDone={(ok, note) => { const x = plan; setPlan(null); leave(`p:${x.id}`, () => setP(s => s && { ...s, plans: s.plans.filter(y => y.id !== x.id) })); undo({ text: ok ? `اتعتمدت خطة ${x.rep} ووصلتله` : `اتبعت طلب تعديل لـ ${x.rep}${note ? `: ${note}` : ""}` }); }} />}
    {debt && <DebtPopup debt={debt} onClose={() => setDebt(null)} onDone={(label, paid) => { const x = debt; setDebt(null); if (paid) leave(`d:${x.party}`, () => setP(s => s && s.debts ? { ...s, debts: { ...s.debts, count: s.debts.count - 1, total: s.debts.total - x.unpaid, list: s.debts.list.filter(y => y.party !== x.party) } } : s));
      else setP(s => s && s.debts ? { ...s, debts: { ...s.debts, list: s.debts.list.map(y => y.party === x.party ? { ...y, last: label } : y) } } : s); undo({ text: `اتحفظت متابعة ${x.party}` }); }} />}
    {fix && <FixPopup fix={fix} onClose={() => setFix(null)} onDone={() => { const x = fix; setFix(null); leave("fix", () => setP(s => s && { ...s, fix: null, review: { ...s.review, count: Math.max(0, s.review.count - 1) } }));
      undo({ text: `اتبعت طلب التصحيح لـ ${x.rep}`, undo: async () => { await send("/api/admin/review", "DELETE", { ids: [x.id] }); void load(); } }); }} />}
    <style>{`.pr-row{max-height:12rem}@media (prefers-reduced-motion:no-preference){.pr-row{transition:opacity .2s,transform .2s,max-height .22s,padding .22s}@keyframes pr-t{0%{transform:translateY(0);opacity:1}45%{transform:translateY(-35%);opacity:0}55%{transform:translateY(35%);opacity:0}100%{transform:none;opacity:1}}.pr-tick{animation:pr-t .22s ease-out;display:inline-block}}
      .pr-gone{opacity:0;transform:translateX(-14px);max-height:0!important;padding-top:0!important;padding-bottom:0!important;overflow:hidden;border-width:0!important}`}</style>
  </section>;
}

function Row({ tone, count, unit, title, reason, actions, children }: { tone: keyof typeof TONE; count: string; unit: string; title: string; reason: string; actions?: React.ReactNode; children?: React.ReactNode }) {
  return <article className="relative border-b border-[var(--border)] px-5 py-5 last:border-0 md:px-6">
    <span aria-hidden className="absolute inset-y-5 right-0 w-1 rounded-l-full" style={{ background: TONE[tone] }} />
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
      <div className="flex items-baseline gap-2 md:w-44 md:shrink-0"><b key={count} className="pr-tick font-display text-[32px] font-extrabold leading-none text-[var(--navy)]">{count}</b><span className="text-[13.5px] text-[var(--muted)]">{unit}</span></div>
      <div className="min-w-0 flex-1"><h3 className="text-[16px] font-extrabold text-[var(--ink)]">{title}</h3><p className="mt-0.5 text-[13.5px] leading-6 text-[var(--muted)]">{reason}</p></div>
      {actions && <div className="grid grid-cols-2 gap-2 md:flex md:shrink-0 [&>*:only-child]:col-span-2">{actions}</div>}
    </div>
    {children && <div className="md:pr-[200px]">{children}</div>}
  </article>;
}
function Summary({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-[var(--sky-light)] p-4">{rows.map(([a, b]) => <div key={a} className="min-w-0"><dt className="text-[12px] text-[var(--muted)]">{a}</dt><dd className="mt-0.5 truncate text-[14px] font-bold text-[var(--ink)]" dir="auto">{b}</dd></div>)}</dl>;
}

function PlanPopup({ plan, onClose, onDone }: { plan: Plan; onClose: () => void; onDone: (approved: boolean, note: string) => void }) {
  const [note, setNote] = useState(""); const [busy, setBusy] = useState<"" | "approved" | "needs_revision">(""); const [err, setErr] = useState(""); const [fail, setFail] = useState("");
  const go = async (status: "approved" | "needs_revision") => {
    if (busy) return; if (status === "needs_revision" && note.trim().length < 5) { setErr("اكتب للمندوب يعدّل إيه بالظبط"); return; }
    setErr(""); setFail(""); setBusy(status);
    const r = await send(`/api/plans/${plan.id}`, "PATCH", { status, admin_note: note.trim() }); setBusy("");
    if (!r.ok) { setFail(r.error); return; } onDone(status === "approved", note.trim());
  };
  return <Sheet title={`اعتماد خطة ${plan.rep}`} onClose={onClose} footer={<>
    <button type="button" className={`${btnPrimary} flex-1`} disabled={!!busy} onClick={() => void go("approved")}>{busy === "approved" ? "بيتعتمد…" : "اعتماد الخطة"}</button>
    <button type="button" className={btnSoft} disabled={!!busy} onClick={() => void go("needs_revision")}>{busy === "needs_revision" ? "بيتبعت…" : "طلب تعديل"}</button></>}>
    <Summary rows={[["الفترة", `${dm(plan.from)} – ${dm(plan.to)}`], ["عدد الزيارات", plan.visits], ["المدن", plan.cities.join("، ") || "—"], ["أطباء A", plan.a]]} />
    <ul className="mt-3 space-y-1.5 text-[13px] font-bold">
      <li className={plan.emptyDays ? "text-[#b7791f]" : "text-[#1e7a5a]"}>{plan.emptyDays ? `⚠ ${plan.emptyDays} أيام شغل فاضية` : "✓ كل أيام الشغل فيها زيارات"}</li>
      <li className={plan.dups ? "text-[#b7791f]" : "text-[#1e7a5a]"}>{plan.dups ? `⚠ ${plan.dups} طبيب متكرر في نفس اليوم` : "✓ مفيش تكرار"}</li></ul>
    <div className="mt-4"><Field label="ملاحظة للمندوب" error={err} hint="اختيارية عند الاعتماد، ولازمة لو طلبت تعديل">
      <textarea value={note} onChange={e => { setNote(e.target.value); setErr(""); }} aria-invalid={!!err} rows={3} maxLength={500} className={fieldCls} placeholder="مثال: ضيف د. ريم يوم الثلاثاء" /></Field></div>
    <FailBox text={fail} />
    <Link href={`/plans?planId=${plan.id}`} onClick={() => sessionStorage.setItem(`draft:plan:${plan.id}`, note)} className="mt-4 inline-flex min-h-10 items-center text-[13.5px] font-bold text-[var(--sky-deep)]">افتح الخطة كاملة ‹</Link>
  </Sheet>;
}

const FIX_F: Array<[string, string]> = [["gps", "الموقع"], ["notes", "الملاحظات"], ["products", "المنتجات"]];
export function FixPopup({ fix, ids, onClose, onDone }: { fix: Fix | null; ids?: string[]; onClose: () => void; onDone: () => void }) {
  const key = `draft:fix:${fix?.id || "bulk"}`;
  const [why, setWhy] = useState(() => (typeof window !== "undefined" && sessionStorage.getItem(key)) || "");
  const [what, setWhat] = useState<string[]>(fix ? fix.issues.flatMap(i => i === "gps" || i === "far" ? ["gps"] : i === "notes" ? ["notes"] : []).filter((x, i, a) => a.indexOf(x) === i) : ["notes"]);
  const [e, setE] = useState<{ why?: string; what?: string }>({}); const [busy, setBusy] = useState(false); const [fail, setFail] = useState("");
  const submit = async () => {
    if (busy) return; const x: typeof e = {};
    if (why.trim().length < 10) x.why = "اكتب السبب في 10 حروف على الأقل عشان المندوب يفهم المطلوب"; if (!what.length) x.what = "اختار حاجة واحدة على الأقل تتصحح";
    setE(x); if (Object.keys(x).length) return; setFail(""); setBusy(true);
    const r = await send("/api/admin/review", "POST", { ids: ids || [fix!.id], action: "correction", reason: why.trim(), fields: what }); setBusy(false);
    if (!r.ok) { if (r.field === "reason") setE({ why: r.error }); else if (r.field === "fields") setE({ what: r.error }); else setFail(r.error); return; }
    sessionStorage.removeItem(key); onDone();
  };
  return <Sheet title={ids && ids.length > 1 ? `طلب تصحيح ${ids.length} زيارات` : "طلب تصحيح زيارة"} onClose={onClose} footer={<>
    <button type="button" className={`${btnPrimary} flex-1`} disabled={busy} onClick={() => void submit()}>{busy ? "بيتبعت…" : "إرسال طلب التصحيح"}</button><button type="button" className={btnGhost} onClick={onClose}>إلغاء</button></>}>
    {fix && <Summary rows={[["الطبيب", fix.doctor], ["المندوب", fix.rep], ["الوقت", `${dm(fix.day)}، ${fix.hm}`], ["المشكلة", fix.issues.map(i => ISSUE[i]).join("، ")]]} />}
    {fix?.notes && <p className="mt-3 rounded-2xl border border-[var(--border)] p-3 text-[13.5px] text-[var(--ink-soft)]" dir="auto">«{fix.notes}»</p>}
    <fieldset className="mt-4"><legend className="mb-1.5 text-[13.5px] font-bold">يصحح إيه؟</legend>
      <div className="flex flex-wrap gap-2">{FIX_F.map(([kk, l]) => { const on = what.includes(kk); return <button key={kk} type="button" aria-pressed={on} onClick={() => { setWhat(w => on ? w.filter(y => y !== kk) : [...w, kk]); setE(x => ({ ...x, what: undefined })); }}
        className={`min-h-11 rounded-2xl border px-4 text-[14px] font-bold transition-colors ${on ? "border-[var(--sky)] bg-[var(--sky-soft)] text-[var(--navy)]" : "border-[var(--border)] text-[var(--muted)]"}`}>{on ? "✓ " : ""}{l}</button>; })}</div>
      {e.what && <span role="alert" className="mt-1 block text-[12.5px] font-bold text-[#c92f36]">{e.what}</span>}</fieldset>
    <div className="mt-4"><Field label="السبب (هيوصل للمندوب)" error={e.why}><textarea value={why} onChange={ev => { setWhy(ev.target.value); sessionStorage.setItem(key, ev.target.value); setE(x => ({ ...x, why: undefined })); }} aria-invalid={!!e.why} rows={3} maxLength={500} className={fieldCls} placeholder="الملاحظات مش موضحة الدكتور قال إيه عن المنتج" /></Field></div>
    <FailBox text={fail} />
    {fix && !ids && <Link href={`/admin/review?status=review&open=${fix.id}`} className="mt-4 inline-flex min-h-10 items-center text-[13.5px] font-bold text-[var(--sky-deep)]">افتح الزيارة كاملة ‹ <span className="mr-1 text-[12px] font-normal text-[var(--muted)]">(اللي كتبته هيفضل محفوظ)</span></Link>}
  </Sheet>;
}

const RES: Array<[string, string]> = [["promise", "وعد بالدفع"], ["extension", "طلب مهلة"], ["no_answer", "مش بيرد"], ["collected", "تم التحصيل"]];
function DebtPopup({ debt, onClose, onDone }: { debt: Debt; onClose: () => void; onDone: (label: string, paid: boolean) => void }) {
  const [res, setRes] = useState(""); const [date, setDate] = useState(""); const [note, setNote] = useState("");
  const [e, setE] = useState<{ res?: string; date?: string }>({}); const [busy, setBusy] = useState(false); const [fail, setFail] = useState("");
  const needDate = res === "promise" || res === "extension";
  const save = async () => {
    if (busy) return; const x: typeof e = {}; if (!res) x.res = "اختار نتيجة المتابعة"; if (needDate && !date) x.date = "حدّد تاريخ الدفع المتوقع";
    setE(x); if (Object.keys(x).length) return; setFail(""); setBusy(true);
    const r = await send("/api/admin/collections/followup", "POST", { party: debt.party, result: res, promised_date: needDate ? date : null, note }); setBusy(false);
    if (!r.ok) { if (r.field === "promised_date") setE({ date: r.error }); else if (r.field === "result") setE({ res: r.error }); else setFail(r.error); return; }
    onDone(`${RES.find(z => z[0] === res)![1]}${needDate ? ` ${dm(date)}` : ""}`, res === "collected");
  };
  return <Sheet title={`متابعة تحصيل ${debt.party}`} onClose={onClose} footer={<>
    <button type="button" className={`${btnPrimary} flex-1`} disabled={busy} onClick={() => void save()}>{busy ? "بيتحفظ…" : "حفظ المتابعة"}</button><button type="button" className={btnGhost} onClick={onClose}>إلغاء</button></>}>
    <Summary rows={[["الرصيد المتأخر", `${k(debt.unpaid)} ر.س`], ["التأخير", `${debt.days} يوم`], ["آخر متابعة", debt.last || "مفيش"], ["المصدر", "دفترة (قراءة بس)"]]} />
    <fieldset className="mt-4"><legend className="mb-1.5 text-[13.5px] font-bold">النتيجة</legend>
      <div className="grid grid-cols-2 gap-2">{RES.map(([kk, l]) => <button key={kk} type="button" aria-pressed={res === kk} onClick={() => { setRes(kk); setE(x => ({ ...x, res: undefined })); }}
        className={`min-h-12 rounded-2xl border text-[14.5px] font-bold transition-colors ${res === kk ? "border-[var(--sky)] bg-[var(--sky-soft)] text-[var(--navy)]" : "border-[var(--border)] text-[var(--ink)] hover:border-[var(--sky-border)]"}`}>{l}</button>)}</div>
      {e.res && <span role="alert" className="mt-1 block text-[12.5px] font-bold text-[#c92f36]">{e.res}</span>}</fieldset>
    {needDate && <div className="mt-4"><Field label="تاريخ الدفع المتوقع" error={e.date}><input type="date" value={date} onChange={ev => { setDate(ev.target.value); setE(x => ({ ...x, date: undefined })); }} aria-invalid={!!e.date} className={fieldCls} /></Field></div>}
    <div className="mt-4"><Field label="ملاحظة"><textarea value={note} onChange={ev => setNote(ev.target.value)} rows={2} maxLength={1000} className={fieldCls} placeholder="مثال: المحاسب قال الدفعة بعد اعتماد المدير المالي" /></Field></div>
    <FailBox text={fail} />
  </Sheet>;
}
