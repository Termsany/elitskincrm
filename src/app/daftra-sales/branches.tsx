"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import type { BranchClient } from "@/lib/clinic-groups";

type D = { clients: BranchClient[]; clinics: Array<{ id: string; name: string; city: string; docs: number; client_id: number | null }> };
type C = { id: string; name: string; city: string; docs: number };

/** One Daftra customer = several branches (HOSN yarmouk, HOSN Dahran…). Sales stay per customer, doctors and visits per branch. */
export function BranchLinks() {
  const toast = useToast();
  const [d, setD] = useState<D | null>(null); const [q, setQ] = useState(""); const [adding, setAdding] = useState<number | null>(null); const [find, setFind] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch("/api/admin/finance/branches", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => j && setD(j)).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const sugg = useMemo(() => d?.clients.reduce((s, c) => s + c.suggestions.filter(x => !x.weak).length, 0) || 0, [d]);
  const none = useMemo(() => d?.clients.filter(c => !c.branches.length).length || 0, [d]);
  async function toggle(c: BranchClient, k: C, on: boolean) {
    const r = await fetch("/api/admin/finance/branches", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: c.client_id, clinic_id: k.id, on }) });
    if (!r.ok) { toast("تعذر الحفظ", "error"); return; } toast(on ? `اتضاف فرع ${k.name}` : `اتشال ${k.name}`, "success"); await load();
  }
  async function accept(client_id?: number) {
    setBusy(true); const r = await fetch("/api/admin/finance/branches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "accept", client_id }) });
    const j = await r.json().catch(() => null); setBusy(false); if (!r.ok) { toast(j?.error || "تعذر", "error"); return; } toast(`اتربط ${j.linked} فرع ✓`, "success"); await load();
  }
  if (!d) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  const shown = d.clients.filter(c => !q.trim() || `${c.name} ${c.branches.map(b => b.name).join(" ")}`.toLowerCase().includes(q.trim().toLowerCase()));
  const chip = (k: C, cls: string) => <span className="min-w-0 truncate" dir="auto">{k.name}<span className={`mr-1 text-[10px] ${cls}`}>{k.city ? `· ${k.city} ` : ""}· {k.docs} طبيب</span></span>;
  return <section id="branches" className="scroll-mt-24 rounded-2xl border border-[var(--border)] bg-white">
    <div className="flex flex-wrap items-start justify-between gap-2 p-4">
      <div className="min-w-0"><h3 className="font-extrabold text-[var(--navy)]">فروع العملاء</h3>
        <p className="text-[12px] leading-6 text-[var(--muted)]">العميل في دفترة اسم واحد، لكن في البرنامج ممكن يكون كذا فرع في أماكن مختلفة وبأطباء مختلفين (زي «الحسن والجمال» = HOSN yarmouk و HOSN Dahran…). اربط الفروع بالعميل عشان حسابه ومشترياته يظهروا عند أطباء كل الفروع، والتقارير تقارن زيارات كل الفروع بمبيعات العميل. الاقتراحات الخضرا اسمها مطابق، والصفرا «؟» تشابه في النطق بس — اتأكد منها.</p></div>
      {sugg > 0 && <button type="button" disabled={busy} onClick={() => void accept()} className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">✓ اقبل كل الاقتراحات ({sugg})</button>}
    </div>
    <div className="flex flex-wrap items-center gap-2 border-y border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[11.5px]">
      <span className="font-bold text-[var(--navy)]">{d.clients.length} عميل</span>{none > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">{none} من غير فروع</span>}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث" className="mr-auto w-40 rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-xs" /></div>
    <ul className="divide-y divide-[var(--border)]">{shown.map(c => <li key={c.client_id} className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2"><b className="min-w-0 flex-1 truncate text-sm" dir="auto">{c.name}</b>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${c.branches.length ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{c.branches.length ? `${c.branches.length} فرع` : "من غير فروع"}</span></div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {c.branches.map(k => <span key={k.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--navy)] px-2.5 py-1 text-[11.5px] font-bold text-white">{chip(k, "text-white/70")}
          <button type="button" onClick={() => void toggle(c, k, false)} className="mr-0.5 rounded-full px-1 text-white/80 hover:bg-white/20" aria-label={`شيل ${k.name}`}>×</button></span>)}
        {c.suggestions.map(k => <button key={k.id} type="button" onClick={() => void toggle(c, k, true)} className={`inline-flex max-w-full items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-[11.5px] font-bold ${k.weak ? "border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-emerald-400 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`} title={k.weak ? "تشابه في النطق بس — اتأكد قبل ما تضيفه" : "اقتراح — اضغط للإضافة"}>{k.weak ? "؟" : "＋"} {chip(k, k.weak ? "text-amber-700/70" : "text-emerald-700/70")}</button>)}
        <button type="button" onClick={() => { setAdding(adding === c.client_id ? null : c.client_id); setFind(""); }} className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--navy)]">{adding === c.client_id ? "إغلاق" : "＋ فرع"}</button>
      </div>
      {adding === c.client_id && <div className="mt-2 rounded-xl border border-[var(--border)] p-2">
        <input autoFocus value={find} onChange={e => setFind(e.target.value)} placeholder="اكتب اسم الفرع…" className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm" />
        <div className="mt-1.5 max-h-48 overflow-auto">{d.clinics.filter(k => k.client_id !== c.client_id && (!find.trim() || k.name.toLowerCase().includes(find.trim().toLowerCase()))).slice(0, 30).map(k =>
          <button key={k.id} type="button" onClick={() => void toggle(c, k, true)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-right text-sm hover:bg-[var(--sky-light)]">
            <span className="truncate" dir="auto">{k.name} <span className="text-[11px] text-[var(--muted)]">{k.city} · {k.docs} طبيب</span></span>
            {k.client_id && <span className="shrink-0 text-[10px] text-amber-700">مربوط بعميل تاني</span>}</button>)}</div>
      </div>}
    </li>)}</ul>
  </section>;
}
