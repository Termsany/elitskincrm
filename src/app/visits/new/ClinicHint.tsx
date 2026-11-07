"use client";
import { useEffect, useState } from "react";

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
  const b = h.balance, o = h.orders;
  const lines: Array<[string, string]> = [];
  if (b.overdue > 0) lines.push(["bad", `عليها ${sar(b.overdue)} متأخرة${b.oldest && b.oldest > 0 ? ` من ${b.oldest} يوم` : ""} — اسأل عن السداد قبل أي طلب جديد`]);
  else if (b.unpaid > 0) lines.push(["info", `عليها ${sar(b.unpaid)} لسه ما استحقتش`]);
  if (h.status === "stopped") lines.push(["warn", `ما طلبتش من ${o.days_since} يوم${o.usual_gap ? ` (عادتها كل ${o.usual_gap} يوم)` : ""} — اعرف السبب`]);
  else if (h.status === "declining") lines.push(["warn", `مشترياتها نزلت ${Math.abs(h.change ?? 0)}% آخر 3 شهور`]);
  else if (o.days_since !== null) lines.push(["ok", `آخر طلب من ${o.days_since} يوم${h.top?.length ? ` · بتاخد ${h.top.join("، ")}` : ""}`]);
  if (!lines.length) return null;
  const cls: Record<string, string> = { bad: "bg-red-50 text-red-900 ring-red-200", warn: "bg-amber-50 text-amber-900 ring-amber-200", info: "bg-sky-50 text-sky-900 ring-sky-200", ok: "bg-emerald-50 text-emerald-900 ring-emerald-200" };
  return <div className="space-y-1.5" role="status" aria-label={`حساب ${h.clinic || "العيادة"}`}>
    {lines.map(([k, t]) => <div key={t} className={`rounded-xl px-3 py-2 text-[12.5px] font-bold ring-1 ${cls[k]}`}>{t}</div>)}
  </div>;
}
