"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { Fixed } from "@/lib/finance";
import { Card, sar } from "./kit";

const FCAT: Record<string, string> = { rent: "إيجار", salaries: "رواتب", insurance: "تأمينات", subscriptions: "اشتراكات وبرامج", marketing: "تسويق", transport: "مواصلات وسيارات", government: "حكومي ورسوم", utilities: "كهرباء ومياه واتصالات", other: "أخرى" };

/** Fixed monthly costs (rent, salaries…) the annual goals are built on. Kept in the CRM only. */
export function FixedCosts({ fixed, today, reload }: { fixed: Fixed[]; today: string; reload: () => void }) {
  const toast = useToast();
  const blank = { id: "", name: "", category: "salaries", monthly_amount: "", start_month: today.slice(0, 7), end_month: "", notes: "" };
  const [form, setForm] = useState<typeof blank | null>(null);
  const total = fixed.filter(f => `${today.slice(0, 7)}-01` >= f.start_month.slice(0, 10) && (!f.end_month || `${today.slice(0, 7)}-01` <= f.end_month.slice(0, 10))).reduce((s, f) => s + f.monthly_amount, 0);
  async function save() {
    if (!form) return;
    const r = await fetch("/api/admin/finance/fixed", { method: form.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const j = await r.json().catch(() => null); if (!r.ok) { toast(j?.error || "تعذر الحفظ", "error"); return; }
    toast("اتحفظ", "success"); setForm(null); reload();
  }
  async function del(id: string) {
    if (!window.confirm("حذف البند ده؟")) return;
    const r = await fetch(`/api/admin/finance/fixed?id=${id}`, { method: "DELETE" }); if (r.ok) { toast("اتحذف", "success"); reload(); } else toast("تعذر الحذف", "error");
  }
  const fld = "rounded-lg border border-[var(--border)] px-2 py-2 text-sm";
  return <Card title={`المصروفات الثابتة الشهرية · ${sar(total)}`} right={<button type="button" onClick={() => setForm(blank)} className="flex items-center gap-1 rounded-xl bg-[var(--navy)] px-3 py-1.5 text-xs font-bold text-white"><Icon name="new-visit" size={14} />إضافة بند</button>}>
    {form && <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl border-2 border-[var(--sky-border)] bg-[var(--sky-light)] p-3 sm:grid-cols-6">
      <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثلاً: إيجار المكتب" className={`col-span-2 ${fld}`} />
      <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={fld}>{Object.entries(FCAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <input inputMode="decimal" value={form.monthly_amount} onChange={e => setForm({ ...form, monthly_amount: e.target.value.replace(/[^\d.]/g, "") })} placeholder="المبلغ شهرياً" className={fld} />
      <label className="text-[11px] font-bold text-[var(--muted)]">من<input type="month" value={form.start_month} onChange={e => setForm({ ...form, start_month: e.target.value })} className={`mt-0.5 w-full ${fld}`} /></label>
      <label className="text-[11px] font-bold text-[var(--muted)]">إلى (اختياري)<input type="month" value={form.end_month} onChange={e => setForm({ ...form, end_month: e.target.value })} className={`mt-0.5 w-full ${fld}`} /></label>
      <div className="col-span-2 flex gap-2 sm:col-span-6"><button type="button" onClick={() => void save()} className="rounded-lg bg-[var(--navy)] px-4 py-2 text-xs font-bold text-white">حفظ</button><button type="button" onClick={() => setForm(null)} className="rounded-lg px-4 py-2 text-xs font-bold">إلغاء</button></div>
    </div>}
    <div className="divide-y divide-[var(--border)]">{fixed.map(f => <div key={f.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
      <div className="min-w-0 flex-1"><b>{f.name}</b> <span className="text-[11px] text-[var(--muted)]">· {FCAT[f.category] || f.category} · من {f.start_month.slice(0, 7)}{f.end_month ? ` إلى ${f.end_month.slice(0, 7)}` : ""}</span></div>
      <b>{sar(f.monthly_amount)}</b>
      <button type="button" onClick={() => setForm({ id: f.id, name: f.name, category: f.category, monthly_amount: String(f.monthly_amount), start_month: f.start_month.slice(0, 7), end_month: f.end_month ? f.end_month.slice(0, 7) : "", notes: f.notes })} className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--sky-deep)] hover:bg-[var(--bg)]">تعديل</button>
      <button type="button" onClick={() => void del(f.id)} className="rounded-lg px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-50">حذف</button></div>)}</div>
  </Card>;
}
