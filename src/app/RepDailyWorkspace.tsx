"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { Icon } from "@/components/Icon";

type Item = { id: string; doctor_id: string; doctor_name: string; clinic_name: string; city: string; done: boolean };
type Task = { id: string; title: string; status: string; priority: string; due_date: string | null; doctor_name: string | null };
type Day = {
  today: string;
  updatedAt: string;
  summary: { planned: number; completed: number; remaining: number; nextId: string | null; adherence: number | null };
  visits: number;
  items: Item[];
  tasks: Task[];
  taskCount: number;
  overdue: number;
  activeRequests: number;
};

const number = new Intl.NumberFormat("ar-SA");

export default function RepDailyWorkspace() {
  const [data, setData] = useState<Day | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/my/day", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setData(await response.json() as Day);
    } catch {
      setError("تعذر تحديث بيانات اليوم. لم تُستبدل البيانات بأرقام صفرية.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function updateTask(task: Task) {
    setSaving(task.id);
    setNotice("");
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: task.status === "pending" ? "in_progress" : "completed" }),
      });
      if (!response.ok) throw new Error();
      setNotice(task.status === "pending" ? "تم بدء المهمة" : "تم إكمال الجزء الخاص بك من المهمة");
      await load();
    } catch {
      setNotice("لم يتم حفظ التغيير؛ تحقق من الاتصال وحاول مرة أخرى");
    } finally {
      setSaving(null);
    }
  }

  const next = data?.items.find((item) => item.id === data.summary.nextId);
  const updated = data ? new Date(data.updatedAt).toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" }) : "";

  return <section aria-label="مساحة عملي اليوم" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-xl font-extrabold text-[var(--navy)]">مساحة عملي اليوم</h2><p className="mt-1 text-xs text-[var(--muted)]">{data ? `${data.today} · توقيت الرياض · آخر تحديث ${updated}` : "خطتك، زيارتك التالية، وما يحتاج إجراء"}</p></div>
      <Button variant="outline" onClick={() => void load()} disabled={loading}>{loading ? "جارٍ التحديث…" : "تحديث البيانات"}</Button>
    </div>

    {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><Button className="mt-3" onClick={() => void load()}>إعادة المحاولة</Button></div>}
    {loading && !data && <Card className="animate-pulse p-8 text-center text-sm text-[var(--muted)]">جارٍ تجهيز يومك…</Card>}

    {data && <>
      <Card className="relative overflow-hidden border-0 bg-[linear-gradient(120deg,var(--navy),var(--navy-2))] p-5 text-white shadow-lg sm:p-7">
        <div className="absolute -left-10 -top-20 h-52 w-52 rounded-full bg-[var(--sky)]/15" />
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <div className="text-[10px] font-extrabold tracking-[0.2em] text-[var(--gold)]">خطوتك التالية من خطة اليوم</div>
            {next ? <>
              <h3 className="mt-2 text-2xl font-extrabold sm:text-3xl">{next.doctor_name}</h3>
              <p className="mt-1 text-sm text-white/75">{next.clinic_name} · {next.city}</p>
              <p className="mt-3 max-w-2xl text-xs leading-6 text-white/60">اقتراح حسب الخطة المعتمدة لليوم، وليس موعدًا مؤكدًا. افتح ملف الطبيب قبل الزيارة لمراجعة آخر النشاط والمتابعات.</p>
            </> : <>
              <h3 className="mt-2 text-2xl font-extrabold">{data.summary.planned ? "أكملت زيارات خطة اليوم" : "لا توجد زيارات معتمدة لليوم"}</h3>
              <p className="mt-2 text-sm text-white/70">يمكنك فتح الخطط أو تسجيل زيارة مباشرة.</p>
            </>}
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:w-48 lg:grid-cols-1">
            {next && <Link className="flex min-h-12 items-center justify-center rounded-full bg-[var(--gold)] px-5 text-sm font-extrabold text-[var(--navy)] shadow" href={`/visits/new?doctorId=${encodeURIComponent(next.doctor_id)}`}>بدء الزيارة الآن</Link>}
            {next && <Link className="flex min-h-11 items-center justify-center rounded-full border border-white/20 bg-white/10 px-4 text-xs font-bold text-white" href={`/doctors/${next.doctor_id}`}>ملف الطبيب</Link>}
            <Link className="flex min-h-11 items-center justify-center rounded-full border border-white/20 bg-white/10 px-4 text-xs font-bold text-white" href={next ? "/products" : "/plans"}>{next ? "فتح e-Detailing" : "فتح الخطط"}</Link>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { title: "زيارات اليوم", value: data.summary.planned, detail: "ضمن الخطة", href: "/plans", featured: true },
          { title: "تم من الخطة", value: data.summary.completed, detail: `${data.summary.adherence ?? 0}% من خطة اليوم`, href: "/visits" },
          { title: "المتبقي", value: data.summary.remaining, detail: next ? "افتح الزيارة التالية" : "لا توجد زيارة تالية", href: "/plans" },
          { title: "مهام مطلوبة", value: data.taskCount, detail: data.overdue ? `${data.overdue} منها متأخرة` : "لا توجد مهام متأخرة", href: "/tasks" },
        ].map((card) => <Link key={card.title} href={card.href} className={`min-h-32 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${card.featured ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--border)] bg-white"}`}>
          <div className={`text-xs font-bold ${card.featured ? "text-white/65" : "text-[var(--muted)]"}`}>{card.title}</div>
          <div className={`mt-2 text-3xl font-extrabold ${card.featured ? "text-[var(--gold)]" : "text-[var(--navy)]"}`}>{number.format(card.value)}</div>
          <div className={`mt-3 text-[11px] ${card.featured ? "text-white/70" : "text-[var(--muted)]"}`}>{card.detail}</div>
        </Link>)}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] p-4 sm:p-5">
            <div><h3 className="font-extrabold text-[var(--navy)]">خطة اليوم</h3><p className="mt-1 text-xs text-[var(--muted)]">نفّذ الزيارات بالترتيب المناسب لمسارك</p></div>
            <Badge tone="info">{data.summary.completed} / {data.summary.planned} مكتملة</Badge>
          </div>
          {data.summary.adherence !== null && <div className="px-4 pt-4 sm:px-5"><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${data.summary.adherence}%` }} /></div></div>}
          <div className="divide-y divide-[var(--border)] px-4 sm:px-5">
            {data.items.map((item, index) => <div key={item.id} className={`flex min-h-20 items-center gap-3 py-3 ${item.id === data.summary.nextId ? "rounded-2xl bg-[var(--sky-soft)] px-3" : ""}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${item.done ? "bg-emerald-100 text-emerald-800" : item.id === data.summary.nextId ? "bg-[var(--sky)] text-white" : "bg-slate-100 text-[var(--muted)]"}`}>{item.done ? <Icon name="check" size={16} /> : index + 1}</span>
              <Link href={`/doctors/${item.doctor_id}`} className="min-w-0 flex-1"><div className="truncate text-sm font-extrabold text-[var(--navy)]">{item.doctor_name}</div><div className="mt-1 truncate text-xs text-[var(--muted)]">{item.clinic_name} · {item.city}</div></Link>
              {item.done ? <Badge tone="success">تمت</Badge> : <Link className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-xs font-extrabold text-[var(--navy)]" href={`/visits/new?doctorId=${encodeURIComponent(item.doctor_id)}`}>{item.id === data.summary.nextId ? "ابدأ الآن" : "تسجيل"}</Link>}
            </div>)}
            {!data.items.length && <div className="p-8 text-center"><p className="text-sm text-[var(--muted)]">خطة اليوم فارغة.</p><Link href="/plans" className="mt-3 inline-flex rounded-full bg-[var(--navy)] px-4 py-2 text-xs font-bold text-white">تجهيز الخطة</Link></div>}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] p-4 sm:p-5"><div><h3 className="font-extrabold text-[var(--navy)]">ما يحتاج إجراء منك</h3><p className="mt-1 text-xs text-[var(--muted)]">الأهم أولًا، بدون قوائم طويلة</p></div>{data.overdue > 0 && <Badge tone="danger">{data.overdue} متأخرة</Badge>}</div>
          <div role="status" aria-live="polite" className="px-4 pt-3 text-xs font-bold text-[var(--sky-deep)]">{notice}</div>
          <div className="divide-y divide-[var(--border)] px-4 sm:px-5">
            {data.tasks.map((task) => {
              const overdue = Boolean(task.due_date && String(task.due_date).slice(0, 10) < data.today);
              return <div key={task.id} className="py-4"><div className="flex items-start justify-between gap-2"><div><div className="text-sm font-extrabold text-[var(--navy)]">{task.title}</div><div className={`mt-1 text-xs ${overdue ? "text-red-700" : "text-[var(--muted)]"}`}>{task.doctor_name || "مهمة عامة"} · {task.due_date ? String(task.due_date).slice(0, 10) : "بدون موعد"}</div></div><Badge tone={overdue ? "danger" : "info"}>{task.status === "pending" ? "لم تبدأ" : "قيد التنفيذ"}</Badge></div><div className="mt-3 flex gap-2"><Button disabled={saving !== null || loading} onClick={() => void updateTask(task)}>{saving === task.id ? "جارٍ الحفظ…" : task.status === "pending" ? "بدء المهمة" : "إكمال مهمتي"}</Button><Link href="/tasks" className="rounded-full px-3 py-3 text-xs font-bold text-[var(--sky-deep)]">التفاصيل</Link></div></div>;
            })}
            {!data.tasks.length && <p className="py-8 text-center text-sm text-[var(--muted)]">لا توجد مهام مستحقة عليك اليوم.</p>}
          </div>
          {data.taskCount > data.tasks.length && <Link href="/tasks" className="mx-4 mb-4 inline-flex text-sm font-bold text-[var(--sky-deep)]">عرض كل المهام ({data.taskCount}) ←</Link>}
        </Card>
      </div>
    </>}
  </section>;
}
