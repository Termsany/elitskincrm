"use client";
import Link from "next/link";
import { useState } from "react";
import { GlyphIcon, Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { Gap } from "@/lib/data-gaps";
import type { Morning } from "@/lib/morning-summary";

const k = (n: number) => Math.round(n).toLocaleString("en-US");
const rel = (d: string) => { const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 1 ? "دلوقتي" : m < 60 ? `من ${m} د` : m < 1440 ? `من ${Math.floor(m / 60)} س` : m < 2880 ? "امبارح" : `من ${Math.floor(m / 1440)} يوم`; };

/** "ملخص الصبح": yesterday in one glance, each number opens its page. */
export function MorningCard({ m, mgr }: { m: Morning; mgr: boolean }) {
  const tiles: Array<[string, string, string, string, string]> = [
    ["visits", "زيارات إمبارح", k(m.visits.total), m.visits.reps.map(r => `${r.name.split(" ")[0]} ${r.n}`).join(" · ") || "مفيش زيارات", `/visits?tab=visits`],
    ["reps", "من غير زيارات", String(m.visits.idle.length), m.visits.idle.join("، ") || "الكل اشتغل ✓", "/admin/reps"],
    ["check", "مستني قرارك", String(m.pending), m.pending ? "تحت في «محتاج قرارك»" : "مفيش ✓", "#inbox"],
    ["time", "متابعات النهارده", String(m.followupsToday), "مواعيد متابعة مع أطباء", "/visits?tab=visits"],
  ];
  if (!mgr) tiles.splice(2, 0, ["wallet", "متأخرات التحصيل", `${k(m.overdue.amount)}`, `${m.overdue.invoices} فاتورة عدّى ميعادها`, "/daftra-sales?tab=ar"]);
  if (!mgr && m.salesYesterday) tiles.splice(1, 0, ["sales", "مبيعات إمبارح", k(m.salesYesterday), "من فواتير دفترة", "/sales"]);
  return <section className="es-card-in overflow-hidden rounded-[28px] border border-amber-200 bg-gradient-to-l from-amber-50 via-white to-white p-4 sm:p-5" aria-labelledby="morning-h">
    <div className="mb-3 flex flex-wrap items-center gap-2"><span className="text-2xl">☀️</span><h2 id="morning-h" className="text-lg font-extrabold text-[var(--navy)]">ملخص الصبح</h2>
      {m.onLeave.length > 0 && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">🌴 في إجازة النهارده: {m.onLeave.join("، ")}</span>}</div>
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">{tiles.map(([ic, l, v, sub, href], i) =>
      <Link key={l} href={href} style={{ animationDelay: `${i * 60}ms` }} className="es-card-in group rounded-2xl border border-[var(--border)] bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted)]"><Icon name={ic} size={14} />{l}</div>
        <div className={`mt-1 text-xl font-extrabold ${l === "من غير زيارات" && v !== "0" ? "text-amber-700" : l === "متأخرات التحصيل" && m.overdue.amount ? "text-red-700" : "text-[var(--navy)]"}`}>{v}{l.includes("مبيعات") || l.includes("متأخرات") ? <span className="text-[11px]"> ر.س</span> : null}</div>
        <div className="truncate text-[10.5px] text-[var(--muted)]" title={sub}>{sub}</div>
      </Link>)}</div>
  </section>;
}

/** "بيانات ناقصة": setup gaps with a link to fix each, and one-tap deactivate for unused admin accounts. */
export function GapsCard({ gaps, onDone }: { gaps: Gap[]; onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  if (!gaps.length) return null;
  const tone = { red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-800", blue: "bg-sky-50 text-sky-800" };
  const shown = open ? gaps : gaps.slice(0, 3);
  async function off(id: string, name: string) {
    if (!confirm(`إيقاف حساب ${name}؟ مش هيقدر يدخل، وكل سجلاته هتفضل موجودة. تقدر ترجعه في أي وقت.`)) return;
    setBusy(id);
    const r = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: false }) });
    const j = await r.json().catch(() => null); setBusy("");
    if (!r.ok) toast(j?.error || "تعذر الإيقاف", "error"); else { toast(`اتقفل حساب ${name}`, "success"); onDone(); }
  }
  return <section className="es-card-in rounded-[28px] border border-[var(--border)] bg-white p-4 sm:p-5" aria-labelledby="gaps-h">
    <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2"><h2 id="gaps-h" className="text-lg font-extrabold text-[var(--navy)]">بيانات ناقصة</h2><span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{gaps.length}</span></div>
      <span className="text-[11px] text-[var(--muted)]">كمّلها عشان الأرقام تبقى صح</span></div>
    <ul className="space-y-2">{shown.map((gp, i) => <li key={gp.key} style={{ animationDelay: `${i * 60}ms` }} className="es-card-in flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--bg)] p-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone[gp.tone]}`}><Icon name={gp.tone === "red" ? "alert" : gp.tone === "amber" ? "warn" : "sparkle"} size={17} /></span>
      <div className="min-w-0 flex-1"><b className="text-sm text-[var(--ink)]">{gp.title}</b><div className="text-[11.5px] text-[var(--muted)]">{gp.text}{gp.names?.length ? ` — ${gp.names.join("، ")}` : ""}</div>
        {gp.deactivate && <div className="mt-1.5 flex flex-wrap gap-1.5">{gp.deactivate.map(u => <button key={u.id} type="button" disabled={busy === u.id} onClick={() => void off(u.id, u.name)} className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-60" title={u.email}>إيقاف {u.name}</button>)}</div>}</div>
      {!gp.deactivate && <Link href={gp.href} className="shrink-0 rounded-xl bg-[var(--navy)] px-3 py-1.5 text-xs font-bold text-white transition hover:-translate-y-0.5">كمّل ‹</Link>}
    </li>)}</ul>
    {gaps.length > 3 && <button type="button" onClick={() => setOpen(!open)} className="mt-2 w-full text-center text-xs font-bold text-[var(--muted)] hover:text-[var(--navy)]">{open ? "أقل" : `+ ${gaps.length - 3} كمان`}</button>}
  </section>;
}

type Item = { id: string; title: string; owner: string | null; at: string; href: string; bulk?: boolean };
type Group = { key: string; label: string; icon: string; href: string; count: number; items: Item[]; bulk?: boolean };

/** Approve one inbox item through the module's own endpoint. */
async function approveOne(group: string, id: string): Promise<string | null> {
  const json = { "content-type": "application/json" };
  let r: Response;
  if (group === "plans") r = await fetch(`/api/plans/${id}`, { method: "PATCH", headers: json, body: JSON.stringify({ status: "approved", admin_note: "" }) });
  else if (group === "samples") r = await fetch(`/api/admin/orders/${id}`, { method: "PATCH", headers: json, body: JSON.stringify({ status: "approved" }) });
  else if (group === "expenses") r = await fetch("/api/admin/expenses/review", { method: "POST", headers: json, body: JSON.stringify({ ids: [id], action: "approve" }) });
  else if (group === "hr") { const fd = new FormData(); fd.set("action", "approve"); r = await fetch(`/api/hr-requests/${id}`, { method: "PATCH", body: fd }); }
  else return "مش مدعوم";
  if (r.ok) return null;
  const j = await r.json().catch(() => null); return j?.error || "تعذر";
}

/** Inbox rows with a select mode: tick several plans / samples / expenses / employee requests and approve them together. */
export function InboxList({ g, onDone }: { g: Group; onDone: () => void }) {
  const toast = useToast();
  const [sel, setSel] = useState<string[]>([]); const [mode, setMode] = useState(false); const [busy, setBusy] = useState(false); const [all, setAll] = useState(false);
  const bulkable = g.items.filter(i => i.bulk);
  const items = mode || all ? g.items : g.items.slice(0, 5);
  async function run() {
    setBusy(true); let ok = 0; const errs: string[] = [];
    for (const id of sel) { const e = await approveOne(g.key, id); if (e) errs.push(e); else ok++; }
    setBusy(false); setSel([]); setMode(false);
    if (ok) toast(`اتعتمد ${ok} ${ok === 1 ? "بند" : "بنود"} ✓`, "success");
    if (errs.length) toast(`${errs.length} ما اتعتمدوش: ${errs[0]}`, "error");
    onDone();
  }
  return <div className="border-t border-[var(--border)]">
    {g.bulk && bulkable.length > 1 && <div className="flex items-center justify-between gap-2 bg-[var(--bg)] px-5 py-2 text-xs">
      {mode ? <>
        <label className="flex cursor-pointer items-center gap-2 font-bold"><input type="checkbox" className="h-4 w-4 accent-[var(--navy)]" checked={sel.length === bulkable.length} onChange={e => setSel(e.target.checked ? bulkable.map(i => i.id) : [])} />تحديد الكل ({bulkable.length})</label>
        <div className="flex gap-1.5"><button type="button" onClick={() => { setMode(false); setSel([]); }} className="rounded-lg px-2.5 py-1.5 font-bold text-[var(--muted)]">إلغاء</button>
          <button type="button" disabled={!sel.length || busy} onClick={() => void run()} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-extrabold text-white shadow disabled:opacity-50">{busy ? "بيتعتمد…" : `✓ اعتماد المحدد (${sel.length})`}</button></div>
      </> : <><span className="text-[var(--muted)]">تقدر تعتمد أكتر من بند مرة واحدة</span><button type="button" onClick={() => setMode(true)} className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 font-bold text-[var(--navy)]">☑ اختيار</button></>}
    </div>}
    <div className="divide-y divide-[var(--border)]">{items.map(it => {
      const row = <><GlyphIcon g={g.icon} chip size={18} box={36} />
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-[var(--ink)]" dir="auto">{it.title}</div><div className="text-[11px] text-[var(--muted)]">{it.owner ? `${it.owner} · ` : ""}{rel(it.at)}</div></div></>;
      if (mode) return <label key={it.id} className={`flex cursor-pointer items-center gap-3 px-5 py-3 transition ${sel.includes(it.id) ? "bg-emerald-50/70" : "hover:bg-[var(--sky-light)]/50"} ${it.bulk ? "" : "opacity-50"}`}>
        <input type="checkbox" disabled={!it.bulk} className="h-4 w-4 accent-emerald-600" checked={sel.includes(it.id)} onChange={e => setSel(s => e.target.checked ? [...s, it.id] : s.filter(x => x !== it.id))} />{row}</label>;
      return <Link key={it.id} href={it.href} className="group flex items-center gap-3 px-5 py-3 transition hover:bg-[var(--sky-light)]/50">{row}
        <span className="rounded-lg bg-[var(--navy)] px-2.5 py-1 text-[11px] font-bold text-white opacity-0 transition group-hover:opacity-100">راجع ‹</span></Link>;
    })}</div>
    {!mode && g.items.length > 5 && <button type="button" onClick={() => setAll(!all)} className="block w-full px-5 py-2.5 text-center text-xs font-bold text-[var(--muted)] hover:text-[var(--navy)]">{all ? "أقل" : `+ ${g.items.length - 5} كمان`}</button>}
    {g.count > g.items.length && (mode || all) && <Link href={g.href} className="block px-5 py-2.5 text-center text-xs font-bold text-[var(--muted)] hover:text-[var(--navy)]">+ {g.count - g.items.length} في الصفحة ‹</Link>}
  </div>;
}
