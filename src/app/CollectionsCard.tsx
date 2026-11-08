"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { riyadhToday } from "@/lib/fmt";

type Inv = { id: number; no: string; date: string; due: string; unpaid: number; days: number };
type Fu = { id: string; result: string; promise_date: string | null; amount: number | null; note: string; created_at: string; rep_name: string };
type Client = { client_id: number; name: string; clinic_name: string | null; unpaid: number; overdue: number; oldest: number; invoices: Inv[]; followups: Fu[] };
type Data = { clients: Client[]; total: number; overdue: number; over60: number };
const RES: Array<[string, string, string]> = [["contacted", "اتواصلت", "📞"], ["promised", "وعد بالدفع", "🤝"], ["partial", "دفع جزء", "💵"], ["paid", "دفع", "✅"], ["no_answer", "ما ردش", "📵"], ["disputed", "معترض", "⚠️"]];
const RL = Object.fromEntries(RES.map(([k, l, e]) => [k, `${e} ${l}`]));
const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} ر.س`;
const tone = (d: number) => d > 90 ? "bg-red-600 text-white" : d > 60 ? "bg-red-50 text-red-700 ring-1 ring-red-200" : d > 0 ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
const today = () => riyadhToday();

/** Rep home: the customer invoices this rep should collect (from Daftra), with one-tap follow-up logging. */
export default function CollectionsCard() {
  const toast = useToast();
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState<{ result: string; promise_date: string; amount: string; note: string }>({ result: "", promise_date: "", amount: "", note: "" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch("/api/collections", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => j && setD(j)).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  if (!d || !d.clients.length) return null;
  async function save(cid: number) {
    if (!form.result) { toast("اختار نتيجة المتابعة", "error"); return; }
    setBusy(true);
    const r = await fetch("/api/collections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: cid, ...form, amount: form.amount || null, promise_date: form.promise_date || null }) });
    const j = await r.json().catch(() => null); setBusy(false);
    if (!r.ok) { toast(j?.error || "تعذر الحفظ", "error"); return; }
    toast("اتسجلت متابعة التحصيل ✓", "success"); setForm({ result: "", promise_date: "", amount: "", note: "" }); setOpen(null); void load();
  }
  return (
    <section id="collections" className="dz-in scroll-mt-24 overflow-hidden rounded-[28px] border border-[var(--border)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
        <div className="flex items-center gap-3"><span className="dz-ico dz-wiggle !h-11 !w-11" style={{ color: "#e16201", background: "linear-gradient(140deg,#e162012e,#e162010f)" }}><Icon name="wallet" size={21} /></span>
          <div><h2 className="text-lg font-extrabold text-[var(--navy)]">التحصيل من عملائك</h2><div className="text-[11px] text-[var(--muted)]">فواتير دفترة المفتوحة لعملائك — سجّل كل متابعة عشان المدير يشوفها</div></div></div>
        <div className="flex gap-2 text-center">
          <div className="rounded-2xl bg-[var(--bg)] px-3 py-2"><div className="text-[10px] font-bold text-[var(--muted)]">إجمالي</div><div className="text-sm font-extrabold text-[var(--navy)]">{money(d.total)}</div></div>
          <div className="rounded-2xl bg-amber-50 px-3 py-2"><div className="text-[10px] font-bold text-amber-800">متأخر</div><div className="text-sm font-extrabold text-amber-800">{money(d.overdue)}</div></div>
          {d.over60 > 0 && <div className="rounded-2xl bg-red-50 px-3 py-2"><div className="text-[10px] font-bold text-red-700">+60 يوم</div><div className="text-sm font-extrabold text-red-700">{money(d.over60)}</div></div>}
        </div>
      </div>
      <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">{d.clients.map(c => { const last = c.followups[0]; const isOpen = open === c.client_id; return (
        <div key={c.client_id} className={isOpen ? "bg-[var(--sky-light)]/50" : ""}>
          <button type="button" onClick={() => setOpen(isOpen ? null : c.client_id)} className="flex w-full items-center gap-3 px-5 py-3 text-right transition hover:bg-[var(--bg)]">
            <span className={`shrink-0 rounded-xl px-2.5 py-1 text-[11px] font-extrabold ${tone(c.oldest)}`}>{c.oldest > 0 ? `متأخر ${c.oldest} يوم` : "في الميعاد"}</span>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold" dir="auto">{c.name}</div>
              <div className="truncate text-[11px] text-[var(--muted)]">{c.invoices.length} فاتورة{c.clinic_name ? ` · ${c.clinic_name}` : ""}{last ? ` · آخر متابعة: ${RL[last.result]}${last.promise_date ? ` (${last.promise_date})` : ""}` : " · لسه ما اتابعتش"}</div></div>
            <div className="shrink-0 text-left"><div className="text-sm font-extrabold text-[var(--navy)]">{money(c.unpaid)}</div>{c.overdue > 0 && <div className="text-[10.5px] font-bold text-red-600">متأخر {money(c.overdue)}</div>}</div>
            <span className={`text-[var(--muted)] transition-transform ${isOpen ? "rotate-90" : ""}`}>‹</span>
          </button>
          {isOpen && <div className="dz-in space-y-3 px-5 pb-4">
            <div className="grid gap-1.5 sm:grid-cols-2">{c.invoices.map(i => <div key={i.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-[var(--border)]"><span className="font-bold" dir="ltr">#{i.no}</span><span className="text-[var(--muted)]">استحقاق {i.due}</span><span className={i.days > 0 ? "font-bold text-red-700" : "text-emerald-700"}>{i.days > 0 ? `+${i.days} يوم` : "في الميعاد"}</span><b>{money(i.unpaid)}</b></div>)}</div>
            <div className="rounded-2xl bg-white p-3 ring-1 ring-[var(--border)]">
              <div className="mb-2 text-xs font-bold text-[var(--muted)]">سجّل متابعة</div>
              <div className="flex flex-wrap gap-1.5">{RES.map(([k, l, e]) => <button key={k} type="button" onClick={() => setForm(f => ({ ...f, result: k }))} className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition ${form.result === k ? "bg-[var(--navy)] text-white ring-[var(--navy)]" : "bg-white text-[var(--ink)] ring-[var(--border)] hover:bg-[var(--bg)]"}`}>{e} {l}</button>)}</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {(form.result === "promised" || form.result === "partial") && <label className="text-[11px] font-bold text-[var(--muted)]">{form.result === "promised" ? "ميعاد الدفع" : "ميعاد الباقي"}<input type="date" min={today()} value={form.promise_date} onChange={e => setForm(f => ({ ...f, promise_date: e.target.value }))} className="mt-1 w-full rounded-xl border border-[var(--border)] px-2 py-1.5 text-sm" /></label>}
                {(form.result === "partial" || form.result === "paid" || form.result === "promised") && <label className="text-[11px] font-bold text-[var(--muted)]">المبلغ (اختياري)<input type="number" min={0} inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="mt-1 w-full rounded-xl border border-[var(--border)] px-2 py-1.5 text-sm" /></label>}
                <label className="text-[11px] font-bold text-[var(--muted)] sm:col-span-1">ملاحظة<input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="مثلاً: كلمت المحاسب…" className="mt-1 w-full rounded-xl border border-[var(--border)] px-2 py-1.5 text-sm" /></label>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[10.5px] text-[var(--muted)]">المتابعة بتتسجل في الـ CRM بس — الدفع الفعلي بيتسجل في دفترة</span><button type="button" disabled={busy} onClick={() => void save(c.client_id)} className="rounded-xl bg-[var(--navy)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">حفظ المتابعة</button></div>
            </div>
            {c.followups.length > 0 && <div className="space-y-1">{c.followups.map(f => <div key={f.id} className="flex flex-wrap gap-2 text-[11px] text-[var(--muted)]"><b className="text-[var(--ink)]">{RL[f.result]}</b>{f.promise_date && <span>ميعاد {f.promise_date}</span>}{f.amount ? <span>{money(f.amount)}</span> : null}{f.note && <span>«{f.note}»</span>}<span>· {f.rep_name} · {new Date(f.created_at).toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "short" })}</span></div>)}</div>}
          </div>}
        </div>); })}</div>
    </section>
  );
}
