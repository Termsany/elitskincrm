"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";

type Data = {
  kpi: { n: number; net: number; tax: number; total: number; paid: number; unpaid: number; refund: number; clients: number };
  monthly: Array<{ m: string; net: number; paid: number; n: number }>;
  products: Array<{ item: string; qty: number; net: number; n: number; avg_price: number | null }>;
  clients: Array<{ client_name: string; city: string; net: number; unpaid: number | null; n: number; last: string }>;
  branches: Array<{ branch: string; net: number; n: number }>;
  aging: Array<{ bucket: string; v: number; n: number }>;
  invoices: Array<{ id: string; no: string; date: string; client_name: string; branch: string; payment_status: number; net: number; total: number; unpaid: number; overdue_days: number }>;
  sync: { started_at: string | null; finished_at: string | null; ok: boolean | null; message: string; invoices: number };
};
const sar = (n: number | null | undefined) => `${Math.round(n || 0).toLocaleString("en-US")} ر.س`;
const short = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n));
const tz = "Asia/Riyadh";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const PAY: Record<number, [string, string]> = { 0: ["غير مدفوعة", "bg-red-50 text-red-700 ring-red-200"], 1: ["مدفوعة جزئياً", "bg-amber-50 text-amber-800 ring-amber-200"], 2: ["مدفوعة", "bg-emerald-50 text-emerald-700 ring-emerald-200"], 3: ["مرتجعة", "bg-slate-100 text-slate-600 ring-slate-200"] };
const AGING: Array<[string, string, string]> = [["current", "لم تستحق بعد", "#3b90e8"], ["1-30", "متأخرة 1–30 يوم", "#e99608"], ["31-60", "31–60 يوم", "#e16201"], ["61-90", "61–90 يوم", "#c92f36"], ["90+", "أكثر من 90 يوم", "#7f151c"]];
const PRESETS: Array<[string, () => [string, string]]> = [
  ["الشهر ده", () => [`${today().slice(0, 7)}-01`, today()]],
  ["آخر 3 شهور", () => { const d = new Date(); d.setMonth(d.getMonth() - 2); return [`${new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d).slice(0, 7)}-01`, today()]; }],
  ["السنة دي", () => [`${today().slice(0, 4)}-01-01`, today()]],
  ["آخر 12 شهر", () => { const d = new Date(); d.setMonth(d.getMonth() - 11); return [`${new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d).slice(0, 7)}-01`, today()]; }],
  ["الكل", () => ["2020-01-01", today()]],
];

export default function DaftraSales({ subdomain }: { subdomain: string }) {
  const toast = useToast();
  const [range, setRange] = useState<[string, string]>(PRESETS[3][1]());
  const [preset, setPreset] = useState(3);
  const [branch, setBranch] = useState("");
  const [d, setD] = useState<Data | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [q, setQ] = useState(""); const [onlyDue, setOnlyDue] = useState(false);
  const load = useCallback(async () => {
    const p = new URLSearchParams({ from: range[0], to: range[1], ...(branch ? { branch } : {}) });
    const j = await fetch(`/api/admin/daftra/summary?${p}`).then(r => r.json()).catch(() => null);
    if (j?.kpi) setD(j); else toast(j?.error || "تعذر تحميل البيانات", "error");
  }, [range, branch, toast]);
  useEffect(() => { void load(); }, [load]);
  // while a background sync runs, refresh until it finishes
  useEffect(() => { if (!d?.sync?.started_at) return; const running = !d.sync.finished_at || new Date(d.sync.started_at) > new Date(d.sync.finished_at); if (!running) return; const t = setTimeout(() => void load(), 5000); return () => clearTimeout(t); }, [d, load]);
  async function sync() {
    setSyncing(true);
    const r = await fetch("/api/admin/daftra/sync", { method: "POST" }); const j = await r.json().catch(() => null); setSyncing(false);
    if (!r.ok) toast(j?.error || "تعذرت المزامنة", "error"); else { toast(`تمت المزامنة: ${j.invoices} فاتورة (${j.updated} محدّثة)`, "success"); await load(); }
  }
  const months = useMemo(() => {
    if (!d) return [];
    const out: Array<{ k: string; net: number; paid: number; n: number }> = [];
    const [fy, fm] = range[0].split("-").map(Number), [ty, tm] = range[1].split("-").map(Number);
    const startY = range[0] === "2020-01-01" && d.monthly[0] ? Number(d.monthly[0].m.slice(0, 4)) : fy, startM = range[0] === "2020-01-01" && d.monthly[0] ? Number(d.monthly[0].m.slice(5)) : fm;
    for (let y = startY, m = startM; y < ty || (y === ty && m <= tm); m === 12 ? (y++, m = 1) : m++) { const k = `${y}-${String(m).padStart(2, "0")}`; const x = d.monthly.find(r => r.m === k); out.push({ k, net: x?.net || 0, paid: x?.paid || 0, n: x?.n || 0 }); if (out.length > 60) break; }
    return out;
  }, [d, range]);
  const max = Math.max(1, ...months.map(m => m.net));
  const agingTotal = (d?.aging || []).reduce((s, a) => s + a.v, 0);
  const prodTotal = (d?.products || []).reduce((s, p) => s + p.net, 0);
  const invoices = (d?.invoices || []).filter(i => (!onlyDue || (i.unpaid > 0 && i.payment_status !== 3)) && (!q || `${i.no} ${i.client_name}`.toLowerCase().includes(q.toLowerCase())));
  const lastSync = d?.sync?.finished_at ? new Date(d.sync.finished_at).toLocaleString("ar-EG-u-nu-latn", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }) : "—";
  const collectRate = d && d.kpi.total ? Math.round(d.kpi.paid / (d.kpi.total - d.kpi.refund || 1) * 100) : 0;

  return <div className="mt-5 space-y-4">
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-white p-3">
      <div className="flex flex-wrap gap-1 rounded-xl bg-[var(--bg)] p-1">{PRESETS.map(([l, f], i) => <button key={l} type="button" onClick={() => { setPreset(i); setRange(f()); }} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${preset === i ? "bg-white text-[var(--navy)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--navy)]"}`}>{l}</button>)}</div>
      <input type="date" value={range[0]} onChange={e => { setPreset(-1); setRange([e.target.value, range[1]]); }} className="rounded-xl border border-[var(--border)] px-2.5 py-1.5 text-xs" />
      <input type="date" value={range[1]} onChange={e => { setPreset(-1); setRange([range[0], e.target.value]); }} className="rounded-xl border border-[var(--border)] px-2.5 py-1.5 text-xs" />
      {!!d?.branches.length && <select value={branch} onChange={e => setBranch(e.target.value)} className="rounded-xl border border-[var(--border)] px-2.5 py-1.5 text-xs"><option value="">كل الفروع</option>{d.branches.filter(b => b.branch !== "—").map(b => <option key={b.branch} value={b.branch}>{b.branch}</option>)}</select>}
      <div className="mr-auto flex items-center gap-2 text-[11px] text-[var(--muted)]"><span className={`h-2 w-2 rounded-full ${d?.sync?.ok === false ? "bg-red-500" : "bg-emerald-500"}`} />آخر مزامنة: {lastSync}
        <button type="button" disabled={syncing} onClick={() => void sync()} className="flex items-center gap-1.5 rounded-xl bg-[var(--navy)] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"><span className={syncing ? "animate-spin" : ""}><Icon name="repeat" size={14} /></span>{syncing ? "جارٍ المزامنة…" : "مزامنة الآن"}</button></div>
    </div>
    {d?.sync?.ok === false && <div className="rounded-xl bg-red-50 p-3 text-xs text-red-800 ring-1 ring-red-200">آخر مزامنة فشلت: {d.sync.message}</div>}

    {!d ? <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white" />)}</div> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([["صافي المبيعات", sar(d.kpi.net), "sales", "#1aa865", `${d.kpi.n} فاتورة · ${d.kpi.clients} عميل`],
           ["المحصّل", sar(d.kpi.paid), "check", "#15646a", `نسبة التحصيل ${collectRate}%`],
           ["المستحق على العملاء", sar(d.kpi.unpaid), "time", "#e16201", "شامل الضريبة"],
           ["ضريبة القيمة المضافة", sar(d.kpi.tax), "file", "#3b90e8", d.kpi.refund ? `مرتجعات ${sar(d.kpi.refund)}` : `متوسط الفاتورة ${sar(d.kpi.n ? d.kpi.net / d.kpi.n : 0)}`]] as const).map(([l, v, i, c, s]) =>
          <div key={l} className="rounded-2xl border border-[var(--border)] bg-white p-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-[var(--muted)]">{l}</span><span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ color: c, background: `${c}1f` }}><Icon name={i} size={18} /></span></div><div className="mt-2 text-xl font-extrabold text-[var(--navy)] sm:text-2xl">{v}</div><div className="mt-0.5 text-[11px] text-[var(--muted)]">{s}</div></div>)}
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <div className="flex items-center justify-between"><h3 className="font-extrabold text-[var(--navy)]">صافي المبيعات شهر بشهر</h3><div className="flex gap-3 text-[11px] text-[var(--muted)]"><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-[var(--sky)]" />مبيعات</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-[var(--navy)]" />تحصيل</span></div></div>
        <div className="h-6 text-xs text-[var(--muted)]">{hover !== null && months[hover] ? <span><b className="text-[var(--navy)]">{MONTHS[Number(months[hover].k.slice(5)) - 1]} {months[hover].k.slice(0, 4)}</b> · {sar(months[hover].net)} · {months[hover].n} فاتورة · محصّل {sar(months[hover].paid)}</span> : "مرّر على أي شهر للتفاصيل"}</div>
        <div className="flex h-52 items-end gap-1 sm:gap-2">{months.map((m, i) => <div key={m.k} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className={`text-[9px] font-bold ${hover === i ? "text-[var(--navy)]" : "text-transparent sm:text-[var(--muted)]"}`}>{m.net ? short(m.net) : ""}</span>
          <div className="relative flex h-40 w-full items-end justify-center"><div className={`w-full max-w-8 rounded-t-md bg-[var(--sky)] transition-all duration-700 ${hover === i ? "opacity-100" : "opacity-85"}`} style={{ height: `${Math.max(m.net ? 2 : 0, m.net / max * 100)}%` }} /><div className="absolute bottom-0 w-full max-w-8 rounded-t-md bg-[var(--navy)]/80" style={{ height: `${Math.min(m.paid, m.net) / max * 100}%` }} /></div>
          <span className={`truncate text-[9.5px] ${hover === i ? "font-bold text-[var(--navy)]" : "text-[var(--muted)]"}`}>{MONTHS[Number(m.k.slice(5)) - 1].slice(0, 3)}</span></div>)}</div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-white p-4"><h3 className="mb-3 font-extrabold text-[var(--navy)]">المبيعات حسب المنتج</h3>
          <div className="space-y-2.5">{d.products.map(p => <div key={p.item}><div className="mb-1 flex justify-between gap-2 text-xs"><span className="min-w-0 truncate font-bold" dir="auto">{p.item}</span><span className="shrink-0 text-[var(--muted)]">{p.qty.toLocaleString("en-US")} وحدة · <b className="text-[var(--ink)]">{sar(p.net)}</b></span></div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full bg-[var(--sky)]" style={{ width: `${p.net / (prodTotal || 1) * 100}%` }} /></div>
            {p.avg_price ? <div className="mt-0.5 text-[10px] text-[var(--muted)]">متوسط سعر البيع الفعلي {sar(p.avg_price)} · {Math.round(p.net / (prodTotal || 1) * 100)}% من المبيعات</div> : null}</div>)}
            {!d.products.length && <div className="text-sm text-[var(--muted)]">لا توجد مبيعات في الفترة</div>}</div></div>
        <div className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-[var(--border)] bg-white p-4"><div className="mb-3 flex items-baseline justify-between"><h3 className="font-extrabold text-[var(--navy)]">أعمار المستحقات</h3><b className="text-sm">{sar(agingTotal)}</b></div>
            <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-[var(--bg)]">{AGING.map(([k, , c]) => { const a = d.aging.find(x => x.bucket === k); return a ? <div key={k} style={{ width: `${a.v / (agingTotal || 1) * 100}%`, background: c }} title={sar(a.v)} /> : null; })}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">{AGING.map(([k, l, c]) => { const a = d.aging.find(x => x.bucket === k); return <div key={k} className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</span><b>{sar(a?.v)}{a ? <span className="font-normal text-[var(--muted)]"> · {a.n}</span> : null}</b></div>; })}</div></div>
          {d.branches.length > 1 && <div className="rounded-2xl border border-[var(--border)] bg-white p-4"><h3 className="mb-2 font-extrabold text-[var(--navy)]">حسب الفرع</h3>{d.branches.map(b => <div key={b.branch} className="flex justify-between border-t border-[var(--border)] py-2 text-sm first:border-0"><span className="capitalize">{b.branch}</span><span><b>{sar(b.net)}</b> <span className="text-[11px] text-[var(--muted)]">· {b.n} فاتورة</span></span></div>)}</div>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white"><div className="p-4 pb-2 font-extrabold text-[var(--navy)]">أكبر العملاء</div>
        <table className="w-full min-w-[620px] text-sm"><thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="p-3 text-right">العميل</th><th className="p-3">المدينة</th><th className="p-3">الفواتير</th><th className="p-3">صافي المبيعات</th><th className="p-3">المستحق</th><th className="p-3">آخر فاتورة</th></tr></thead>
          <tbody className="divide-y divide-[var(--border)]">{d.clients.map(c => <tr key={c.client_name}><td className="max-w-72 truncate p-3 font-bold" dir="auto">{c.client_name}</td><td className="p-3 text-center capitalize text-[var(--muted)]">{c.city}</td><td className="p-3 text-center">{c.n}</td><td className="p-3 text-center font-bold">{sar(c.net)}</td><td className={`p-3 text-center ${c.unpaid ? "font-bold text-orange-700" : "text-[var(--muted)]"}`}>{c.unpaid ? sar(c.unpaid) : "—"}</td><td className="p-3 text-center text-[var(--muted)]">{c.last}</td></tr>)}</tbody></table></div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
        <div className="flex flex-wrap items-center gap-2 p-4 pb-2"><b className="text-[var(--navy)]">الفواتير</b><span className="text-xs text-[var(--muted)]">{invoices.length}</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث برقم الفاتورة أو العميل" className="mr-auto rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs" />
          <label className="flex items-center gap-1.5 text-xs font-bold"><input type="checkbox" checked={onlyDue} onChange={e => setOnlyDue(e.target.checked)} className="accent-[var(--sky)]" />المستحق فقط</label></div>
        <table className="w-full min-w-[700px] text-sm"><thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="p-3 text-right">رقم</th><th className="p-3">التاريخ</th><th className="p-3 text-right">العميل</th><th className="p-3">الصافي</th><th className="p-3">الإجمالي</th><th className="p-3">المستحق</th><th className="p-3">الحالة</th></tr></thead>
          <tbody className="divide-y divide-[var(--border)]">{invoices.map(i => { const [l, c] = PAY[i.payment_status] || PAY[0]; return <tr key={i.id} className="hover:bg-[var(--bg)]">
            <td className="p-3"><a href={`https://${subdomain}.daftra.com/owner/invoices/view/${i.id}`} target="_blank" rel="noreferrer" className="font-bold text-[var(--gold)] hover:underline" dir="ltr">{i.no}</a></td>
            <td className="p-3 text-center text-[var(--muted)]">{i.date}</td><td className="max-w-64 truncate p-3" dir="auto">{i.client_name}</td>
            <td className="p-3 text-center font-bold">{sar(i.net)}</td><td className="p-3 text-center">{sar(i.total)}</td>
            <td className="p-3 text-center">{i.unpaid > 0 && i.payment_status !== 3 ? <span className={i.overdue_days > 0 ? "font-bold text-red-700" : ""}>{sar(i.unpaid)}{i.overdue_days > 0 && <span className="block text-[10px] font-normal">متأخرة {i.overdue_days} يوم</span>}</span> : "—"}</td>
            <td className="p-3 text-center"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${c}`}>{l}</span></td></tr>; })}</tbody></table>
      </div>
    </>}
  </div>;
}
