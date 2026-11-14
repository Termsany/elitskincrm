"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { sar, Card } from "./kit";

type Link = { client_id: number; name: string; unpaid: number; overdue: number; invoices: number; oldest: number | null; rep_id: string | null; clinic_id: string | null; linked: boolean;
  suggestion: { clinic_id: string; clinic_name: string; rep_id: string | null; rep_name: string | null; score: number; docs: number } | null;
  better: { clinic_id: string; clinic_name: string; rep_id: string | null; rep_name: string | null; docs: number } | null; clinic_docs: number | null;
  last_followup: { result: string; promise_date: string | null; note: string; created_at: string; rep_name: string } | null };
type LinksData = { reps: Array<{ id: string; name: string }>; clinics: Array<{ id: string; name: string; city: string; docs: number }>; clients: Link[] };
const RL: Record<string, string> = { contacted: "📞 اتواصل", promised: "🤝 وعد بالدفع", partial: "💵 دفع جزء", paid: "✅ دفع", disputed: "⚠️ معترض", no_answer: "📵 ما ردش" };

/** AR tab: route every Daftra customer to the rep who follows up the collection. */
export function ClientLinks() {
  const toast = useToast();
  const [d, setD] = useState<LinksData | null>(null);
  const load = useCallback(() => fetch("/api/admin/finance/links", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => j && setD(j)).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const unlinked = useMemo(() => d?.clients.filter(c => !c.rep_id && c.unpaid > 0) || [], [d]);
  const sugg = useMemo(() => d?.clients.filter(c => (!c.linked && c.suggestion) || c.better).length || 0, [d]);
  const [all, setAll] = useState(false);
  const noClinic = useMemo(() => d?.clients.filter(c => !c.clinic_id).length || 0, [d]);
  async function set(c: Link, rep_id: string | null, clinic_id: string | null) {
    setD(x => x && { ...x, clients: x.clients.map(y => y.client_id === c.client_id ? { ...y, rep_id, clinic_id, linked: !!(rep_id || clinic_id) } : y) });
    const r = await fetch("/api/admin/finance/links", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: c.client_id, rep_id, clinic_id }) });
    if (!r.ok) { toast("تعذر الحفظ", "error"); void load(); } else toast(rep_id ? "اتربط العميل بالمندوب ✓ — هيظهر في صفحته" : "اتشال الربط", "success");
  }
  async function auto() { const r = await fetch("/api/admin/finance/links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "auto" }) }); const j = await r.json().catch(() => null); if (r.ok) { toast(`اتربط ${j.linked} عميل تلقائياً — راجعهم`, "success"); void load(); } else toast("تعذر الربط", "error"); }
  if (!d) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  return <Card title="ربط عملاء دفترة بالعيادات والمناديب" hint="اربط كل عميل في دفترة بالعيادة والمندوب المسؤول. بالعيادة: ملف الطبيب يعرض مشترياتها ورصيدها، ويطلع تنبيه لو بطّلت تطلب. بالمندوب: يشوف فواتيرها المتأخرة ويسجل متابعة التحصيل. الربط في الـ CRM بس."
    right={sugg > 0 ? <button type="button" onClick={() => void auto()} className="flex items-center gap-1.5 rounded-xl bg-[var(--navy)] px-3 py-2 text-xs font-bold text-white"><Icon name="sparkle" size={14} />اربط/صحّح {sugg} تلقائياً</button> : null}>
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs"><button type="button" onClick={() => setAll(false)} className={`rounded-full px-3 py-1.5 font-bold ${!all ? "bg-[var(--navy)] text-white" : "bg-white ring-1 ring-[var(--border)]"}`}>عليهم فلوس ({d.clients.filter(c => c.unpaid > 0).length})</button><button type="button" onClick={() => setAll(true)} className={`rounded-full px-3 py-1.5 font-bold ${all ? "bg-[var(--navy)] text-white" : "bg-white ring-1 ring-[var(--border)]"}`}>كل العملاء ({d.clients.length})</button>{noClinic > 0 && <span className="font-bold text-amber-800">{noClinic} عميل مش مربوطين بعيادة</span>}</div>
    {unlinked.length > 0 && <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 ring-1 ring-amber-200">{unlinked.length} عميل عليهم {sar(unlinked.reduce((s, c) => s + c.unpaid, 0))} مش مربوطين بمندوب — محدش بيتابع تحصيلهم</div>}
    <div className="-mx-4 overflow-x-auto px-4"><table className="w-full min-w-[760px] text-sm">
      <thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="p-2.5 text-right">العميل</th><th className="p-2.5">المتبقي</th><th className="p-2.5">أقدم تأخير</th><th className="p-2.5">المندوب</th><th className="p-2.5">العيادة</th><th className="p-2.5 text-right">آخر متابعة</th></tr></thead>
      <tbody className="divide-y divide-[var(--border)]">{d.clients.filter(c => all || c.unpaid > 0).map(c => <tr key={c.client_id} className={`transition-colors hover:bg-[var(--sky-light)]/50 ${!c.rep_id ? "bg-amber-50/40" : ""}`}>
        <td className="max-w-64 p-2.5"><div className="truncate font-bold" dir="auto">{c.name}</div>{c.better && <button type="button" onClick={() => void set(c, c.rep_id || c.better!.rep_id, c.better!.clinic_id)} className="mt-0.5 block text-right text-[11px] font-bold text-amber-700 hover:underline">⚠️ العيادة المربوطة مفيهاش أطباء — الأنسب: {c.better.clinic_name} ({c.better.docs} طبيب) — اضغط للتصحيح</button>}{!c.linked && c.suggestion && <button type="button" onClick={() => void set(c, c.suggestion!.rep_id, c.suggestion!.clinic_id)} className="mt-0.5 text-[11px] font-bold text-[var(--sky-deep)] hover:underline">✨ اقتراح: {c.suggestion.clinic_name}{c.suggestion.docs ? ` (${c.suggestion.docs} طبيب)` : " (مفيهاش أطباء)"}{c.suggestion.rep_name ? ` · ${c.suggestion.rep_name}` : ""} — اضغط للتأكيد</button>}</td>
        <td className="p-2.5 text-center"><b>{sar(c.unpaid)}</b>{c.overdue > 0 && <div className="text-[10.5px] font-bold text-red-600">متأخر {sar(c.overdue)}</div>}</td>
        <td className="p-2.5 text-center">{c.unpaid <= 0 ? <span className="text-[var(--muted)]">—</span> : c.oldest && c.oldest > 0 ? <span className={c.oldest > 60 ? "font-bold text-red-700" : "text-amber-700"}>{c.oldest} يوم</span> : "في الميعاد"}</td>
        <td className="p-2.5 text-center"><select value={c.rep_id || ""} onChange={e => void set(c, e.target.value || null, c.clinic_id)} className={`h-9 rounded-lg border px-2 text-xs font-bold ${c.rep_id ? "border-[var(--sky-border)] bg-[var(--sky-light)] text-[var(--navy)]" : "border-amber-300 bg-white text-amber-800"}`}><option value="">— اختار مندوب —</option>{d.reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></td>
        <td className="p-2.5 text-center"><select value={c.clinic_id || ""} onChange={e => void set(c, c.rep_id, e.target.value || null)} className="h-9 max-w-44 rounded-lg border border-[var(--border)] px-2 text-xs"><option value="">—</option>{d.clinics.map(k => <option key={k.id} value={k.id}>{k.name}{k.docs ? ` · ${k.docs} طبيب` : " · بدون أطباء"}</option>)}</select></td>
        <td className="p-2.5 text-xs">{c.last_followup ? <div><b>{RL[c.last_followup.result]}</b>{c.last_followup.promise_date && <span className="text-[var(--muted)]"> · ميعاد {c.last_followup.promise_date}</span>}<div className="text-[10.5px] text-[var(--muted)]">{c.last_followup.rep_name}{c.last_followup.note ? ` — ${c.last_followup.note.slice(0, 40)}` : ""}</div></div> : <span className="text-[var(--muted)]">لسه مفيش</span>}</td>
      </tr>)}</tbody></table></div>
  </Card>;
}
