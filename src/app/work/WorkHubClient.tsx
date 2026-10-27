"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkItem, WorkSummary, WorkTab } from "@/lib/work-items";
import AdminActionCenter from "@/app/AdminActionCenter";

type Payload = { items: WorkItem[]; summary: WorkSummary; generated_at: string };
type Chip = "all" | "overdue" | "needs_action" | "due_today" | "waiting";

const priorityLabel: Record<string, string> = { urgent: "عاجل", high: "مرتفع", normal: "عادي", low: "منخفض" };
const priorityTone: Record<string, string> = {
  urgent: "bg-red-50 text-red-700 border-red-200", high: "bg-amber-50 text-amber-700 border-amber-200",
  normal: "bg-sky-50 text-sky-700 border-sky-200", low: "bg-slate-50 text-slate-600 border-slate-200",
};
const PAGE = 40;

function formatDue(value: string | null) {
  if (!value) return "بدون موعد";
  return new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function riyadhDay(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date(value));
}

export default function WorkHubClient({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<WorkTab>("mine");
  const [chip, setChip] = useState<Chip>("all");
  const [type, setType] = useState("");
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/work-items", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 401 ? "انتهت الجلسة، سجل الدخول من جديد" : "تعذر تحميل مركز العمل");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل مركز العمل");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const today = data ? riyadhDay(data.generated_at) : "";
  const counts = useMemo(() => ({
    mine: items.filter((i) => i.needs_action).length,
    following: items.filter((i) => !i.needs_action).length,
    all: items.length,
  }), [items]);

  const visible = useMemo(() => items.filter((item) => {
    if (tab === "mine" && !item.needs_action) return false;
    if (tab === "following" && item.needs_action) return false;
    if (chip === "overdue" && !item.overdue) return false;
    if (chip === "needs_action" && !item.needs_action) return false;
    if (chip === "waiting" && item.needs_action) return false;
    if (chip === "due_today" && !(!item.overdue && item.due_at && riyadhDay(item.due_at) === today)) return false;
    if (type && item.type !== type) return false;
    if (priority && item.priority !== priority) return false;
    if (search.trim() && !`${item.title} ${item.owner_name || ""} ${item.requester_name || ""}`.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  }), [items, tab, chip, type, priority, search, today]);

  const selected = items.find((i) => i.key === selectedKey) || null;
  const summary = data?.summary;
  const chips: { id: Chip; label: string; value?: number; tone: string }[] = [
    { id: "overdue", label: "متأخر", value: summary?.overdue, tone: "text-red-700" },
    { id: "needs_action", label: isAdmin ? "يحتاج قراري" : "يحتاج ردي", value: summary?.needs_action, tone: "text-[var(--navy)]" },
    { id: "due_today", label: "يستحق اليوم", value: summary?.due_today, tone: "text-amber-700" },
    { id: "waiting", label: "بانتظار غيري", value: summary?.waiting, tone: "text-slate-600" },
  ];

  if (error && !data) return <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
    {error}<button onClick={() => void load()} className="mr-3 min-h-11 rounded-xl bg-white px-4 font-bold">إعادة المحاولة</button>
  </div>;

  return <div className="mt-5 space-y-5">
    {isAdmin && <AdminActionCenter />}
    <div className="flex flex-wrap gap-2">
      {!isAdmin && <Link href="/requests?view=full" className="inline-flex min-h-11 items-center rounded-xl bg-[var(--navy)] px-4 text-sm font-extrabold text-white">＋ طلب جديد</Link>}
      {isAdmin && <Link href="/tasks?view=full" className="inline-flex min-h-11 items-center rounded-xl bg-[var(--navy)] px-4 text-sm font-extrabold text-white">＋ مهمة جديدة / إدارة المهام</Link>}
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {chips.map((c) => <button key={c.id} onClick={() => { setChip(chip === c.id ? "all" : c.id); setTab("all"); setLimit(PAGE); }}
        aria-pressed={chip === c.id}
        className={`min-h-[84px] rounded-2xl border bg-white p-4 text-right shadow-sm transition ${chip === c.id ? "border-[var(--gold)] ring-2 ring-[var(--gold)]/30" : "border-[var(--border)]"}`}>
        <div className="text-xs font-bold text-[var(--muted)]">{c.label}</div>
        <div className={`mt-1 text-3xl font-extrabold ${c.tone}`}>{loading && !data ? "…" : (c.value ?? 0)}</div>
      </button>)}
    </div>

    <div className="flex flex-wrap items-center gap-2">
      {([["mine", "عليّ"], ["following", "أتابعه"], ["all", "الكل"]] as [WorkTab, string][]).map(([id, label]) =>
        <button key={id} onClick={() => { setTab(id); setChip("all"); setLimit(PAGE); }} aria-pressed={tab === id && chip === "all"}
          className={`min-h-11 rounded-full px-4 text-sm font-bold ${tab === id && chip === "all" ? "bg-[var(--navy)] text-white" : "border border-[var(--border)] bg-white"}`}>
          {label} <span className="opacity-70">({counts[id]})</span>
        </button>)}
      <input value={search} onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }} placeholder="بحث بالعنوان أو الاسم"
        className="min-h-11 min-w-[160px] flex-1 rounded-xl border border-[var(--border)] bg-white px-3 text-sm" aria-label="بحث" />
      <select value={type} onChange={(e) => { setType(e.target.value); setLimit(PAGE); }} aria-label="النوع" className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm">
        <option value="">كل الأنواع</option><option value="request">الطلبات</option><option value="task">المهام</option>
      </select>
      <select value={priority} onChange={(e) => { setPriority(e.target.value); setLimit(PAGE); }} aria-label="الأولوية" className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm">
        <option value="">كل الأولويات</option>{Object.entries(priorityLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <button onClick={() => void load()} disabled={loading} className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-bold">{loading ? "جارٍ التحديث…" : "تحديث"}</button>
    </div>
    {error && data && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error} — البيانات المعروضة قد لا تكون محدثة.</div>}

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-label="قائمة العمل" className="space-y-2">
        {!loading && visible.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white p-8 text-center">
          <div className="text-lg font-extrabold text-[var(--navy)]">{items.length === 0 ? "لا يوجد عمل مفتوح" : "لا توجد بنود مطابقة"}</div>
          <p className="mt-1 text-sm text-[var(--muted)]">{items.length === 0 ? "كل شيء منجز. يمكنك متابعة الزيارات أو مراجعة الخطط." : "غيّر الفلاتر لعرض بنود أخرى."}</p>
          {items.length === 0 && <Link href={isAdmin ? "/admin/reps" : "/doctors"} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-[var(--navy)] px-4 text-sm font-bold text-white">{isAdmin ? "مراجعة المناديب" : "فتح الأطباء والعيادات"}</Link>}
        </div>}
        {visible.slice(0, limit).map((item) => <button key={item.key} onClick={() => setSelectedKey(item.key)} aria-pressed={selectedKey === item.key}
          className={`block w-full rounded-2xl border bg-white p-4 text-right shadow-sm transition ${selectedKey === item.key ? "border-[var(--gold)] ring-2 ring-[var(--gold)]/30" : "border-[var(--border)]"} ${item.overdue ? "border-r-4 border-r-red-500" : ""}`}>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="rounded-full bg-slate-100 px-2 py-1">{item.type === "request" ? "✉ طلب" : "☑ مهمة"}</span>
            <span className={`rounded-full border px-2 py-1 ${priorityTone[item.priority]}`}>{priorityLabel[item.priority]}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1">{item.status_label}</span>
            {item.overdue && <span className="rounded-full bg-red-600 px-2 py-1 text-white">متأخر</span>}
            {item.needs_action && <span className="rounded-full bg-[var(--navy)] px-2 py-1 text-white">يحتاج إجراء</span>}
            {item.unread > 0 && <span className="rounded-full bg-[var(--gold)] px-2 py-1 text-white" aria-label={`${item.unread} تنبيه غير مقروء`}>● {item.unread}</span>}
          </div>
          <div className="mt-2 text-base font-extrabold text-[var(--navy)]">{item.title}</div>
          <div className="mt-1 text-xs text-[var(--muted)]">الموعد: {formatDue(item.due_at)}{isAdmin && item.requester_name ? ` · ${item.requester_name}` : ""}{item.owner_name ? ` · المسؤول: ${item.owner_name}` : ""}</div>
        </button>)}
        {visible.length > limit && <button onClick={() => setLimit(limit + PAGE)} className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-white text-sm font-bold">عرض المزيد ({visible.length - limit})</button>}
      </section>

      <aside aria-label="تفاصيل البند" className={`${selected ? "fixed inset-0 z-[60] overflow-auto bg-white p-5 lg:static lg:z-auto lg:rounded-2xl lg:border lg:border-[var(--border)]" : "hidden lg:block lg:rounded-2xl lg:border lg:border-dashed lg:border-[var(--border)] lg:bg-white/60"} lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start`}>
        {!selected ? <div className="p-6 text-center text-sm text-[var(--muted)]">اختر بندًا من القائمة لعرض تفاصيله وفتحه.</div> : <div className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs font-bold text-[var(--muted)]">{selected.type === "request" ? "طلب" : "مهمة"}</div>
            <button onClick={() => setSelectedKey(null)} className="min-h-11 rounded-xl border border-[var(--border)] px-4 text-sm font-bold lg:hidden">إغلاق</button>
          </div>
          <h2 className="text-xl font-extrabold text-[var(--navy)]">{selected.title}</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-[var(--muted)]">الحالة</dt><dd className="font-bold">{selected.status_label}</dd></div>
            <div><dt className="text-xs text-[var(--muted)]">الأولوية</dt><dd className="font-bold">{priorityLabel[selected.priority]}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-[var(--muted)]">الموعد (توقيت الرياض)</dt><dd className={`font-bold ${selected.overdue ? "text-red-700" : ""}`}>{formatDue(selected.due_at)}{selected.overdue ? " — متأخر" : ""}</dd></div>
            {selected.requester_name && <div><dt className="text-xs text-[var(--muted)]">{selected.type === "request" ? "مقدم الطلب" : "أنشأها"}</dt><dd className="font-bold">{selected.requester_name}</dd></div>}
            {selected.owner_name && <div><dt className="text-xs text-[var(--muted)]">المسؤول</dt><dd className="font-bold">{selected.owner_name}</dd></div>}
            {selected.unread > 0 && <div className="col-span-2"><dt className="text-xs text-[var(--muted)]">تنبيهات غير مقروءة</dt><dd className="font-bold">{selected.unread}</dd></div>}
          </dl>
          <div className="rounded-xl bg-slate-50 p-3 text-sm">{selected.needs_action ? "هذا البند ينتظر إجراءً منك." : "لا يوجد إجراء مطلوب منك حاليًا؛ تابع الحالة."}</div>
          <Link href={selected.href} className="flex min-h-12 items-center justify-center rounded-xl bg-[var(--navy)] px-4 text-sm font-extrabold text-white">
            {selected.type === "request" ? "فتح الطلب والرد والتعليقات" : "فتح المهام"}
          </Link>
        </div>}
      </aside>
    </div>
  </div>;
}
