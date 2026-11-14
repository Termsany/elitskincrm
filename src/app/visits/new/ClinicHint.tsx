"use client";
import { useEffect, useState } from "react";
import { clinicLines, LINE_TONE } from "@/lib/clinic-line";

type H = { linked: boolean; clinic?: string; status?: string; balance?: { unpaid: number; overdue: number; oldest: number | null }; orders?: { last: string | null; days_since: number | null; usual_gap: number | null }; change?: number | null; top?: string[] };
const sar = (n: number) => `${Math.round(n).toLocaleString("en-US")} ر.س`;

/** One-glance clinic status from Daftra while starting a visit: overdue balance first, then ordering pattern. */
export default function ClinicHint({ doctorId }: { doctorId: string }) {
  const [h, setH] = useState<H | null>(null);
  useEffect(() => {
    let on = true; setH(null);
    fetch(`/api/doctors/${doctorId}/account`).then(r => r.ok ? r.json() : null).then(j => { if (on) setH(j); }).catch(() => {});
    return () => { on = false; };
  }, [doctorId]);
  if (!h?.linked || !h.balance || !h.orders) return null;
  const lines = clinicLines({ overdue: h.balance.overdue, unpaid: h.balance.unpaid, oldest: h.balance.oldest, status: h.status, days_since: h.orders.days_since, change: h.change, top: h.top });
  if (!lines.length) return null;
  return <div className="space-y-1.5" role="status" aria-label={`حساب ${h.clinic || "العيادة"}`}>
    {lines.map(l => <div key={l.text} className={`rounded-xl px-3 py-2 text-[12.5px] font-bold ring-1 ${LINE_TONE[l.tone]}`}>{l.text}</div>)}
  </div>;
}
