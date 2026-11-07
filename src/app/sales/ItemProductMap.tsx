"use client";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";

type Item = { item: string; value: number; lines: number; product_id: string | null; mapped: boolean; reps: string | null };
type P = { id: string; name: string; reps: string | null };
const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} ر.س`;

/** Which CRM product (and so which reps) each Daftra item counts for. */
export default function ItemProductMap({ year, onChange }: { year: number; onChange?: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<{ items: Item[]; products: P[]; unassigned: number } | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => fetch(`/api/admin/sales/items?year=${year}`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => j && setD(j)).catch(() => {}), [year]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (d && d.unassigned > 0) setOpen(true); }, [d]);
  async function set(it: Item, product_id: string) {
    const r = await fetch("/api/admin/sales/items", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ item: it.item, product_id: product_id || null }) });
    if (!r.ok) { toast("تعذر الحفظ", "error"); return; }
    const p = d?.products.find(x => x.id === product_id);
    toast(p ? `«${it.item}» بقى بيتحسب على ${p.name}${p.reps ? ` (${p.reps})` : " — مفيش مندوب على المنتج ده"}` : "رجع للربط التلقائي بالاسم", "success");
    await load(); onChange?.();
  }
  if (!d) return null;
  const none = d.items.filter(i => !i.reps);
  return <section id="item-map" className="rounded-[24px] border border-[var(--border)] bg-white p-4">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-2 text-right">
      <Icon name="products" size={18} /><b className="text-[var(--navy)]">أصناف دفترة ← المنتج ← المندوب</b>
      {none.length > 0 ? <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200">{none.length} صنف بـ {money(d.unassigned)} مش محسوب لحد</span> : <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">كل المبيعات محسوبة ✓</span>}
      <span className={`mr-auto text-[var(--muted)] transition ${open ? "rotate-180" : ""}`}>▾</span>
    </button>
    {open && <>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">كل بيعة في أي عيادة بتتحسب للمندوب المسؤول عن المنتج (من صفحة المناديب). لو أكتر من مندوب على نفس المنتج، البيعة بتتقسم عليهم بالتساوي. اختار لكل صنف في دفترة المنتج بتاعه — ولو الصنف ده لسه مش منتج في البرنامج، ضيفه من صفحة المنتجات الأول.</p>
      <div className="-mx-4 mt-3 overflow-x-auto px-4"><table className="w-full min-w-[620px] text-sm">
        <thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="p-2 text-right">الصنف في دفترة</th><th className="p-2">مبيعات {year}</th><th className="p-2">المنتج</th><th className="p-2 text-right">بيتحسب لـ</th></tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{d.items.map(it => <tr key={it.item} className={!it.reps ? "bg-amber-50/40" : ""}>
          <td className="max-w-72 truncate p-2 font-bold" dir="auto" title={it.item}>{it.item}</td>
          <td className="p-2 text-center">{money(it.value)}</td>
          <td className="p-2 text-center"><select value={it.product_id || ""} onChange={e => void set(it, e.target.value)} className={`h-9 max-w-48 rounded-lg border px-2 text-xs font-bold ${it.product_id ? "border-[var(--sky-border)] bg-[var(--sky-light)]" : "border-amber-300 bg-white text-amber-800"}`}>
            <option value="">{it.product_id && !it.mapped ? "تلقائي بالاسم" : "— اختار المنتج —"}</option>{d.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            {it.product_id && !it.mapped && <div className="text-[10px] text-[var(--muted)]">اتعرف تلقائي من الاسم</div>}</td>
          <td className="p-2 text-xs">{it.reps || <span className="font-bold text-amber-800">{it.product_id ? "مفيش مندوب على المنتج ده" : "مش محسوب لحد"}</span>}</td>
        </tr>)}</tbody></table></div>
    </>}
  </section>;
}
