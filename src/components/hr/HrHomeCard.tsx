"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import type { Balance, HrRow, PayLine } from "@/lib/hr";
import { BalanceRing, KINDS, StatusPill, dshort, kindOf, mlabel, sar } from "./hr-ui";

type Data = { today: string; month: string; requests: HrRow[]; balance: Balance | null; payroll: PayLine | null };

/** Rep home: leave balance, latest request decision and one-tap entry to new requests. */
export default function HrHomeCard() {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { void fetch("/api/hr-requests", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => j && setD(j)).catch(() => null); }, []);
  if (!d) return null;
  const b = d.balance, last = d.requests[0], pay = d.payroll;
  const up = d.requests.filter(r => r.kind === "leave" && ["approved", "completed"].includes(r.status) && (r.end_date || "") >= d.today).sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""))[0];
  return <section className="es-card-in flex flex-wrap items-center gap-4 rounded-[28px] border border-[var(--border)] bg-white p-4 shadow-sm" aria-label="طلباتي الإدارية">
    {b && <BalanceRing remaining={b.remaining} total={b.entitled + b.carryover} size={72} />}
    <div className="min-w-0 flex-1">
      <b className="text-[var(--navy)]">رصيد إجازتك {b?.remaining ?? 0} يوم</b>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[var(--muted)]">
        {up && <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">🌴 {up.start_date! <= d.today ? `في إجازة لحد ${dshort(up.end_date)}` : `إجازتك تبدأ ${dshort(up.start_date)}`}</span>}
        {last && <Link href={`/work?hr=${last.id}#hr`} className="inline-flex items-center gap-1.5 hover:underline">آخر طلب: {kindOf(last.kind).label} <StatusPill s={last.status} /></Link>}
        {pay && (pay.unpaid > 0 || pay.advance > 0) && <span className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-700">خصم {mlabel(d.month)} {sar(pay.unpaid + pay.advance, 2)}</span>}
      </div>
    </div>
    <div className="flex w-full gap-1.5 sm:w-auto">{KINDS.map(k => <Link key={k.id} href="/work#hr" title={k.label} className="group flex flex-1 flex-col items-center gap-1 rounded-2xl p-2 text-center transition hover:bg-[var(--bg)] sm:flex-none">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110" style={{ background: `${k.color}1f`, color: k.color }}><Icon name={k.icon} size={19} /></span>
      <span className="text-[10.5px] font-bold text-[var(--ink)]">{k.label}</span></Link>)}</div>
  </section>;
}
