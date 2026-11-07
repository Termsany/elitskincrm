"use client";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

type VS = {
  clinics: Array<{ clinic_id: string; clinic: string; city: string | null; visits: number; doctors: number; last_visit: string | null; sales: number; invoices: number; last_invoice: string | null; flag: string }>;
  summary: { effort: number; neglected: number; neglectedSales: number; unlinked: number };
  products: Array<{ product_id: string; product: string; presented: number; clinics: number; converted: number; sales_after: number; rate: number | null }>;
  samples: Array<{ product_id: string; product: string; given: number; units: number; clinics: number; bought: number; rate: number | null }>;
};
type PV = { products: Array<{ product_id: string; product: string; n: number; summary: string; reactions: Record<string, number>; objections: Array<{ key: string; label: string; n: number }>; positives: Array<{ key: string; label: string; n: number }>; quotes: string[] }>; ai: boolean };
const k = (n: number) => Math.round(n).toLocaleString("en-US");
const dm = (d: string | null) => d ? `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}` : "—";
const FLAG: Record<string, [string, string]> = { effort: ["بتتزار ومش بتشتري", "bg-amber-50 text-amber-800"], neglected: ["بتشتري ومحدش زارها", "bg-red-50 text-red-700"], ok: ["زيارات وبيع", "bg-emerald-50 text-emerald-700"], unlinked: ["مش مربوطة بدفترة", "bg-slate-100 text-slate-600"], none: ["—", "bg-slate-50 text-slate-500"] };
const Bar = ({ v, c }: { v: number | null; c: string }) => <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, v ?? 0)}%`, background: c }} /></div>;

/** Reports page: visits vs Daftra sales, and what doctors say about each product. */
export default function InsightPanels({ from, to, repId }: { from: string; to: string; repId: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<"vs" | "voice">("vs"); const [vs, setVs] = useState<VS | null>(null); const [pv, setPv] = useState<PV | null>(null);
  const [filter, setFilter] = useState(""); const [ai, setAi] = useState<Record<string, string>>({}); const [busy, setBusy] = useState("");
  useEffect(() => { setVs(null); const q = new URLSearchParams({ from, to, ...(repId ? { repId } : {}) }); void fetch(`/api/admin/reports/visit-sales?${q}`).then(r => r.ok ? r.json() : null).then(setVs).catch(() => null); }, [from, to, repId]);
  useEffect(() => { if (tab !== "voice") return; setPv(null); void fetch(`/api/admin/reports/product-voice?from=${from}&to=${to}`).then(r => r.ok ? r.json() : null).then(setPv).catch(() => null); }, [tab, from, to]);
  async function summarize(id: string) {
    setBusy(id); const r = await fetch("/api/admin/reports/product-voice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ product_id: id, from, to }) });
    const j = await r.json().catch(() => null); setBusy(""); if (j?.summary) setAi(a => ({ ...a, [id]: j.summary })); else toast(j?.error || "تعذر", "error");
  }
  const rows = (vs?.clinics || []).filter(c => !filter || c.flag === filter);
  return <section className="es-card-in overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
    <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] p-3">{([["vs", "📈 الزيارات × المبيعات"], ["voice", "🗣️ رأي الأطباء في المنتجات"]] as const).map(([t, l]) =>
      <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${tab === t ? "bg-[var(--navy)] text-white shadow" : "bg-[var(--bg)] text-[var(--muted)]"}`}>{l}</button>)}</div>

    {tab === "vs" && (!vs ? <div className="es-shimmer m-4 h-40 rounded-xl" /> : <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{([["effort", "بتتزار ومش بتشتري", vs.summary.effort, "3 زيارات أو أكتر من غير ولا فاتورة"], ["neglected", "بتشتري ومحدش زارها", vs.summary.neglected, `${k(vs.summary.neglectedSales)} ر.س مبيعات من غير زيارات`], ["ok", "زيارات وبيع", vs.clinics.filter(c => c.flag === "ok").length, "المجهود جايب نتيجة"], ["unlinked", "مش مربوطة بدفترة", vs.summary.unlinked, "اتزارت ومش عارفين مشترياتها"]] as const).map(([f, l, n, sub]) =>
        <button key={f} type="button" onClick={() => setFilter(filter === f ? "" : f)} className={`rounded-xl border p-3 text-right transition hover:-translate-y-0.5 ${filter === f ? "border-[var(--navy)] ring-2 ring-[var(--navy)]/15" : "border-[var(--border)]"}`}>
          <div className={`inline-block rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${FLAG[f][1]}`}>{l}</div><div className="mt-1 text-2xl font-extrabold text-[var(--navy)]">{n}</div><div className="text-[10.5px] text-[var(--muted)]">{sub}</div></button>)}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="p-2 text-right">العيادة</th><th className="p-2">زيارات</th><th className="p-2">أطباء</th><th className="p-2">آخر زيارة</th><th className="p-2">مبيعات الفترة</th><th className="p-2">آخر فاتورة</th><th className="p-2">الحكم</th></tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{rows.slice(0, 40).map(c => <tr key={c.clinic_id}><td className="p-2 font-bold">{c.clinic}<span className="block text-[10.5px] font-normal text-[var(--muted)]">{c.city || ""}</span></td>
          <td className="p-2 text-center">{c.visits || "—"}</td><td className="p-2 text-center">{c.doctors || "—"}</td><td className="p-2 text-center text-xs">{dm(c.last_visit)}</td>
          <td className="p-2 text-center font-bold">{c.sales ? k(c.sales) : "—"}</td><td className="p-2 text-center text-xs">{dm(c.last_invoice)}</td>
          <td className="p-2 text-center"><span className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${FLAG[c.flag][1]}`}>{FLAG[c.flag][0]}</span></td></tr>)}
          {!rows.length && <tr><td colSpan={7} className="p-6 text-center text-[var(--muted)]">مفيش عيادات في الفترة دي</td></tr>}</tbody></table></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div><h3 className="mb-2 text-sm font-extrabold text-[var(--navy)]">العرض اتحوّل لطلب؟ <span className="text-[11px] font-normal text-[var(--muted)]">(نفس العيادة اشترت المنتج خلال 30 يوم من شرحه)</span></h3>
          <ul className="space-y-2">{vs.products.map(p => <li key={p.product_id} className="rounded-xl bg-[var(--bg)] p-2.5"><div className="flex justify-between text-xs"><b>{p.product}</b><span>{p.converted} من {p.presented} شرح · <b className="text-emerald-700">{p.rate ?? 0}%</b>{p.sales_after ? ` · ${k(p.sales_after)} ر.س` : ""}</span></div><Bar v={p.rate} c="#1aa865" /></li>)}
            {!vs.products.length && <li className="text-center text-xs text-[var(--muted)]">مفيش شرح منتجات في الفترة</li>}</ul></div>
        <div><h3 className="mb-2 text-sm font-extrabold text-[var(--navy)]">العينات جابت طلبات؟ <span className="text-[11px] font-normal text-[var(--muted)]">(اشترت المنتج خلال 60 يوم)</span></h3>
          <ul className="space-y-2">{vs.samples.map(s => <li key={s.product_id} className="rounded-xl bg-[var(--bg)] p-2.5"><div className="flex justify-between text-xs"><b>{s.product}</b><span>{s.bought} من {s.given} مرة ({s.units} عينة) · <b className={(s.rate ?? 0) < 20 ? "text-red-700" : "text-emerald-700"}>{s.rate ?? 0}%</b></span></div><Bar v={s.rate} c={(s.rate ?? 0) < 20 ? "#ef4b4e" : "#1aa865"} /></li>)}
            {!vs.samples.length && <li className="text-center text-xs text-[var(--muted)]">مفيش عينات في الفترة</li>}</ul></div>
      </div>
    </div>)}

    {tab === "voice" && (!pv ? <div className="es-shimmer m-4 h-40 rounded-xl" /> : <div className="grid gap-3 p-4 lg:grid-cols-2">
      {pv.products.map((p, i) => { const tot = p.n || 1; return <article key={p.product_id} style={{ animationDelay: `${i * 60}ms` }} className="es-card-in rounded-2xl border border-[var(--border)] p-4">
        <div className="flex items-center justify-between gap-2"><b className="text-[var(--navy)]">{p.product}</b><span className="text-[11px] text-[var(--muted)]">{p.n} شرح</span></div>
        <div className="mt-1 text-[12px] font-bold text-[var(--ink-soft)]">{p.summary}</div>
        <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-[var(--bg)]"><i style={{ width: `${(p.reactions.interested || 0) / tot * 100}%` }} className="bg-emerald-600" /><i style={{ width: `${(p.reactions.neutral || 0) / tot * 100}%` }} className="bg-slate-300" /><i style={{ width: `${(p.reactions.not_interested || 0) / tot * 100}%` }} className="bg-red-500" /></div>
        {p.objections.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{p.objections.map(o => <span key={o.key} className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">{o.label} {o.n}</span>)}</div>}
        {p.positives.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{p.positives.map(o => <span key={o.key} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">{o.label} {o.n}</span>)}</div>}
        {p.quotes.length > 0 && <ul className="mt-2 space-y-1">{p.quotes.map((q, j) => <li key={j} className="rounded-lg bg-[var(--bg)] px-2 py-1 text-[11.5px] text-[var(--ink-soft)]" dir="auto">«{q}»</li>)}</ul>}
        {ai[p.product_id] ? <div className="mt-2 whitespace-pre-wrap rounded-xl bg-[var(--sky-light)] p-2.5 text-[12px] leading-6">{ai[p.product_id]}</div>
          : pv.ai && <button type="button" disabled={busy === p.product_id} onClick={() => void summarize(p.product_id)} className="mt-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--navy)]">{busy === p.product_id ? "بلخّص…" : "✨ لخّص بالذكاء الاصطناعي"}</button>}
      </article>; })}
      {!pv.products.length && <div className="col-span-full p-6 text-center text-sm text-[var(--muted)]">مفيش شرح منتجات في الفترة</div>}
    </div>)}
  </section>;
}
