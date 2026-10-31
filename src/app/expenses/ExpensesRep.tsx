"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { type Cat, type Exp, sar, StatusPill, CatIcon, Receipts, Flags, tone } from "./shared";

type Doc = { id: string; name: string; clinic_name: string | null; city: string | null };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const monthKey = (d: string) => d.slice(0, 7);
const monthLabel = (k: string) => new Date(`${k}-15T12:00:00Z`).toLocaleDateString("ar-EG-u-nu-latn", { month: "long", year: "numeric" });
type Form = { id?: string; category_id: string; amount: string; expense_date: string; merchant: string; description: string; tax_invoice: boolean; doctor_id: string; doctorQ: string; files: File[] };
const blank = (): Form => ({ category_id: "", amount: "", expense_date: today(), merchant: "", description: "", tax_invoice: false, doctor_id: "", doctorQ: "", files: [] });

export default function ExpensesRep({ doctors }: { doctors: Doc[] }) {
  const toast = useToast();
  const [items, setItems] = useState<Exp[] | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    const j = await fetch("/api/expenses").then(r => r.json()).catch(() => null);
    if (j?.expenses) { setItems(j.expenses); setCats(j.categories); } else setItems([]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const cur = today().slice(0, 7);
  const month = useMemo(() => (items || []).filter(e => monthKey(e.expense_date) === cur), [items, cur]);
  const sum = (s: Exp["status"][]) => month.filter(e => s.includes(e.status)).reduce((a, e) => a + e.amount, 0);
  const caps = useMemo(() => cats.filter(c => c.monthly_cap).map(c => ({ c, used: month.filter(e => e.category_id === c.id && e.status !== "rejected").reduce((a, e) => a + e.amount, 0) })).filter(x => x.used > 0), [cats, month]);
  const groups = useMemo(() => { const g = new Map<string, Exp[]>(); for (const e of items || []) { const k = monthKey(e.expense_date); g.set(k, [...(g.get(k) || []), e]); } return [...g.entries()]; }, [items]);

  const cat = cats.find(c => c.id === form?.category_id);
  const amountNum = Number(form?.amount || 0);
  const vat = form?.tax_invoice && amountNum > 0 ? Math.round(amountNum * 15 / 115 * 100) / 100 : 0;
  const needsReceipt = !!cat && amountNum > cat.receipt_required_above;
  const docMatches = useMemo(() => { const q = (form?.doctorQ || "").trim().toLowerCase(); if (!q || form?.doctor_id) return []; return doctors.filter(d => `${d.name} ${d.clinic_name || ""}`.toLowerCase().includes(q)).slice(0, 6); }, [form?.doctorQ, form?.doctor_id, doctors]);

  async function save() {
    if (!form) return;
    if (needsReceipt && !form.files.length && !form.id) { toast("أرفق صورة الإيصال — مطلوب لهذا المبلغ", "error"); return; }
    setBusy(true);
    try {
      const body = { category_id: form.category_id, amount: Number(form.amount), expense_date: form.expense_date, merchant: form.merchant, description: form.description, tax_invoice: form.tax_invoice, doctor_id: cat?.allows_doctor && form.doctor_id ? form.doctor_id : null };
      const r = await fetch(form.id ? `/api/expenses/${form.id}` : "/api/expenses", { method: form.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { toast(j?.error || "تعذر الحفظ", "error"); return; }
      const id = form.id || j.id;
      let failed = 0;
      for (const f of form.files) { const fd = new FormData(); fd.append("file", f); const u = await fetch(`/api/expenses/${id}/receipts`, { method: "POST", body: fd }); if (!u.ok) failed++; }
      toast(failed ? `اتسجل المصروف، لكن ${failed} إيصال ما اترفع` : form.id ? "اتعدّل المصروف" : "اتسجل المصروف وراح للاعتماد", failed ? "error" : "success");
      setForm(null); await load();
    } finally { setBusy(false); }
  }
  async function remove(e: Exp) {
    if (!window.confirm(`حذف مصروف ${sar(e.amount)}؟`)) return;
    const r = await fetch(`/api/expenses/${e.id}`, { method: "DELETE" }); const j = await r.json().catch(() => null);
    if (!r.ok) toast(j?.error || "تعذر الحذف", "error"); else { toast("اتحذف", "success"); setOpen(null); await load(); }
  }
  const edit = (e: Exp) => setForm({ id: e.id, category_id: e.category_id, amount: String(e.amount), expense_date: e.expense_date, merchant: e.merchant, description: e.description, tax_invoice: e.vat_amount > 0, doctor_id: e.doctor_id || "", doctorQ: e.doctor_name || "", files: [] });

  return <div className="mt-5 space-y-4">
    <section className="grid grid-cols-3 gap-2.5">
      {([["الشهر ده", sum(["pending", "approved", "reimbursed"]), "text-[var(--navy)]"], ["بانتظار الاعتماد", sum(["pending"]), "text-amber-700"], ["تم صرفه", sum(["reimbursed"]), "text-emerald-700"]] as const).map(([l, v, c]) =>
        <div key={l} className="rounded-2xl border border-[var(--border)] bg-white p-3.5"><div className="text-[11px] font-semibold text-[var(--muted)]">{l}</div><div className={`mt-1 text-lg font-extrabold sm:text-2xl ${c}`}>{sar(v)}</div></div>)}
    </section>
    {caps.length > 0 && <section className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <div className="mb-3 text-sm font-extrabold text-[var(--navy)]">سقف البنود الشهر ده</div>
      <div className="space-y-3">{caps.map(({ c, used }) => { const pct = Math.min(100, used / (c.monthly_cap || 1) * 100), over = used > (c.monthly_cap || 0); return <div key={c.id}>
        <div className="mb-1 flex justify-between text-xs"><span className="font-bold">{c.name}</span><span className={over ? "font-bold text-red-700" : "text-[var(--muted)]"}>{sar(used)} من {sar(c.monthly_cap || 0)}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: over ? "var(--color-red-500)" : pct > 80 ? "var(--color-amber-500)" : tone(c.code) }} /></div>
      </div>; })}</div>
    </section>}

    <button type="button" onClick={() => setForm(blank())} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-[var(--sky)] to-[var(--navy)] py-4 text-base font-extrabold text-white shadow-lg shadow-[var(--sky)]/25 transition active:scale-[.98]"><Icon name="new-visit" size={22} />تسجيل مصروف جديد</button>

    {items === null ? <div className="h-40 animate-pulse rounded-2xl bg-white" /> : !items.length ? <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-white p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--sky-soft)] text-[var(--navy)]"><Icon name="wallet" size={28} /></div><div className="mt-3 font-extrabold text-[var(--navy)]">لسه ما سجلتش مصروفات</div><div className="text-sm text-[var(--muted)]">صوّر الإيصال وسجّله في أقل من دقيقة</div></div>
      : groups.map(([k, list]) => <section key={k}>
        <div className="mb-2 flex items-baseline justify-between px-1"><h2 className="text-sm font-extrabold text-[var(--navy)]">{monthLabel(k)}</h2><span className="text-xs text-[var(--muted)]">{sar(list.filter(e => e.status !== "rejected").reduce((a, e) => a + e.amount, 0))}</span></div>
        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-white">{list.map(e => <div key={e.id}>
          <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full items-center gap-3 p-3 text-right transition hover:bg-[var(--bg)]">
            <CatIcon code={e.category_code} icon={e.category_icon} />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{e.description}</div><div className="truncate text-[11px] text-[var(--muted)]">{e.category_name}{e.merchant ? ` · ${e.merchant}` : ""} · {e.expense_date}</div></div>
            <div className="flex flex-col items-end gap-1"><b className="text-sm">{sar(e.amount)}</b><StatusPill s={e.status} /></div>
          </button>
          {open === e.id && <div className="space-y-2 bg-[var(--bg)] px-4 pb-4 pt-2 text-xs">
            {e.doctor_name && <div>الطبيب: <b>{e.doctor_name}</b></div>}
            {e.vat_amount > 0 && <div>منها ضريبة: <b>{sar(e.vat_amount)}</b></div>}
            {e.review_note && <div className="rounded-xl bg-white p-2.5">ملاحظة المدير: <b>{e.review_note}</b></div>}
            {e.payment_ref && <div>مرجع الصرف: <b>{e.payment_ref}</b></div>}
            <Flags flags={e.flags} /><Receipts e={e} />
            {e.status === "pending" && <div className="flex gap-2 pt-1"><button type="button" onClick={() => edit(e)} className="rounded-full bg-white px-4 py-2 font-bold ring-1 ring-[var(--border)]">تعديل</button><button type="button" onClick={() => remove(e)} className="rounded-full bg-white px-4 py-2 font-bold text-red-700 ring-1 ring-red-200">حذف</button></div>}
          </div>}
        </div>)}</div>
      </section>)}

    {form && <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="إغلاق" className="es-fade absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => !busy && setForm(null)} />
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px]" style={{ animation: "es-up .3s var(--es-ease)" }}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[var(--border)] sm:hidden" />
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-extrabold text-[var(--navy)]">{form.id ? "تعديل مصروف" : "مصروف جديد"}</h2><button type="button" onClick={() => setForm(null)} className="rounded-full p-2 hover:bg-[var(--bg)]" aria-label="إغلاق"><Icon name="x" size={20} /></button></div>
        <label className="block text-center"><span className="text-xs font-bold text-[var(--muted)]">المبلغ (شامل الضريبة)</span>
          <div className="mt-1 flex items-baseline justify-center gap-2"><input inputMode="decimal" autoFocus value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, "") })} placeholder="0" className="w-44 bg-transparent text-center text-4xl font-extrabold text-[var(--navy)] !outline-none" dir="ltr" /><span className="text-sm font-bold text-[var(--muted)]">ر.س</span></div>
        </label>
        <div className="mt-4 text-xs font-bold text-[var(--muted)]">البند</div>
        <div className="mt-2 grid grid-cols-3 gap-2">{cats.map(c => { const on = form.category_id === c.id; return <button key={c.id} type="button" onClick={() => setForm({ ...form, category_id: c.id, doctor_id: c.allows_doctor ? form.doctor_id : "", doctorQ: c.allows_doctor ? form.doctorQ : "" })}
          className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-2.5 text-[11px] font-bold transition ${on ? "border-[var(--sky)] bg-[var(--sky-light)] text-[var(--navy)]" : "border-[var(--border)] text-[var(--ink-soft)]"}`}><CatIcon code={c.code} icon={c.icon} size={34} /><span className="leading-tight">{c.name}</span></button>; })}</div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <label className="text-xs font-bold text-[var(--muted)]">التاريخ<input type="date" max={today()} value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--ink)]" /></label>
          <label className="text-xs font-bold text-[var(--muted)]">الجهة / المحل<input value={form.merchant} onChange={e => setForm({ ...form, merchant: e.target.value })} placeholder="مثلاً: محطة ساسكو" className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--ink)]" /></label>
        </div>
        <label className="mt-2.5 block text-xs font-bold text-[var(--muted)]">الوصف<input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="مثلاً: غداء مع د. أحمد لشرح المنتج" className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--ink)]" /></label>
        {cat?.allows_doctor && <div className="relative mt-2.5"><label className="block text-xs font-bold text-[var(--muted)]">الطبيب (اختياري — يحسب العائد على الطبيب)
          <input value={form.doctorQ} onChange={e => setForm({ ...form, doctorQ: e.target.value, doctor_id: "" })} placeholder="ابحث باسم الطبيب أو العيادة" className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--ink)]" /></label>
          {docMatches.length > 0 && <div className="absolute inset-x-0 z-10 mt-1 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-xl">{docMatches.map(d => <button key={d.id} type="button" onClick={() => setForm({ ...form, doctor_id: d.id, doctorQ: d.name })} className="block w-full px-3 py-2 text-right text-sm hover:bg-[var(--sky-light)]"><b>{d.name}</b><span className="text-[11px] text-[var(--muted)]"> · {d.clinic_name || ""} {d.city || ""}</span></button>)}</div>}
        </div>}
        <label className="mt-3 flex items-center justify-between rounded-xl bg-[var(--bg)] px-3 py-2.5 text-sm font-bold"><span>فاتورة ضريبية (فيها رقم ضريبي)</span><input type="checkbox" checked={form.tax_invoice} onChange={e => setForm({ ...form, tax_invoice: e.target.checked })} className="h-5 w-5 accent-[var(--sky)]" /></label>
        {vat > 0 && <div className="mt-1 px-1 text-[11px] text-[var(--muted)]">الضريبة 15%: <b>{sar(vat)}</b> · قبل الضريبة: <b>{sar(Math.round((amountNum - vat) * 100) / 100)}</b></div>}
        <ReceiptPicker files={form.files} onChange={files => setForm({ ...form, files })} required={needsReceipt} editing={!!form.id} />
        <button type="button" disabled={busy || !form.category_id || !(amountNum > 0) || form.description.trim().length < 3} onClick={() => void save()} className="mt-4 w-full rounded-2xl bg-[var(--navy)] py-3.5 text-base font-extrabold text-white transition active:scale-[.98] disabled:opacity-40">{busy ? "جارٍ الحفظ…" : form.id ? "حفظ التعديل" : "إرسال للاعتماد"}</button>
      </div>
    </div>}
  </div>;
}

function ReceiptPicker({ files, onChange, required, editing }: { files: File[]; onChange: (f: File[]) => void; required: boolean; editing: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return <div className="mt-3">
    <input ref={input} type="file" accept="image/*,application/pdf" capture="environment" multiple hidden onChange={e => { onChange([...files, ...Array.from(e.target.files || [])].slice(0, 5)); e.target.value = ""; }} />
    <button type="button" onClick={() => input.current?.click()} className={`flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-4 text-sm font-bold transition ${required && !files.length ? "border-amber-300 bg-amber-50 text-amber-800" : "border-[var(--border-strong)] text-[var(--navy)] hover:border-[var(--sky)]"}`}>
      <Icon name="file" size={20} />{files.length ? `${files.length} إيصال — أضف كمان` : editing ? "إضافة إيصال" : required ? "صوّر الإيصال (مطلوب)" : "صوّر الإيصال"}
    </button>
    {files.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{files.map((f, i) => <span key={i} className="inline-flex items-center gap-1 rounded-lg bg-[var(--bg)] px-2 py-1 text-[11px]">{f.name.slice(0, 22)}<button type="button" aria-label="إزالة" onClick={() => onChange(files.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button></span>)}</div>}
  </div>;
}
