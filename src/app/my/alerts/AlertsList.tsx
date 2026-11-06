"use client";
import { useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import type { StaleDoctor } from "@/lib/my-alerts";

const CLS: Record<string, string> = { A: "bg-rose-50 text-rose-700 border-rose-200", B: "bg-amber-50 text-amber-800 border-amber-200", C: "bg-sky-50 text-sky-800 border-sky-200" };
const day = (s: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "short", timeZone: "Asia/Riyadh" }).format(new Date(s));

export default function AlertsList({ initial }: { initial: StaleDoctor[] }) {
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const late = rows.filter(r => !r.next_planned), planned = rows.filter(r => r.next_planned);

  async function pause(d: StaleDoctor) {
    setBusy(d.id);
    const r = await fetch("/api/doctors/pauses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doctorIds: [d.id], reason: "من صفحة الأطباء المتأخرين" }) }).catch(() => null);
    setBusy(null);
    if (!r?.ok) { const j = await r?.json().catch(() => ({})); toast(typeof j?.error === "string" ? j.error : "تعذر الإيقاف — حاول تاني", "error"); return; }
    setRows(x => x.filter(y => y.id !== d.id));
    window.dispatchEvent(new Event("es:alerts-changed"));
    toast(`«${d.name}» اتوقف للشهر ده`, "success");
  }

  const card = (d: StaleDoctor) => (
    <div key={d.id} className="dz-card rounded-2xl border border-[var(--border)] bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-extrabold text-[var(--navy)] truncate">{d.name}</span>
          {d.classification && <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${CLS[d.classification] || "bg-slate-50 text-slate-700 border-slate-200"}`}>{d.classification}</span>}
        </div>
        <div className="text-xs text-[var(--muted)] truncate">{[d.clinic_name, d.city].filter(Boolean).join(" — ")}</div>
        <div className="text-xs mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          <span>آخر زيارة {day(d.last_visit)} · من {d.days_since} يوم</span>
          <span className="text-[var(--muted)]">الميعاد كل {d.gap_days} يوم</span>
          {d.next_planned ? <span className="font-bold text-sky-700">🗓️ متخطط {day(d.next_planned)}</span> : <span className="font-bold text-red-700">متأخر {d.overdue_days} يوم</span>}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <Link href={`/visits/new?doctorId=${d.id}`} className="rounded-xl bg-[var(--navy)] text-white px-4 py-2 text-sm font-bold">سجّل زيارة</Link>
        {!d.next_planned && <button disabled={busy === d.id} onClick={() => pause(d)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-bold text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-40">{busy === d.id ? "…" : "Inactive الشهر ده"}</button>}
      </div>
    </div>
  );

  if (!rows.length) return <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center"><div className="text-3xl">✅</div><div className="font-extrabold text-emerald-900 mt-2">مفيش أطباء متأخرين</div><div className="text-sm text-emerald-800 mt-1">كل أطبائك في ميعادهم أو متخططين.</div></div>;
  return (
    <div className="mt-5 space-y-6">
      {late.length > 0 && <section><div className="font-extrabold mb-2">محتاجين زيارة ({late.length})</div><div className="space-y-2">{late.map(card)}</div></section>}
      {planned.length > 0 && <section><div className="font-extrabold mb-2 text-[var(--muted)]">متأخرين بس متخططين ({planned.length})</div><div className="space-y-2 opacity-90">{planned.map(card)}</div></section>}
    </div>
  );
}
