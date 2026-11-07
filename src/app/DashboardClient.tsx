"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import DashboardPlans from "./DashboardPlans";
import DashboardDoctorSuggestions from "./DashboardDoctorSuggestions";
import RepDailyWorkspace from "./RepDailyWorkspace";
import CollectionsCard from "./CollectionsCard";
import { salesAttainment } from "@/lib/dashboard-workspace";
import { Icon } from "@/components/Icon";


type SalesSummary = { annual_sales_target: number; annual_sales: number };

const number = new Intl.NumberFormat("ar-SA-u-nu-latn-ca-gregory");

/** Count-up for numbers (eases out, respects reduced motion). */
function useCountUp(v: number, ms = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(v); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const p = Math.min(1, (t - t0) / ms); setN(v * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [v, ms]);
  return n;
}

/** Annual sales vs target — clear colours on white, a ring, a "where you should be today" marker and a plain-language status. */
function SalesTargetCard({ sales }: { sales: ReturnType<typeof salesAttainment> }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  const y = Number(today.slice(0, 4)), start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1), now = Date.parse(`${today}T12:00:00Z`);
  const pace = Math.round((now - start) / (end - start) * 100);              // % of the year gone
  const monthsLeft = Math.max(1, 12 - Number(today.slice(5, 7)) + 1);
  const pct = sales.percentage, hasTarget = sales.target > 0;
  const tone = !hasTarget ? "none" : pct >= pace ? "good" : pct >= pace - 15 ? "watch" : "risk";
  const T = {
    good: { label: "متقدم عن المطلوب 🚀", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", ring: ["#33b3a6", "#1aa865"] },
    watch: { label: "قريب من المسار", pill: "bg-amber-50 text-amber-800 ring-amber-200", ring: ["#f2b544", "#e99608"] },
    risk: { label: "محتاج تسرّع", pill: "bg-red-50 text-red-700 ring-red-200", ring: ["#ff8c50", "#e1483e"] },
    none: { label: "مفيش هدف متسجل", pill: "bg-slate-100 text-slate-600 ring-slate-200", ring: ["#cddddd", "#cddddd"] },
  }[tone];
  const shown = useCountUp(pct), achieved = useCountUp(sales.achieved), remaining = useCountUp(sales.remaining);
  const size = 132, sw = 11, r = (size - sw) / 2, c = 2 * Math.PI * r;
  const money0 = (n: number) => `${Math.round(n).toLocaleString("en-US")} ر.س`;
  return (
    <Link href="/sales" className="group dz-card dz-in relative block self-start overflow-hidden rounded-[28px] border border-[var(--border)] bg-white p-5 shadow-sm">
      <div className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-[var(--sky-soft)] transition-transform duration-700 group-hover:scale-110" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]"><span className="dz-ico dz-rise !h-8 !w-8 !rounded-xl" style={{ color: "#1aa865", background: "linear-gradient(140deg,#1aa8652e,#1aa8650f)" }}><Icon name="sales" size={16} /></span>مبيعاتك مقابل التارجت السنوي</div>
          <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1 ${T.pill}`}>{T.label}</span>
        </div>
        <span className="rounded-full bg-[var(--bg)] px-3 py-1.5 text-[11px] font-bold text-[var(--navy)] transition group-hover:bg-[var(--navy)] group-hover:text-white">التفاصيل ‹</span>
      </div>
      <div className="relative mt-4 flex items-center gap-5">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <defs><linearGradient id="sales-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={T.ring[0]} /><stop offset="100%" stopColor={T.ring[1]} /></linearGradient></defs>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f5" strokeWidth={sw} />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#sales-ring)" strokeWidth={sw} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} />
            {hasTarget && <circle cx={size / 2 + r * Math.cos(2 * Math.PI * pace / 100)} cy={size / 2 + r * Math.sin(2 * Math.PI * pace / 100)} r={4.5} fill="#10484f" stroke="#fff" strokeWidth={2}><title>المفروض توصل له النهارده</title></circle>}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none"><span className="text-3xl font-extrabold text-[var(--navy)]">{Math.round(shown)}%</span><span className="mt-1 text-[10px] text-[var(--muted)]">من التارجت</span></div>
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          <div><div className="text-[11px] font-bold text-[var(--muted)]">المحقق</div><div className="text-xl font-extrabold text-emerald-700">{money0(achieved)}</div></div>
          <div><div className="text-[11px] font-bold text-[var(--muted)]">التارجت السنوي</div><div className="text-sm font-extrabold text-[var(--navy)]">{hasTarget ? money0(sales.target) : "—"}</div></div>
          <div><div className="text-[11px] font-bold text-[var(--muted)]">المتبقي</div><div className="text-sm font-extrabold text-[#c2410c]">{hasTarget ? money0(remaining) : "—"}</div></div>
        </div>
      </div>
      {hasTarget && <div className="relative mt-4">
        <div className="relative h-2.5 overflow-hidden rounded-full bg-[var(--bg)]"><div className="dz-grow-x h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(to left, ${T.ring[0]}, ${T.ring[1]})` }} /></div>
        <div className="absolute -top-1 h-4.5 w-0.5 rounded bg-[var(--navy)]" style={{ right: `${pace}%`, height: 18 }} title="مكانك المفروض النهارده" />
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-[var(--muted)]"><span>السنة عدّى منها <b className="text-[var(--navy)]">{pace}%</b> والخط الغامق مكانك المفروض</span>{sales.remaining > 0 && <span>محتاج <b className="text-[var(--navy)]">{money0(sales.remaining / monthsLeft)}</b> شهرياً</span>}</div>
      </div>}
    </Link>
  );
}

function RepDashboard({ salesSummary }: { salesSummary?: SalesSummary }) {
  const sales = salesAttainment(Number(salesSummary?.annual_sales_target), Number(salesSummary?.annual_sales));
  return (
    <div className="space-y-5">
      <RepDailyWorkspace />
      <CollectionsCard />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <DashboardDoctorSuggestions />
        <SalesTargetCard sales={sales} />
      </div>

      <DashboardPlans isAdmin={false} showToday={false} />
    </div>
  );
}

/** Rep home. (Admins land on /admin — the Command Center.) */
export default function DashboardClient({ salesSummary }: { cities?: string[]; isAdmin?: boolean; salesSummary?: SalesSummary }) {
  return <RepDashboard salesSummary={salesSummary} />;
}
