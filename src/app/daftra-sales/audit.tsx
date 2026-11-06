"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { Check, Finding } from "@/lib/fin-audit";
import type { Tab } from "./FinanceHub";
import { sar, Card, Hint, Pill } from "./kit";

type Data = { checks: Check[]; score: number; open: number; open_high: number };
const SEV: Record<string, [string, string]> = { high: ["مهم جداً", "bg-red-50 text-red-700 ring-red-200"], medium: ["متوسط", "bg-amber-50 text-amber-800 ring-amber-200"], low: ["بسيط", "bg-slate-100 text-slate-600 ring-slate-200"] };
const REV: Record<string, [string, string]> = { ok: ["راجعتها — سليمة", "bg-emerald-50 text-emerald-700 ring-emerald-200"], fixed: ["اتصلحت في دفترة", "bg-sky-50 text-sky-700 ring-sky-200"], ignored: ["متجاهلة", "bg-slate-100 text-slate-600 ring-slate-200"] };
const daftraUrl = (sub: string, kind: "sale" | "purchase", id: number) => `https://${sub}.daftra.com/owner/${kind === "sale" ? "invoices" : "purchase_invoices"}/view/${id}`;

function Ring({ v }: { v: number }) {
  const c = v >= 85 ? "#1aa865" : v >= 60 ? "#e99608" : "#c92f36", r = 34, L = 2 * Math.PI * r;
  return <svg viewBox="0 0 80 80" className="h-24 w-24 shrink-0" role="img" aria-label={`درجة السلامة ${v} من 100`}>
    <circle cx="40" cy="40" r={r} fill="none" stroke="var(--bg)" strokeWidth="8" />
    <circle cx="40" cy="40" r={r} fill="none" stroke={c} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${L * v / 100} ${L}`} transform="rotate(-90 40 40)" style={{ transition: "stroke-dasharray .7s" }} />
    <text x="40" y="45" textAnchor="middle" fontSize="20" fontWeight="800" fill={c}>{v}</text>
  </svg>;
}

function FindingRow({ f, subdomain, go, onDone }: { f: Finding; subdomain: string; go: (t: Tab) => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState(""); const [ign, setIgn] = useState(false); const [busy, setBusy] = useState(false);
  async function mark(status: string) {
    if (status === "ignored" && note.trim().length < 3) { setIgn(true); toast("اكتب سبب التجاهل الأول", "error"); return; }
    setBusy(true);
    const r = await fetch("/api/admin/finance/audit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: f.key, status, note }) });
    const j = await r.json().catch(() => null); setBusy(false);
    if (!r.ok) toast(j?.error || "تعذر الحفظ", "error"); else { toast("اتسجلت المراجعة", "success"); onDone(); }
  }
  async function undo() { setBusy(true); await fetch(`/api/admin/finance/audit?key=${encodeURIComponent(f.key)}`, { method: "DELETE" }); setBusy(false); onDone(); }
  const link = f.link;
  return <li className={`rounded-xl border border-[var(--border)] p-3 ${f.review ? "bg-[var(--bg)]/60" : "bg-white"}`}>
    <div className="flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1"><b className="block text-[13px]" dir="auto">{f.title}</b><p className="mt-0.5 text-[12px] leading-5 text-[var(--ink-soft)]">{f.detail}</p>
        <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-[var(--muted)]">{f.date && <span>{f.date}</span>}{f.amount !== null && <span>المبلغ: <b className="text-[var(--navy)]">{sar(f.amount)}</b></span>}</div></div>
      {link && (link.kind === "tab"
        ? <button type="button" onClick={() => go(link.tab as Tab)} className="shrink-0 rounded-lg bg-[var(--sky-light)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--navy)]">افتح التبويب ‹</button>
        : <a href={daftraUrl(subdomain, link.kind, link.id)} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg bg-[var(--sky-light)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--navy)]">افتح في دفترة ↗</a>)}
    </div>
    {f.review ? <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]"><Pill text={REV[f.review.status]?.[0] || f.review.status} cls={REV[f.review.status]?.[1] || ""} />{f.review.note && <span className="text-[var(--muted)]">“{f.review.note}”</span>}<button type="button" disabled={busy} onClick={() => void undo()} className="mr-auto font-bold text-[var(--muted)] hover:text-red-700">تراجع</button></div>
      : <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button type="button" disabled={busy} onClick={() => void mark("ok")} className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">✓ راجعتها وسليمة</button>
        <button type="button" disabled={busy} onClick={() => void mark("fixed")} className="rounded-lg bg-sky-50 px-2.5 py-1.5 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200">صلّحتها في دفترة</button>
        {ign ? <span className="flex min-w-0 flex-1 items-center gap-1.5"><input autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="ليه هتتجاهلها؟ (مثلاً: العميل معفي من الضريبة)" className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-[11px]" /><button type="button" disabled={busy} onClick={() => void mark("ignored")} className="rounded-lg bg-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-white">احفظ</button></span>
          : <button type="button" onClick={() => setIgn(true)} className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-[var(--muted)] ring-1 ring-[var(--border)]">تجاهل…</button>}
      </div>}
  </li>;
}

function CheckCard({ c, subdomain, go, reload, open: open0 }: { c: Check; subdomain: string; go: (t: Tab) => void; reload: () => void; open: boolean }) {
  const [open, setOpen] = useState(open0); const [all, setAll] = useState(false);
  const pending = c.findings.filter(f => !f.review), done = c.findings.length - pending.length;
  const list = all ? c.findings : pending.length ? pending : c.findings;
  const total = pending.reduce((s, f) => s + (f.amount || 0), 0);
  return <section className={`rounded-2xl border bg-white ${pending.length && c.severity === "high" ? "border-red-200" : "border-[var(--border)]"}`}>
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-2 p-4 text-right">
      <span className={pending.length ? (c.severity === "high" ? "text-red-600" : "text-amber-600") : "text-emerald-600"}><Icon name={pending.length ? "warn" : "check"} size={18} /></span>
      <b className="min-w-0 flex-1 text-sm">{c.title}</b>
      <Pill text={SEV[c.severity][0]} cls={SEV[c.severity][1]} />
      <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] font-bold">{pending.length ? `${pending.length} محتاجة مراجعة` : "سليم ✓"}{done ? ` · ${done} اتراجعت` : ""}</span>
      {total > 0 && <span className="text-[11px] font-bold text-[var(--navy)]">{sar(total)}</span>}
      <span className={`text-[var(--muted)] transition ${open ? "rotate-180" : ""}`}>▾</span>
    </button>
    {open && <div className="space-y-3 border-t border-[var(--border)] p-4">
      <div className="grid gap-2 sm:grid-cols-2"><div className="rounded-xl bg-[var(--sky-light)] p-3 text-[12px] leading-6"><b className="block text-[var(--navy)]">ليه ده مهم؟</b>{c.why}</div><div className="rounded-xl bg-emerald-50 p-3 text-[12px] leading-6 text-emerald-950"><b className="block">تعمل إيه؟</b>{c.fix}</div></div>
      {c.findings.length ? <><ul className="space-y-2">{list.slice(0, all ? 200 : 15).map(f => <FindingRow key={f.key} f={f} subdomain={subdomain} go={go} onDone={reload} />)}</ul>
        {(list.length > 15 || (done > 0 && pending.length > 0)) && <button type="button" onClick={() => setAll(!all)} className="w-full rounded-xl bg-[var(--bg)] py-2 text-xs font-bold text-[var(--navy)]">{all ? "اعرض اللي محتاج مراجعة بس" : `اعرض الكل (${c.findings.length})`}</button>}</>
        : <p className="text-[12px] text-emerald-700">مفيش أي ملاحظة في الفترة دي.</p>}
    </div>}
  </section>;
}

export function AuditTab({ range, subdomain, go }: { range: [string, string]; subdomain: string; go: (t: Tab) => void }) {
  const toast = useToast();
  const [d, setD] = useState<Data | null>(null);
  const load = useCallback(async () => {
    const j = await fetch(`/api/admin/finance/audit?from=${range[0]}&to=${range[1]}`).then(r => r.json()).catch(() => null);
    if (j?.checks) setD(j); else toast(j?.error || "تعذر تحميل المراجعة", "error");
  }, [range, toast]);
  useEffect(() => { void load(); }, [load]);
  if (!d) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  const bad = d.checks.filter(c => c.findings.some(f => !f.review)).sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity]));
  const good = d.checks.filter(c => !c.findings.some(f => !f.review));
  return <div className="space-y-4">
    <Card>
      <div className="flex flex-wrap items-center gap-4">
        <Ring v={d.score} />
        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold text-[var(--navy)]">درجة سلامة الحسابات<Hint text="بشغّل 18 فحص زي ما المراجع الخارجي بيعمل: الضريبة، التكرار، الأرقام الناقصة، الخصومات، البيع بخسارة، المصروفات غير المصنفة، المديونيات… كل فحص سليم بيزوّد الدرجة، والفحوص المهمة وزنها أكبر." /></h3>
          <p className="mt-1 text-[12.5px] leading-6 text-[var(--ink-soft)]">{d.open ? <>فيه <b>{d.open}</b> ملاحظة محتاجة مراجعة{d.open_high ? <> — منها <b className="text-red-700">{d.open_high} مهمة جداً</b></> : null}. افتح كل فحص، اقرأ ليه هو مهم، وصلّح في دفترة أو علّمها إنها سليمة.</> : "كل الفحوص سليمة في الفترة دي. ممتاز."}</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">المراجعة بتتسجل في الـ CRM بس — مش بتغيّر حاجة في دفترة. الفترة: {range[0]} ← {range[1]}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">{(["high", "medium", "low"] as const).map(s => { const n = d.checks.filter(c => c.severity === s).reduce((t, c) => t + c.findings.filter(f => !f.review).length, 0); return <div key={s} className="rounded-xl bg-[var(--bg)] px-3 py-2"><b className={`block text-lg ${n ? (s === "high" ? "text-red-700" : "text-[var(--navy)]") : "text-emerald-700"}`}>{n}</b>{SEV[s][0]}</div>; })}</div>
      </div>
    </Card>
    <div className="space-y-2">{bad.map((c, i) => <CheckCard key={c.id} c={c} subdomain={subdomain} go={go} reload={() => void load()} open={i === 0} />)}</div>
    {good.length > 0 && <Card title={`فحوص سليمة (${good.length})`}><div className="flex flex-wrap gap-2">{good.map(c => <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200"><Icon name="check" size={12} />{c.title}</span>)}</div></Card>}
  </div>;
}
