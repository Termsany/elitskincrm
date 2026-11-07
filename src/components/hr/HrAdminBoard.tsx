"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { Balance, HrRow, PayLine } from "@/lib/hr";
import { StatusPill, dshort, facts, kindOf, mlabel, rel, sar } from "./hr-ui";

type Rep = { id: string; name: string; hire_date: string | null; salary: number };
type Data = { today: string; month: string; requests: HrRow[]; balances: Record<string, Balance>; payroll: PayLine[]; reps: Rep[] };
type Tab = "decide" | "away" | "log" | "pay";
const OPEN = ["pending", "reopened", "in_progress", "needs_info", "deferred"];
const DONE = ["approved", "completed", "closed"];
const initials = (n: string) => n.split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase();
const addM = (m: string, n: number) => { const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)); return d.toISOString().slice(0, 7); };

function Count({ to }: { to: number }) {
  const [v, setV] = useState(0);
  useEffect(() => { if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(to); return; } let raf = 0; const s = performance.now();
    const step = (n: number) => { const p = Math.min(1, (n - s) / 700); setV(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, [to]);
  return <>{v.toLocaleString("en-US")}</>;
}

/** Admin: employee requests to decide (with balance / deduction context), who is away, history, and monthly salary deductions. */
export default function HrAdminBoard({ focus }: { focus?: string }) {
  const toast = useToast();
  const [d, setD] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [tab, setTab] = useState<Tab>("decide");
  const [month, setMonth] = useState("");
  const [act, setAct] = useState<{ id: string; action: string } | null>(null);
  const [note, setNote] = useState("");
  const [doc, setDoc] = useState<File | null>(null);
  const [busy, setBusy] = useState("");
  const [gone, setGone] = useState<string[]>([]);
  const docRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (m = "") => {
    const r = await fetch(`/api/hr-requests${m ? `?month=${m}` : ""}`, { cache: "no-store" });
    if (r.status === 403) { setDenied(true); return; }
    const j = await r.json().catch(() => null); if (j?.requests) { setD(j); setMonth(j.month); setGone([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (focus && d) setTimeout(() => document.getElementById(`hra-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 250); }, [focus, d]);

  const salaryOf = useMemo(() => Object.fromEntries((d?.reps || []).map(r => [r.id, r.salary])), [d]);
  if (denied) return null;
  if (!d) return <div className="es-shimmer h-56 rounded-3xl" />;
  const today = d.today, in14 = new Date(Date.parse(`${today}T00:00:00Z`) + 14 * 864e5).toISOString().slice(0, 10);
  const open = d.requests.filter(r => OPEN.includes(r.status) && !gone.includes(r.id));
  const toIssue = d.requests.filter(r => r.status === "approved" && ["exit_reentry", "salary_letter"].includes(r.kind) && !gone.includes(r.id));
  const leaves = d.requests.filter(r => r.kind === "leave" && DONE.includes(r.status) && r.end_date && r.end_date >= today);
  const awayNow = leaves.filter(r => r.start_date! <= today), soon = leaves.filter(r => r.start_date! > today && r.start_date! <= in14);
  const log = d.requests.filter(r => !OPEN.includes(r.status));
  const payTotal = d.payroll.reduce((s, p) => s + p.unpaid + p.advance, 0);

  async function decide(r: HrRow, action: string) {
    if ((action === "reject" || action === "needs_info") && note.trim().length < 3) { toast("اكتب السبب للمندوب", "error"); return; }
    setBusy(r.id);
    const fd = new FormData(); fd.set("action", action); fd.set("note", note.trim()); if (doc) fd.set("file", doc);
    const res = await fetch(`/api/hr-requests/${r.id}`, { method: "PATCH", body: fd }); const j = await res.json().catch(() => null);
    setBusy("");
    if (!res.ok) { toast(j?.error || "تعذر الحفظ", "error"); return; }
    toast(action === "approve" ? `اتعتمد طلب ${r.requester_name} ✓` : action === "complete" ? "اتسلّم ✓" : action === "reject" ? "اترفض الطلب" : "اتبعت سؤالك للمندوب", "success");
    setGone(g => [...g, r.id]); setAct(null); setNote(""); setDoc(null);
    setTimeout(() => void load(month), 450);
  }

  function card(r: HrRow, i: number, issue?: boolean) {
    const k = kindOf(r.kind), bal = d!.balances[r.requester_id], sal = salaryOf[r.requester_id] || 0;
    const ctx: Array<[string, string]> = [];
    if (r.kind === "leave" && r.hr_type === "annual" && bal) { const after = bal.remaining - (r.days || 0); ctx.push([after < 0 ? "bad" : "ok", `الرصيد ${bal.remaining} يوم ← بعد الموافقة ${after} يوم`]); }
    if (r.kind === "leave" && r.hr_type === "unpaid") ctx.push(["warn", sal ? `هيتخصم ${sar(sal / 30 * (r.days || 0), 2)} من الراتب (${sar(sal)} ÷ 30 × ${r.days})` : "الراتب مش متسجل في ملف المندوب — الخصم هيبقى صفر لحد ما يتسجل"]);
    if (r.kind === "leave" && r.hr_type === "sick") ctx.push([r.file_name ? "ok" : "bad", r.file_name ? "التقرير الطبي مرفق" : "مفيش تقرير طبي مرفق"]);
    if (r.kind === "advance" && r.amount) { const each = r.amount / (r.installments || 1); ctx.push([sal && each > sal * 0.5 ? "warn" : "ok", `قسط ${sar(each, 2)}/شهر${sal ? ` = ${Math.round(each / sal * 100)}% من الراتب` : ""}`]); }
    const mine = act?.id === r.id;
    return <article key={r.id} id={`hra-${r.id}`} style={{ animationDelay: `${i * 60}ms` }}
      className={`es-card-in relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md ${gone.includes(r.id) ? "scale-95 opacity-0" : ""} ${focus === r.id ? "ring-2 ring-[var(--gold)]" : "border-[var(--border)]"}`}>
      <span className="absolute inset-y-0 right-0 w-1.5" style={{ background: k.color }} />
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-xs font-extrabold text-white">{initials(r.requester_name)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><b className="text-[var(--navy)]">{r.requester_name}</b>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${k.color}1f`, color: k.color }}><Icon name={k.icon} size={12} />{k.label}</span>
            <StatusPill s={r.status} /><span className="text-[11px] text-[var(--muted)]">{rel(r.created_at)}</span></div>
          <div className="mt-1 text-[13px] font-bold text-[var(--ink)]">{facts(r).join(" · ")}</div>
          {r.body && <p className="mt-1 whitespace-pre-wrap text-[12px] leading-6 text-[var(--ink-soft)]">“{r.body}”</p>}
          {ctx.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{ctx.map(([tone, t], j) => <span key={j} className={`rounded-lg px-2 py-1 text-[11.5px] font-bold ${tone === "bad" ? "bg-red-50 text-red-700" : tone === "warn" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{t}</span>)}</div>}
          {r.file_name && <a href={`/api/requests/${r.id}`} className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-[var(--sky-deep)] hover:underline">📎 {r.kind === "leave" ? "التقرير الطبي" : "المرفق"} ({r.file_name})</a>}
        </div>
      </div>
      {mine && act.action !== "approve" && <div className="es-card-in mt-3 space-y-2">
        <textarea autoFocus rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder={act.action === "reject" ? "سبب الرفض (هيوصل للمندوب)" : act.action === "needs_info" ? "محتاج توضيح إيه؟" : "رسالة للمندوب (اختياري)"} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
        {act.action === "complete" && <><button type="button" onClick={() => docRef.current?.click()} className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-3 text-sm font-bold ${doc ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-[var(--border-strong)]"}`}><Icon name={doc ? "check" : "upload"} size={16} />{doc ? doc.name : r.kind === "salary_letter" ? "ارفع الخطاب PDF" : "ارفع التأشيرة PDF"}</button>
          <input ref={docRef} type="file" accept="application/pdf" className="hidden" onChange={e => setDoc(e.target.files?.[0] || null)} /></>}
      </div>}
      <div className="mt-3 flex flex-wrap gap-2">
        {issue ? <>
          {mine ? <button type="button" disabled={busy === r.id} onClick={() => void decide(r, "complete")} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60">تسليم للمندوب ✓</button>
            : <button type="button" onClick={() => { setAct({ id: r.id, action: "complete" }); setNote(""); setDoc(null); }} className="flex-1 rounded-xl bg-[var(--navy)] px-4 py-2.5 text-sm font-extrabold text-white">ارفع المستند وسلّم</button>}
        </> : mine && act.action !== "approve" ? <>
          <button type="button" disabled={busy === r.id} onClick={() => void decide(r, act.action)} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60 ${act.action === "reject" ? "bg-red-600" : "bg-[var(--navy)]"}`}>{act.action === "reject" ? "تأكيد الرفض" : "ابعت السؤال"}</button>
          <button type="button" onClick={() => setAct(null)} className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-bold">رجوع</button>
        </> : <>
          <button type="button" disabled={busy === r.id} onClick={() => { setNote(""); void decide(r, "approve"); }} className="es-hr-approve flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-emerald-700 disabled:opacity-60">{busy === r.id ? "…" : "✓ اعتماد"}</button>
          {r.status !== "needs_info" && <button type="button" onClick={() => { setAct({ id: r.id, action: "needs_info" }); setNote(""); }} className="rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm font-bold">↩ استفسار</button>}
          <button type="button" onClick={() => { setAct({ id: r.id, action: "reject" }); setNote(""); }} className="rounded-xl border border-red-200 px-3 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50">✕ رفض</button>
        </>}
      </div>
    </article>;
  }

  const kpis: Array<[string, number, string, string, Tab]> = [
    ["محتاج قرارك", open.length + toIssue.length, "#e99608", "alert", "decide"],
    ["في إجازة النهارده", awayNow.length, "#33b3a6", "calendar", "away"],
    ["إجازات خلال أسبوعين", soon.length, "#3b90e8", "travel", "away"],
    [`خصومات ${mlabel(d.month)}`, Math.round(payTotal), "#ef4b4e", "wallet", "pay"],
  ];
  const tabs: Array<[Tab, string, number?]> = [["decide", "محتاج قرارك", open.length + toIssue.length], ["away", "مين في إجازة"], ["log", "السجل"], ["pay", "الرواتب والخصومات"]];

  return <section id="hr" className="scroll-mt-24 space-y-4" aria-labelledby="hr-admin-title">
    <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 id="hr-admin-title" className="text-xl font-extrabold text-[var(--navy)]">طلبات الموظفين</h2>
      <p className="text-[12.5px] text-[var(--muted)]">إجازات · خروج وعودة · سلف · تعريف بالراتب — اعتمد من هنا مباشرة</p></div></div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{kpis.map(([l, v, c, ic, t], i) =>
      <button key={l} type="button" onClick={() => setTab(t)} style={{ animationDelay: `${i * 70}ms`, borderTopColor: c }}
        className="es-card-in group relative overflow-hidden rounded-2xl border border-t-4 border-[var(--border)] bg-white p-4 text-right shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg">
        <span className="absolute -left-5 -top-5 h-16 w-16 rounded-full opacity-10 transition-transform duration-500 group-hover:scale-150" style={{ background: c }} />
        <span className="flex items-center gap-2 text-[11.5px] font-bold text-[var(--muted)]"><span style={{ color: c }}><Icon name={ic} size={16} /></span>{l}</span>
        <b className="mt-1 block text-2xl font-extrabold" style={{ color: v && t === "decide" ? c : "var(--navy)" }}><Count to={v} />{t === "pay" ? <span className="text-xs font-bold"> ر.س</span> : null}</b>
        {t === "decide" && v > 0 && <span className="absolute left-3 top-3 h-2.5 w-2.5 animate-ping rounded-full" style={{ background: c }} />}
      </button>)}</div>

    <div className="flex gap-1.5 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white p-1.5">{tabs.map(([t, l, n]) =>
      <button key={t} type="button" onClick={() => setTab(t)} className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition ${tab === t ? "bg-[var(--navy)] text-white shadow" : "text-[var(--muted)] hover:text-[var(--navy)]"}`}>{l}{n ? <span className={`mr-1.5 rounded-full px-1.5 text-[11px] ${tab === t ? "bg-white/20" : "bg-amber-100 text-amber-800"}`}>{n}</span> : null}</button>)}</div>

    {tab === "decide" && (open.length + toIssue.length === 0
      ? <div className="es-card-in rounded-2xl border border-[var(--border)] bg-white p-10 text-center"><div className="es-pop mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Icon name="sparkle" size={30} /></div><div className="mt-2 font-extrabold text-[var(--navy)]">مفيش طلبات مستنياك</div><div className="text-sm text-[var(--muted)]">أي طلب إجازة أو سلفة جديد هيظهر هنا وفي الرئيسية</div></div>
      : <div className="space-y-3">
        {open.length > 0 && <div className="grid gap-3 xl:grid-cols-2">{open.map((r, i) => card(r, i))}</div>}
        {toIssue.length > 0 && <><h3 className="pt-2 text-sm font-extrabold text-[var(--navy)]">معتمدة ومحتاجة تجهيز المستند ({toIssue.length})</h3>
          <div className="grid gap-3 xl:grid-cols-2">{toIssue.map((r, i) => card(r, i, true))}</div></>}
      </div>)}

    {tab === "away" && <div className="grid gap-3 lg:grid-cols-2">{([["في إجازة دلوقتي", awayNow], ["جاية خلال أسبوعين", soon]] as Array<[string, HrRow[]]>).map(([t, rows], gi) =>
      <div key={t} className="es-card-in rounded-2xl border border-[var(--border)] bg-white p-4" style={{ animationDelay: `${gi * 80}ms` }}><h3 className="mb-2 font-extrabold text-[var(--navy)]">{t} ({rows.length})</h3>
        {!rows.length ? <p className="py-4 text-center text-sm text-[var(--muted)]">مفيش</p> : <ul className="space-y-2">{rows.map(r => { const left = Math.round((Date.parse(`${r.end_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5) + 1, inN = Math.round((Date.parse(`${r.start_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);
          return <li key={r.id} className="flex items-center gap-3 rounded-xl bg-[var(--bg)] p-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--navy)] text-[11px] font-extrabold text-white">{initials(r.requester_name)}</span>
            <div className="min-w-0 flex-1"><b className="text-sm">{r.requester_name}</b><div className="text-[11.5px] text-[var(--muted)]">{facts(r).join(" · ")}</div></div>
            <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[var(--navy)]">{gi === 0 ? `باقي ${left} يوم` : inN === 1 ? "بكرة" : `بعد ${inN} يوم`}</span></li>; })}</ul>}
      </div>)}</div>}

    {tab === "log" && <div className="es-card-in overflow-hidden rounded-2xl border border-[var(--border)] bg-white">{!log.length ? <p className="p-8 text-center text-sm text-[var(--muted)]">لسه مفيش سجل</p> :
      <ul className="divide-y divide-[var(--border)]">{log.slice(0, 60).map(r => { const k = kindOf(r.kind); return <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${k.color}1f`, color: k.color }}><Icon name={k.icon} size={16} /></span>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b className="text-sm">{r.requester_name}</b><span className="text-[12px] text-[var(--muted)]">{k.label}</span><StatusPill s={r.status} /></div>
          <div className="text-[11.5px] text-[var(--muted)]">{facts(r).join(" · ")}{r.response ? ` — ${r.response}` : ""}</div></div>
        {r.signed_file_name && <a href={`/api/requests/${r.id}?kind=signed`} className="text-[11.5px] font-bold text-[var(--sky-deep)]">المستند ⬇</a>}
      </li>; })}</ul>}</div>}

    {tab === "pay" && <PayTab d={d} month={month} setMonth={m => { setMonth(m); void load(m); }} reload={() => load(month)} />}
  </section>;
}

function PayTab({ d, month, setMonth, reload }: { d: Data; month: string; setMonth: (m: string) => void; reload: () => Promise<void> }) {
  const toast = useToast();
  const [edit, setEdit] = useState<Record<string, { o: string; c: string }>>({});
  const tot = d.payroll.reduce((a, p) => ({ s: a.s + p.salary, u: a.u + p.unpaid, v: a.v + p.advance, n: a.n + p.net }), { s: 0, u: 0, v: 0, n: 0 });
  async function save(id: string) {
    const e = edit[id]; const r = await fetch("/api/hr-requests", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ rep_id: id, annual_leave_days: e.o === "" ? null : Number(e.o), leave_carryover: Number(e.c || 0) }) });
    const j = await r.json().catch(() => null); if (!r.ok) toast(j?.error || "تعذر الحفظ", "error"); else { toast("اتحفظ الرصيد", "success"); setEdit(x => { const y = { ...x }; delete y[id]; return y; }); await reload(); }
  }
  return <div className="space-y-4">
    <div className="es-card-in overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] p-4"><div><h3 className="font-extrabold text-[var(--navy)]">خصومات الرواتب — {mlabel(month)}</h3><p className="text-[11.5px] text-[var(--muted)]">إجازة بدون راتب = الراتب ÷ 30 × الأيام · أقساط السلف المعتمدة</p></div>
        <div className="flex items-center gap-1"><button type="button" onClick={() => setMonth(addM(month, -1))} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm">‹</button><span className="min-w-28 text-center text-sm font-bold">{mlabel(month)}</span><button type="button" onClick={() => setMonth(addM(month, 1))} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm">›</button></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="p-3 text-right">المندوب</th><th className="p-3">الراتب</th><th className="p-3">بدون راتب</th><th className="p-3">خصم الإجازة</th><th className="p-3">قسط سلفة</th><th className="p-3">الصافي</th></tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{d.payroll.map(p => <tr key={p.rep_id} className={p.unpaid || p.advance ? "bg-red-50/40" : ""}><td className="p-3 font-bold">{p.name}{p.items.length > 0 && <div className="text-[11px] font-normal text-[var(--muted)]">{p.items.map(i => `${i.label}: ${sar(i.amount, 2)}`).join(" · ")}</div>}</td>
          <td className="p-3 text-center">{p.salary ? sar(p.salary) : <span className="text-[11px] text-amber-700">مش متسجل</span>}</td><td className="p-3 text-center">{p.unpaid_days || "—"}</td>
          <td className="p-3 text-center text-red-700">{p.unpaid ? sar(p.unpaid, 2) : "—"}</td><td className="p-3 text-center text-red-700">{p.advance ? sar(p.advance, 2) : "—"}</td><td className="p-3 text-center font-extrabold text-[var(--navy)]">{sar(p.net, 2)}</td></tr>)}</tbody>
        <tfoot className="bg-[var(--bg)] font-extrabold"><tr><td className="p-3">الإجمالي</td><td className="p-3 text-center">{sar(tot.s)}</td><td /><td className="p-3 text-center text-red-700">{sar(tot.u, 2)}</td><td className="p-3 text-center text-red-700">{sar(tot.v, 2)}</td><td className="p-3 text-center">{sar(tot.n, 2)}</td></tr></tfoot></table></div>
    </div>
    <div className="es-card-in overflow-hidden rounded-2xl border border-[var(--border)] bg-white" style={{ animationDelay: "100ms" }}>
      <div className="border-b border-[var(--border)] p-4"><h3 className="font-extrabold text-[var(--navy)]">أرصدة الإجازة السنوية {Object.values(d.balances)[0]?.year || ""}</h3><p className="text-[11.5px] text-[var(--muted)]">حسب نظام العمل: 21 يوم، و30 بعد 5 سنين من تاريخ التعيين (ومتناسبة في سنة التعيين). تقدر تغيّر الرصيد أو تضيف أيام مرحّلة.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="p-3 text-right">المندوب</th><th className="p-3">تاريخ التعيين</th><th className="p-3">الرصيد السنوي</th><th className="p-3">مرحّل</th><th className="p-3">مستخدم</th><th className="p-3">مستني</th><th className="p-3">المتبقي</th><th className="p-3" /></tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{d.reps.map(rep => { const b = d.balances[rep.id]; if (!b) return null; const e = edit[rep.id];
          return <tr key={rep.id}><td className="p-3 font-bold">{rep.name}</td><td className="p-3 text-center text-xs">{rep.hire_date ? dshort(rep.hire_date) + " " + rep.hire_date.slice(0, 4) : <span className="text-amber-700">مش متسجل</span>}</td>
            <td className="p-3 text-center">{e ? <input value={e.o} onChange={x => setEdit(s => ({ ...s, [rep.id]: { ...e, o: x.target.value.replace(/\D/g, "") } }))} placeholder="بالنظام" className="w-20 rounded-lg border border-[var(--border)] px-2 py-1 text-center" /> : <>{b.entitled}{b.override !== null && <span className="mr-1 text-[10px] text-[var(--muted)]">(يدوي)</span>}</>}</td>
            <td className="p-3 text-center">{e ? <input value={e.c} onChange={x => setEdit(s => ({ ...s, [rep.id]: { ...e, c: x.target.value.replace(/[^\d-]/g, "") } }))} className="w-16 rounded-lg border border-[var(--border)] px-2 py-1 text-center" /> : b.carryover || "—"}</td>
            <td className="p-3 text-center">{b.used}</td><td className="p-3 text-center">{b.pending || "—"}</td><td className={`p-3 text-center font-extrabold ${b.remaining < 0 ? "text-red-700" : "text-emerald-700"}`}>{b.remaining}</td>
            <td className="p-3 text-center">{e ? <button type="button" onClick={() => void save(rep.id)} className="rounded-lg bg-[var(--navy)] px-3 py-1 text-xs font-bold text-white">حفظ</button>
              : <button type="button" onClick={() => setEdit(s => ({ ...s, [rep.id]: { o: b.override === null ? "" : String(b.override), c: String(b.carryover || 0) } }))} className="text-xs font-bold text-[var(--sky-deep)]">تعديل</button>}</td></tr>; })}</tbody></table></div>
    </div>
  </div>;
}

