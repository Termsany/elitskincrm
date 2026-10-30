"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Card, SkeletonRows } from "@/components/ui";

export type HomeKind = "pendingOrders" | "pendingDoctorRequests" | "activeServiceRequests" | "pendingPlans" | "overdueTasks" | "overdueFollowups";
export type HomeItem = { id: string; kind: HomeKind; title: string; owner: string | null; created_at: string; href: string; detail_href?: string | null; rep_id?: string };
export type AdminHomeData = {
  today: string; generated_at: string; queueLimit: number;
  visits: Array<{ rep_id: string; rep_name: string; total: number; last_visit_at: string | null }>;
  counts: Record<HomeKind, number>;
  queue: HomeItem[];
};
type QueueFilter = "all" | "requests" | "overdue";
const kinds: HomeKind[] = ["pendingOrders", "pendingDoctorRequests", "activeServiceRequests", "pendingPlans", "overdueTasks", "overdueFollowups"];
const kindLabel: Record<HomeKind, string> = {
  pendingOrders: "طلب منتج للموافقة", pendingDoctorRequests: "طلب طبيب للمراجعة", activeServiceRequests: "طلب خدمة مفتوح",
  pendingPlans: "خطة تنتظر الموافقة", overdueTasks: "مهمة متأخرة", overdueFollowups: "متابعة طبيب متأخرة"
};
const fmt = new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh", calendar: "gregory" });
const number = new Intl.NumberFormat("ar-SA");
const isRequest = (kind: HomeKind) => ["pendingOrders", "pendingDoctorRequests", "activeServiceRequests"].includes(kind);
const isOverdue = (kind: HomeKind) => ["overdueTasks", "overdueFollowups"].includes(kind);

export async function fetchAdminHome(signal: AbortSignal): Promise<AdminHomeData> {
  const response = await fetch("/api/admin/home", { cache: "no-store", signal });
  if (!response.ok) throw new Error("تعذر تحميل لوحة المدير");
  const payload = await response.json() as AdminHomeData;
  if (!payload || !/^\d{4}-\d{2}-\d{2}$/.test(payload.today) || !Number.isFinite(Date.parse(payload.generated_at)) ||
      !Number.isSafeInteger(payload.queueLimit) || payload.queueLimit < 1 || !Array.isArray(payload.visits) || !Array.isArray(payload.queue) ||
      !payload.counts || !kinds.every(kind => Number.isSafeInteger(payload.counts[kind]) && payload.counts[kind] >= 0) ||
      !payload.visits.every(rep => rep && typeof rep.rep_id === "string" && typeof rep.rep_name === "string" && Number.isSafeInteger(rep.total) && rep.total >= 0) ||
      !payload.queue.every(item => item && typeof item.id === "string" && kinds.includes(item.kind) && typeof item.title === "string" &&
        typeof item.href === "string" && ((item.href.startsWith("/") && !item.href.startsWith("//")) || item.href.startsWith("#order-")) &&
        (item.detail_href == null || (typeof item.detail_href === "string" && item.detail_href.startsWith("/visits?") && !item.detail_href.startsWith("//"))))) {
    throw new Error("بيانات لوحة المدير غير مكتملة");
  }
  return payload;
}

type Props = {
  data: AdminHomeData | null; loading: boolean; error: string; onRetry: () => void;
  filter: QueueFilter; onFilter: (filter: QueueFilter) => void; showAll: boolean; onShowAll: () => void;
  busy: string; onOrderDecision: (id: string, status: "approved" | "rejected") => void;
};
export function AdminHomeView({ data, loading, error, onRetry, filter, onFilter, showAll, onShowAll, busy, onOrderDecision }: Props) {
  const todayTotal = data?.visits.reduce((sum, rep) => sum + rep.total, 0) ?? 0;
  const requests = data ? data.counts.pendingOrders + data.counts.pendingDoctorRequests + data.counts.activeServiceRequests : 0;
  const overdue = data ? data.counts.overdueTasks + data.counts.overdueFollowups : 0;
  const visible = data?.queue.filter(item => filter === "all" || (filter === "requests" ? isRequest(item.kind) : isOverdue(item.kind))) ?? [];
  const preview = showAll ? visible : visible.slice(0, data?.queueLimit ?? 8);
  const firstRequest = data?.queue.find(item => isRequest(item.kind));
  return <div className="space-y-5" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold text-[var(--navy)]">لوحة المدير</h1><p className="mt-1 text-sm text-[var(--muted)]">الزيارات حسب توقيت الرياض · الطلبات والإجراءات المفتوحة حاليًا</p></div>
      <div className="flex flex-wrap items-center gap-2">{firstRequest && <Link href={firstRequest.kind === "pendingOrders" ? firstRequest.detail_href || firstRequest.href : firstRequest.href} className="min-h-11 inline-flex items-center rounded-xl bg-[var(--navy)] px-4 text-sm font-bold text-white">مراجعة أول طلب</Link>}<button type="button" onClick={onRetry} disabled={loading} className="min-h-11 rounded-xl border border-[var(--border)] px-4 text-sm font-bold disabled:opacity-50">{loading ? "جارٍ التحديث…" : "تحديث"}</button></div>
    </header>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}{data ? " — الأرقام المعروضة من آخر تحديث ناجح." : " — لم تُحمّل الأرقام وليست صفرًا."}<button type="button" onClick={onRetry} className="mr-3 min-h-11 font-bold underline">إعادة المحاولة</button></div>}
    {loading && !data && <div role="status" className="grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Card key={i} className="p-4"><SkeletonRows rows={2} /></Card>)}</div>}
    {data && <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href={`/visits?day=${encodeURIComponent(data.today)}`} className="min-h-28 rounded-2xl border border-[var(--navy)] bg-[var(--navy)] p-4 text-white transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2"><span className="block text-sm font-bold text-white/80">زيارات اليوم · {data.today}</span><strong className="mt-2 block text-3xl">{number.format(todayTotal)}</strong><span className="mt-1 block text-xs">فتح زيارات الفريق ←</span></Link>
        <a href="#decision-queue" onClick={() => onFilter("requests")} className="min-h-28 rounded-2xl border border-[var(--border)] bg-white p-4 transition hover:border-[var(--navy)] focus-visible:outline-2"><span className="block text-sm font-bold">طلبات مفتوحة · كل الفترات</span><strong className="mt-2 block text-3xl text-[var(--navy)]">{number.format(requests)}</strong><span className="mt-1 block text-xs text-[var(--muted)]">طلبات المنتجات والأطباء والخدمة ←</span></a>
        <a href="#decision-queue" onClick={() => onFilter("overdue")} className="min-h-28 rounded-2xl border border-[var(--border)] bg-white p-4 transition hover:border-red-400 focus-visible:outline-2"><span className="block text-sm font-bold">إجراءات متأخرة · كل الفترات</span><strong className={`mt-2 block text-3xl ${overdue ? "text-red-700" : "text-[var(--navy)]"}`}>{number.format(overdue)}</strong><span className="mt-1 block text-xs text-[var(--muted)]">مهام ومتابعات تجاوزت موعدها ←</span></a>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]">
        <Card className="order-2 p-4 sm:p-5 xl:order-1"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-extrabold text-[var(--navy)]">زيارات الفريق اليوم</h2><p className="mt-1 text-xs text-[var(--muted)]">افتح المندوب لتظهر زيارات اليوم؛ ثم اضغط الزيارة لتفاصيلها.</p></div><Link href={`/visits?day=${encodeURIComponent(data.today)}`} className="text-sm font-bold text-[var(--navy)] underline">كل الزيارات ←</Link></div>
          <div className="mt-3 divide-y divide-[var(--border)]">{data.visits.map(rep => <Link key={rep.rep_id} href={`/visits?repId=${encodeURIComponent(rep.rep_id)}&day=${encodeURIComponent(data.today)}`} className="flex min-h-16 items-center justify-between gap-3 py-3 hover:bg-[var(--bg)] focus-visible:outline-2"><span className="min-w-0"><strong className="block truncate text-sm text-[var(--navy)]">{rep.rep_name}</strong><span className="block text-xs text-[var(--muted)]">{rep.last_visit_at ? `آخر زيارة ${fmt.format(new Date(rep.last_visit_at))}` : rep.total ? "لم تُسجل زيارة مكتملة بعد" : "لا توجد زيارات اليوم"}</span></span><span className="flex shrink-0 items-center gap-2"><Badge tone={rep.total ? "success" : "neutral"}>{number.format(rep.total)} زيارة</Badge><span className="text-xs font-bold text-[var(--navy)]">فتح ←</span></span></Link>)}</div>
          {!data.visits.length && <p className="mt-3 rounded-xl border border-dashed p-5 text-sm text-[var(--muted)]">لا يوجد مندوبون نشطون حاليًا. <Link href="/admin/reps" className="underline">فتح المناديب</Link></p>}
          {data.visits.length > 0 && todayTotal === 0 && <p className="mt-3 text-sm text-[var(--muted)]">لا توجد زيارات مسجلة اليوم. <Link href="/visits" className="underline">عرض أيام سابقة</Link></p>}
        </Card>
        <Card className="order-1 p-4 sm:p-5 xl:order-2" ><section id="decision-queue" className="scroll-mt-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-extrabold text-[var(--navy)]">تحتاج إجراء منك</h2><p className="mt-1 text-xs text-[var(--muted)]">{number.format(visible.length)} عنصر في هذا العرض · الأعداد أعلى تشمل كل الفترات</p></div><button type="button" onClick={() => onFilter("all")} className="min-h-11 text-xs font-bold text-[var(--navy)] underline">كل الإجراءات</button></div>
          <div className="mt-3 divide-y divide-[var(--border)]">{preview.map(item => <div id={item.kind === "pendingOrders" ? `order-${item.id}` : undefined} key={`${item.kind}:${item.id}`} className="scroll-mt-5 py-3"><a href={item.href} className="block rounded-lg p-1 hover:bg-[var(--bg)] focus-visible:outline-2"><strong className="block break-words text-sm text-[var(--navy)]">{item.title}</strong><span className="mt-1 block text-xs text-[var(--muted)]">{kindLabel[item.kind]}{item.owner ? ` · ${item.owner}` : ""} · {fmt.format(new Date(item.created_at))}</span></a>{item.kind === "pendingOrders" && <div className="mt-2 flex flex-wrap gap-2">{item.detail_href && <Link href={item.detail_href} className="min-h-11 inline-flex items-center rounded-lg border border-[var(--border)] px-3 text-xs font-bold text-[var(--navy)]">تفاصيل الزيارة</Link>}<button type="button" disabled={busy === item.id} onClick={() => onOrderDecision(item.id, "approved")} className="min-h-11 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white disabled:opacity-50">موافقة</button><button type="button" disabled={busy === item.id} onClick={() => onOrderDecision(item.id, "rejected")} className="min-h-11 rounded-lg border border-red-300 px-3 text-xs font-bold text-red-800 disabled:opacity-50">رفض</button></div>}</div>)}</div>
          {visible.length > (data.queueLimit ?? 8) && <button type="button" onClick={onShowAll} className="mt-3 min-h-11 text-sm font-bold text-[var(--navy)] underline">{showAll ? "عرض أقل" : `عرض كل الإجراءات (${number.format(visible.length)})`}</button>}
          {!visible.length && <p className="mt-4 text-sm text-emerald-800">لا توجد إجراءات معلقة في هذا التصنيف.</p>}
          </section></Card>
      </div>
      <footer className="flex flex-wrap gap-4 border-t border-[var(--border)] pt-4 text-sm font-bold text-[var(--navy)]"><Link href="/admin/reports" className="underline">التقارير التفصيلية</Link><Link href="/admin/reps" className="underline">المناديب</Link><Link href="/plans" className="underline">الخطط</Link><Link href="/admin/requests" className="underline">مركز الطلبات</Link></footer>
      {error && <p className="text-xs text-[var(--muted)]">آخر تحديث ناجح: {fmt.format(new Date(data.generated_at))}</p>}
    </>}
  </div>;
}

export default function AdminHomeWorkspace() {
  const [data, setData] = useState<AdminHomeData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetchAdminHome(controller.signal).then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "تعذر التحميل"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  async function decide(id: string, status: "approved" | "rejected") {
    if (busy) return;
    let note = "";
    if (status === "approved" && !window.confirm("تأكيد الموافقة على طلب المنتج؟")) return;
    if (status === "rejected") { const typed = window.prompt("سبب رفض الطلب (اختياري)"); if (typed === null) return; note = typed; }
    setBusy(id);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, note })
      });
      if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.error || "تعذر تحديث الطلب"); }
      setRevision(value => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر تحديث الطلب"); }
    finally { setBusy(""); }
  }
  return <AdminHomeView data={data} error={error} loading={loading} onRetry={() => setRevision(value => value + 1)} filter={filter} onFilter={value => { setFilter(value); setShowAll(false); }} showAll={showAll} onShowAll={() => setShowAll(value => !value)} busy={busy} onOrderDecision={decide} />;
}
