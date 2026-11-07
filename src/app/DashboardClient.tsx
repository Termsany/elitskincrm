"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, Input, Label, Select, SkeletonRows } from "@/components/ui";
import DashboardPlans from "./DashboardPlans";
import DashboardDoctorSuggestions from "./DashboardDoctorSuggestions";
import AdminTeamOverview from "./AdminTeamOverview";
import RepDailyWorkspace from "./RepDailyWorkspace";
import CollectionsCard from "./CollectionsCard";
import { performanceTone, salesAttainment } from "@/lib/dashboard-workspace";
import { Icon } from "@/components/Icon";
import AdminActionCenter from "@/app/AdminActionCenter";

type Stats = {
  kpis: { visits: number; doctors: number; orders: number; reps: number };
  performance: Array<{ rep_name: string; product_name: string | null; target_value: number; achieved: number; rep_id: string }>;
  heatmap: Array<{ wk: string; rep_name: string; cnt: number }>;
  cityBreakdown: Array<{ city: string; cnt: number }>;
  recent: Array<{ id: string; visited_at: string; status: string; rep_name: string; doctor_name: string; clinic_name: string; city: string }>;
};

type SalesSummary = { annual_sales_target: number; annual_sales: number };

const number = new Intl.NumberFormat("ar-SA-u-nu-latn-ca-gregory");
const money = new Intl.NumberFormat("ar-SA-u-nu-latn-ca-gregory", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });

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

function AdminDashboard({ cities }: { cities: string[] }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState({ from: "", to: "", city: "", revision: 0 });

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (applied.from) params.set("from", applied.from);
    if (applied.to) params.set("to", applied.to);
    if (applied.city) params.set("city", applied.city);
    setLoading(true);
    setError("");
    fetch(`/api/stats?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const payload = await response.json() as Stats;
        if (!payload?.kpis || !Array.isArray(payload.performance) || !Array.isArray(payload.recent)) throw new Error();
        setStats(payload);
      })
      .catch(() => { if (!controller.signal.aborted) setError("تعذر تحميل مؤشرات الإدارة. لم يتم تحويل الخطأ إلى أرقام صفرية."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applied]);

  const maxCity = useMemo(() => Math.max(1, ...(stats?.cityBreakdown ?? []).map((item) => item.cnt)), [stats]);
  const kpis = stats?.kpis;
  const cards = [
    { label: "زيارات الفترة", value: kpis?.visits, detail: "فتح سجل الزيارات", href: "/visits", tone: "navy" },
    { label: "المناديب النشطون", value: kpis?.reps, detail: "متابعة الفريق والحسابات", href: "/admin/reps", tone: "default" },
    { label: "الأطباء والعيادات", value: kpis?.doctors, detail: "فتح مركز الأطباء", href: "/doctors", tone: "default" },
    { label: "طلبات المنتجات", value: kpis?.orders, detail: "مراجعة الطلبات والنتائج", href: "/admin/requests", tone: "default" },
  ];

  function applyFilters() { setApplied((current) => ({ from, to, city, revision: current.revision + 1 })); }
  function resetFilters() {
    setFrom("");
    setTo("");
    setCity("");
    setApplied((current) => ({ from: "", to: "", city: "", revision: current.revision + 1 }));
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-[var(--navy)] p-5 text-white shadow-lg sm:p-7">
        <div className="absolute -left-12 -top-24 h-64 w-64 rounded-full bg-[var(--sky)]/15" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <div className="text-[11px] font-bold tracking-[0.24em] text-[var(--sky)]">ELITE SKIN COMMAND CENTER</div>
            <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">مركز قيادة الإدارة</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-white/70">الإجراءات المطلوبة، أداء المناديب، الخطط، الزيارات والطلبات في مسار عمل واحد.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a href="#action-center" className="flex min-h-12 items-center justify-center rounded-full bg-[var(--gold)] px-5 text-sm font-extrabold text-white">عرض الإجراءات المطلوبة</a>
            <Link href="/admin/reports" className="flex min-h-12 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-5 text-sm font-bold">التقارير</Link>
          </div>
        </div>
      </section>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-extrabold text-[var(--navy)]">فلترة مركز القيادة</h2><p className="mt-1 text-xs text-[var(--muted)]">الفترة والمدينة تطبقان على مؤشرات الزيارات والأداء أدناه</p></div>
          {loading && <Badge tone="info">جارٍ التحديث…</Badge>}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_auto] lg:items-end">
          <div><Label>من</Label><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
          <div><Label>إلى</Label><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
          <div><Label>المدينة</Label><Select value={city} onChange={(event) => setCity(event.target.value)}><option value="">كل المدن</option>{cities.map((item) => <option key={item} value={item}>{item}</option>)}</Select></div>
          <div className="flex gap-2"><Button onClick={applyFilters} disabled={loading}>تطبيق</Button><Button variant="outline" onClick={resetFilters} disabled={loading}>مسح</Button></div>
        </div>
      </Card>

      {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><div>{error}</div><Button className="mt-3" onClick={applyFilters}>إعادة المحاولة</Button></div>}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map((item) => (
          <Link key={item.label} href={item.href} className={`min-h-36 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${item.tone === "navy" ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--border)] bg-white"}`}>
            <div className={`text-xs font-bold ${item.tone === "navy" ? "text-white/65" : "text-[var(--muted)]"}`}>{item.label}</div>
            <div className={`mt-2 text-3xl font-extrabold ${item.tone === "navy" ? "text-[var(--sky)]" : "text-[var(--navy)]"}`}>{item.value === undefined ? "—" : number.format(item.value)}</div>
            <div className={`mt-4 text-[11px] font-bold ${item.tone === "navy" ? "text-white/75" : "text-[var(--sky-deep)]"}`}>{item.detail} ←</div>
          </Link>
        ))}
      </div>

      <section id="action-center" className="scroll-mt-4"><AdminActionCenter /></section>

      <AdminTeamOverview />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3"><div><h2 className="font-extrabold text-[var(--navy)]">أداء المناديب</h2><p className="mt-1 text-xs text-[var(--muted)]">الزيارات المحققة مقابل الهدف حسب الفلتر</p></div><Link href="/admin/reps" className="text-xs font-bold text-[var(--sky-deep)]">كل المناديب ←</Link></div>
            <div className="mt-4 space-y-3">
              {(stats?.performance ?? []).map((rep) => {
                const percentage = rep.target_value ? Math.min(100, Math.round((rep.achieved / rep.target_value) * 100)) : 0;
                const tone = rep.target_value ? performanceTone(percentage) : "unknown";
                return <Link href={`/admin/rep/${rep.rep_id}`} key={rep.rep_id} className="block rounded-2xl border border-[var(--border)] bg-[var(--bg)]/60 p-4 hover:border-[var(--sky)]">
                  <div className="flex items-center justify-between gap-3 text-xs"><span className="font-extrabold text-[var(--navy)]">{rep.rep_name} <span className="font-normal text-[var(--muted)]">· {rep.product_name || "بدون منتج"}</span></span><span className="font-extrabold">{rep.target_value ? `${percentage}%` : "لا يوجد هدف"}</span></div>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white"><div className={`h-full rounded-full ${tone === "good" ? "bg-emerald-600" : tone === "watch" ? "bg-[var(--sky)]" : tone === "risk" ? "bg-red-500" : "bg-slate-300"}`} style={{ width: `${rep.target_value ? percentage : 0}%` }} /></div>
                  <div className="mt-2 text-[10px] text-[var(--muted)]">{number.format(rep.achieved)} منفذ من هدف {number.format(rep.target_value)}</div>
                </Link>;
              })}
              {loading && !stats && <SkeletonRows rows={4} />}
              {!loading && stats && stats.performance.length === 0 && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-[var(--muted)]">لا توجد بيانات ضمن الفلتر الحالي</div>}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border)] p-4"><div><h2 className="font-extrabold text-[var(--navy)]">أحدث الزيارات</h2><p className="mt-1 text-xs text-[var(--muted)]">آخر 8 زيارات ضمن الفلتر الحالي</p></div><Link href="/visits" className="text-xs font-bold text-[var(--sky-deep)]">فتح السجل ←</Link></div>
            <div className="divide-y divide-[var(--border)]">
              {loading && !stats && <div className="p-4"><SkeletonRows rows={4} /></div>}
              {(stats?.recent ?? []).map((visit) => <Link href="/visits" key={visit.id} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-[var(--sky-light)]"><div className="min-w-0"><div className="truncate text-sm font-bold text-[var(--navy)]">{visit.doctor_name} · {visit.clinic_name}</div><div className="mt-1 text-xs text-[var(--muted)]">{visit.rep_name} · {visit.city} · {new Date(visit.visited_at).toLocaleDateString("ar-SA-u-nu-latn-ca-gregory")}</div></div><Badge tone={visit.status === "completed" ? "success" : visit.status === "cancelled" ? "danger" : "warn"}>{visit.status === "completed" ? "مكتملة" : visit.status === "cancelled" ? "ملغاة" : visit.status}</Badge></Link>)}
              {!loading && stats && stats.recent.length === 0 && <div className="p-8 text-center text-sm text-[var(--muted)]">لا توجد زيارات ضمن الفلتر الحالي</div>}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="font-extrabold text-[var(--navy)]">توزيع الزيارات حسب المدينة</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">الحصة النسبية ضمن الفلتر الحالي</p>
            <div className="mt-4 space-y-3">
              {loading && !stats && <SkeletonRows rows={5} />}
              {(stats?.cityBreakdown ?? []).slice(0, 8).map((item) => <div key={item.city}><div className="flex items-center justify-between gap-2 text-xs"><span className="font-bold">{item.city || "غير محدد"}</span><span className="font-extrabold text-[var(--navy)]">{number.format(item.cnt)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full bg-[var(--sky)]" style={{ width: `${(item.cnt / maxCity) * 100}%` }} /></div></div>)}
              {!loading && stats && stats.cityBreakdown.length === 0 && <div className="rounded-xl border border-dashed p-5 text-center text-xs text-[var(--muted)]">لا توجد بيانات مدن</div>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function DashboardClient({ cities, isAdmin, salesSummary }: { cities: string[]; isAdmin: boolean; salesSummary?: SalesSummary }) {
  return isAdmin ? <AdminDashboard cities={cities} /> : <RepDashboard salesSummary={salesSummary} />;
}
