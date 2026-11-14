"use client";
import { useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import type { OpenFollowup } from "@/lib/followups";

const add = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
const when = (d: string, today: string) => d < today ? `متأخرة من ${dm(d)}` : d === today ? "النهارده" : d === add(today, 1) ? "بكرة" : dm(d);

/** One open follow-up with its next steps: visit now, done, or move it (tomorrow / a week / a date). */
export function FollowupRow({ f, today, onChanged, showDoctor = false }: { f: Pick<OpenFollowup, "id" | "source" | "due" | "note"> & Partial<OpenFollowup>; today: string; onChanged: () => void; showDoctor?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false); const [snooze, setSnooze] = useState(false);
  async function act(action: "done" | "snooze", date?: string) {
    setBusy(true);
    const r = await fetch("/api/my/followups", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: f.source, id: f.id, action, date }) });
    setBusy(false); setSnooze(false);
    if (!r.ok) { toast((await r.json().catch(() => null))?.error || "تعذر", "error"); return; }
    toast(action === "done" ? "اتقفلت ✓" : `اتأجلت لـ ${dm(date!)}`, "success"); onChanged();
  }
  const late = f.due < today;
  return <li className={`rounded-2xl border p-3 ${late ? "border-red-200 bg-red-50/40" : "border-[var(--border)] bg-white"}`}>
    <div className="flex items-start gap-2.5">
      <span className={`mt-0.5 shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold ${late ? "bg-red-100 text-red-700" : f.due === today ? "bg-amber-100 text-amber-800" : "bg-sky-50 text-sky-800"}`}>{when(f.due, today)}</span>
      <div className="min-w-0 flex-1">
        {showDoctor && f.doctor_id && <Link href={`/doctors/${f.doctor_id}`} className="block truncate font-extrabold text-[var(--navy)]" dir="auto">{f.doctor}{f.clinic ? <span className="font-normal text-[var(--muted)]"> · {f.clinic}</span> : null}</Link>}
        <p className="text-[13px] leading-6 text-[var(--ink)]" dir="auto">{f.note || "متابعة"}</p>
      </div>
    </div>
    <div className="mt-2 flex flex-wrap gap-1.5">
      {showDoctor && f.doctor_id && <Link href={`/visits/new?doctorId=${f.doctor_id}${f.product_id ? `&productId=${f.product_id}` : ""}`} className="flex min-h-9 items-center rounded-xl bg-[var(--navy)] px-3 text-xs font-bold text-white">▶ زورها</Link>}
      <button type="button" disabled={busy} onClick={() => void act("done")} className="min-h-9 rounded-xl bg-emerald-50 px-3 text-xs font-bold text-emerald-700">✓ اتعملت</button>
      <button type="button" disabled={busy} onClick={() => setSnooze(x => !x)} className="min-h-9 rounded-xl border border-[var(--border)] px-3 text-xs font-bold">↷ أجّل</button>
    </div>
    {snooze && <div className="es-pop mt-2 flex flex-wrap items-center gap-1.5 rounded-xl bg-[var(--bg)] p-2">
      {[[1, "بكرة"], [7, "أسبوع"], [14, "أسبوعين"], [30, "شهر"]].map(([n, l]) => <button key={n} type="button" disabled={busy} onClick={() => void act("snooze", add(today, n as number))} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[var(--navy)]">{l}</button>)}
      <input type="date" min={add(today, 1)} onChange={e => e.target.value && void act("snooze", e.target.value)} className="h-8 rounded-lg border border-[var(--border)] px-2 text-xs" aria-label="تاريخ" />
    </div>}
  </li>;
}
