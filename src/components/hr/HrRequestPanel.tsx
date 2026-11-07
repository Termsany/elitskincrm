"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { Balance, HrRow, PayLine } from "@/lib/hr";
import { BalanceRing, KINDS, StatusPill, daysBetween, dshort, facts, kindOf, mlabel, rel, sar } from "./hr-ui";

type Data = { today: string; month: string; requests: HrRow[]; balance: Balance | null; payroll: PayLine | null };
const inp = "mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm";
const addM = (m: string, n: number) => { const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)); return d.toISOString().slice(0, 7); };

function Seg({ value, set, opts }: { value: string; set: (v: string) => void; opts: Array<[string, string, string?]> }) {
  return <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${opts.length}, minmax(0,1fr))` }}>{opts.map(([v, l, sub]) =>
    <button key={v} type="button" onClick={() => set(v)} aria-pressed={value === v}
      className={`rounded-xl border px-2 py-2.5 text-center text-sm font-bold transition ${value === v ? "border-[var(--navy)] bg-[var(--navy)] text-white shadow-md" : "border-[var(--border)] bg-white hover:border-[var(--navy-3)]"}`}>
      {l}{sub && <span className={`block text-[10.5px] font-normal ${value === v ? "text-white/80" : "text-[var(--muted)]"}`}>{sub}</span>}</button>)}</div>;
}
const L = ({ t, children, hint }: { t: string; children: React.ReactNode; hint?: string }) => <label className="block"><span className="text-xs font-bold text-[var(--ink)]">{t}</span>{children}{hint && <span className="mt-1 block text-[11px] text-[var(--muted)]">{hint}</span>}</label>;

/** The rep's employee requests: pick a type, fill a short form, follow the decision. */
export default function HrRequestPanel({ focus }: { focus?: string }) {
  const toast = useToast();
  const [d, setD] = useState<Data | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hl, setHl] = useState(focus || "");
  const [f, setF] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const set = (k: string, v: string) => setF(x => ({ ...x, [k]: v }));

  const load = useCallback(async () => {
    const j = await fetch("/api/hr-requests", { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null);
    if (j) setD(j);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (hl && d) setTimeout(() => document.getElementById(`hr-${hl}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 200); }, [hl, d]);

  function open(k: string) {
    setKind(kind === k ? null : k); setFile(null);
    const m = d?.month || "";
    setF({ hr_type: k === "leave" ? "annual" : k === "exit_reentry" ? "single" : k === "salary_letter" ? "bank" : "", installments: "1", start_month: m, language: "ar", include_salary: "yes" });
    setTimeout(() => document.getElementById("hr-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
  }

  const days = f.start_date && f.end_date && f.end_date >= f.start_date ? daysBetween(f.start_date, f.end_date) : 0;
  const b = d?.balance, free = b ? b.remaining - b.pending : 0, salary = d?.payroll?.salary || 0;
  const preview = useMemo(() => {
    if (kind === "leave" && days) {
      if (f.hr_type === "annual") return free - days >= 0 ? { tone: "ok", text: `${days} يوم من رصيدك — هيفضل لك ${free - days} يوم` } : { tone: "bad", text: `رصيدك المتاح ${Math.max(0, free)} يوم بس — الطلب ${days} يوم. ممكن تاخد الباقي بدون راتب.` };
      if (f.hr_type === "unpaid") return { tone: "warn", text: salary ? `هيتخصم تقريباً ${sar(salary / 30 * days, 2)} من راتبك (${days} يوم × الراتب ÷ 30)` : `${days} يوم — هيتخصم من راتبك (الراتب ÷ 30 لكل يوم)` };
      return { tone: "ok", text: `${days} يوم إجازة مرضية مدفوعة — لازم ترفق التقرير الطبي` };
    }
    if (kind === "advance" && Number(f.amount) > 0) {
      const each = Number(f.amount) / Number(f.installments || 1);
      return { tone: salary && each > salary * 0.5 ? "warn" : "ok", text: `القسط ${sar(each, 2)} في الشهر من ${mlabel(f.start_month || d!.month)}${salary ? ` (${Math.round(each / salary * 100)}% من راتبك)` : ""}` };
    }
    if (kind === "exit_reentry" && f.start_date && f.end_date) return { tone: "ok", text: `${daysBetween(f.start_date, f.end_date)} يوم برّه — لو هتاخد إجازة، قدّمها كمان من «إجازة»` };
    return null;
  }, [kind, days, f, free, salary, d]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!kind || busy) return;
    if (kind === "leave" && f.hr_type === "sick" && !file) { toast("ارفق التقرير الطبي", "error"); return; }
    setBusy(true);
    const fd = new FormData(); fd.set("kind", kind); for (const [k, v] of Object.entries(f)) fd.set(k, v); if (file) fd.set("file", file);
    const r = await fetch("/api/hr-requests", { method: "POST", body: fd }); const j = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) { toast(j?.error || "تعذر الإرسال", "error"); return; }
    toast("اتبعت الطلب للإدارة ✓", "success"); setKind(null); setHl(j.id); await load();
  }
  async function cancel(id: string) {
    const r = await fetch(`/api/requests/${id}/cancel`, { method: "POST" }); const j = await r.json().catch(() => null);
    if (!r.ok) toast(j?.error || "تعذر الإلغاء", "error"); else { toast("اتلغى الطلب", "success"); await load(); }
  }

  if (!d) return <div className="es-shimmer h-48 rounded-3xl" />;
  const pay = d.payroll, deducted = pay && (pay.unpaid > 0 || pay.advance > 0);
  const openN = d.requests.filter(r => ["pending", "reopened", "in_progress", "needs_info", "deferred"].includes(r.status)).length;
  const today = d.today;
  const upcoming = d.requests.filter(r => r.kind === "leave" && ["approved", "completed"].includes(r.status) && (r.end_date || "") >= today).sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""))[0];

  return <section id="hr" className="es-card-in scroll-mt-24 space-y-4 rounded-3xl border border-[var(--border)] bg-white p-4 shadow-sm sm:p-5" aria-labelledby="hr-title">
    <div className="flex flex-wrap items-center gap-4">
      {b && <BalanceRing remaining={b.remaining} total={b.entitled + b.carryover} />}
      <div className="min-w-0 flex-1">
        <h2 id="hr-title" className="text-lg font-extrabold text-[var(--navy)]">طلباتي الإدارية</h2>
        <p className="text-[12.5px] leading-6 text-[var(--muted)]">{b ? <>رصيد إجازتك السنوية {b.year}: <b className="text-[var(--navy)]">{b.remaining} يوم</b> (استخدمت {b.used}{b.pending ? ` · ${b.pending} مستنية` : ""})</> : "رصيد الإجازة"}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
          {openN > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 font-bold text-amber-800">{openN} طلب مستني رد</span>}
          {upcoming && <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700">🌴 إجازتك {upcoming.start_date! <= today ? `لحد ${dshort(upcoming.end_date)}` : `تبدأ ${dshort(upcoming.start_date)}`}</span>}
          {deducted && <span className="rounded-full bg-red-50 px-2.5 py-1 font-bold text-red-700">خصم {mlabel(d.month)}: {sar(pay!.unpaid + pay!.advance, 2)}</span>}
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">{KINDS.map((k, i) =>
      <button key={k.id} type="button" onClick={() => open(k.id)} aria-expanded={kind === k.id} style={{ animationDelay: `${i * 70}ms`, ...(kind === k.id ? { borderColor: k.color, boxShadow: `0 10px 28px ${k.color}33` } : {}) }}
        className="es-card-in group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-3 text-right transition duration-300 hover:-translate-y-1 hover:shadow-lg">
        <span className="absolute -left-6 -top-6 h-20 w-20 rounded-full opacity-10 transition-transform duration-500 group-hover:scale-150" style={{ background: k.color }} />
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-110" style={{ background: `${k.color}1f`, color: k.color }}><Icon name={k.icon} size={22} /></span>
        <b className="mt-2 block text-sm text-[var(--navy)]">{k.label}</b><span className="block text-[11px] leading-4 text-[var(--muted)]">{k.sub}</span>
      </button>)}</div>

    {kind && <form id="hr-form" onSubmit={submit} className="es-card-in space-y-3 rounded-2xl border-2 p-4" style={{ borderColor: `${kindOf(kind).color}55`, background: `${kindOf(kind).color}08` }}>
      <div className="flex items-center justify-between"><b className="text-[var(--navy)]">طلب {kindOf(kind).label}</b><button type="button" onClick={() => setKind(null)} className="text-xs font-bold text-[var(--muted)]">إغلاق ✕</button></div>

      {kind === "leave" && <>
        <Seg value={f.hr_type} set={v => set("hr_type", v)} opts={[["annual", "سنوية", "من رصيدك"], ["sick", "مرضية", "بتقرير طبي"], ["unpaid", "بدون راتب", "تتخصم"]]} />
        <div className="grid grid-cols-2 gap-3"><L t="من يوم"><input type="date" required value={f.start_date || ""} onChange={e => set("start_date", e.target.value)} className={inp} /></L>
          <L t="لحد يوم"><input type="date" required min={f.start_date} value={f.end_date || ""} onChange={e => set("end_date", e.target.value)} className={inp} /></L></div>
        {f.hr_type === "sick" && <L t="التقرير الطبي (إجباري)" hint="PDF أو صورة واضحة للتقرير — من صحتي أو المستشفى">
          <button type="button" onClick={() => fileRef.current?.click()} className={`mt-1 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-4 text-sm font-bold transition ${file ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-[var(--border-strong)] bg-white text-[var(--navy)] hover:bg-[var(--sky-light)]"}`}>
            <Icon name={file ? "check" : "upload"} size={18} />{file ? file.name : "ارفع التقرير"}</button>
          <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} /></L>}
      </>}

      {kind === "exit_reentry" && <>
        <Seg value={f.hr_type} set={v => set("hr_type", v)} opts={[["single", "مفردة", "سفرة واحدة"], ["multiple", "متعددة", "أكتر من سفرة"]]} />
        <div className="grid grid-cols-2 gap-3"><L t="تاريخ السفر"><input type="date" required min={today} value={f.start_date || ""} onChange={e => set("start_date", e.target.value)} className={inp} /></L>
          <L t={f.hr_type === "multiple" ? "صالحة لحد (اختياري)" : "تاريخ العودة"}><input type="date" required={f.hr_type === "single"} min={f.start_date || today} value={f.end_date || ""} onChange={e => set("end_date", e.target.value)} className={inp} /></L></div>
        <L t="الوجهة"><input required value={f.destination || ""} onChange={e => set("destination", e.target.value)} placeholder="مثلاً: مصر" className={inp} /></L>
      </>}

      {kind === "advance" && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <L t="المبلغ (ر.س)"><input required inputMode="decimal" dir="ltr" value={f.amount || ""} onChange={e => set("amount", e.target.value.replace(/[^\d.]/g, ""))} placeholder="3000" className={inp} /></L>
        <L t="عدد الأقساط"><select value={f.installments} onChange={e => set("installments", e.target.value)} className={inp}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1} {i ? "أقساط" : "قسط"}</option>)}</select></L>
        <L t="يبدأ الخصم من"><select value={f.start_month} onChange={e => set("start_month", e.target.value)} className={inp}>{Array.from({ length: 7 }, (_, i) => addM(d.month, i)).map(m => <option key={m} value={m}>{mlabel(m)}</option>)}</select></L>
      </div>}

      {kind === "salary_letter" && <>
        <Seg value={f.hr_type} set={v => set("hr_type", v)} opts={[["bank", "بنك"], ["embassy", "سفارة"], ["other", "جهة أخرى"]]} />
        <L t="موجّه إلى"><input required value={f.addressee || ""} onChange={e => set("addressee", e.target.value)} placeholder={f.hr_type === "bank" ? "مثلاً: البنك الأهلي السعودي" : f.hr_type === "embassy" ? "مثلاً: سفارة جمهورية مصر العربية" : "اسم الجهة"} className={inp} /></L>
        <div className="grid grid-cols-2 gap-3"><L t="لغة الخطاب"><Seg value={f.language} set={v => set("language", v)} opts={[["ar", "عربي"], ["en", "English"]]} /></L>
          <L t="ذكر الراتب"><Seg value={f.include_salary} set={v => set("include_salary", v)} opts={[["yes", "يُذكر"], ["no", "لا"]]} /></L></div>
      </>}

      <L t={kind === "advance" ? "سبب السلفة" : "ملاحظات (اختياري)"}><textarea required={kind === "advance"} rows={2} value={f.body || ""} onChange={e => set("body", e.target.value)} className={inp} placeholder={kind === "leave" ? "مثلاً: مين هيغطي زياراتك؟" : ""} /></L>
      {preview && <div className={`es-pop rounded-xl px-3 py-2 text-[12.5px] font-bold ${preview.tone === "bad" ? "bg-red-50 text-red-800" : preview.tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{preview.text}</div>}
      <button disabled={busy} className="w-full rounded-xl px-4 py-3 text-sm font-extrabold text-white shadow-md transition hover:brightness-110 disabled:opacity-60" style={{ background: kindOf(kind).color }}>{busy ? "بيتبعت…" : "ابعت الطلب"}</button>
    </form>}

    {d.requests.length > 0 && <div>
      <h3 className="mb-2 text-sm font-extrabold text-[var(--navy)]">طلباتي</h3>
      <ul className="space-y-2">{d.requests.slice(0, 12).map((r, i) => { const k = kindOf(r.kind); return <li key={r.id} id={`hr-${r.id}`} style={{ animationDelay: `${i * 50}ms` }}
        className={`es-card-in flex flex-wrap items-start gap-3 rounded-2xl border p-3 transition ${hl === r.id ? "border-[var(--gold)] ring-2 ring-[var(--gold)]/30" : "border-[var(--border)]"}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${k.color}1f`, color: k.color }}><Icon name={k.icon} size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><b className="text-sm text-[var(--navy)]">{k.label}</b><StatusPill s={r.status} /><span className="text-[11px] text-[var(--muted)]">{rel(r.created_at)}</span></div>
          <div className="mt-0.5 text-[12px] text-[var(--ink-soft)]">{facts(r).join(" · ")}</div>
          {r.response && !["pending"].includes(r.status) && <div className="mt-1 rounded-lg bg-[var(--bg)] px-2 py-1 text-[11.5px]">رد الإدارة: {r.response}</div>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {r.signed_file_name && <a href={`/api/requests/${r.id}?kind=signed`} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white">⬇ المستند</a>}
          {r.status === "needs_info" && <Link href={`/requests?request=${r.id}`} className="rounded-lg bg-[var(--navy)] px-2.5 py-1.5 text-[11px] font-bold text-white">رد</Link>}
          {["pending", "in_progress", "needs_info"].includes(r.status) && <button type="button" onClick={() => void cancel(r.id)} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-bold text-red-700">إلغاء</button>}
        </div>
      </li>; })}</ul>
    </div>}
  </section>;
}
