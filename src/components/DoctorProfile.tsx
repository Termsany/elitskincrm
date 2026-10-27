import Link from 'next/link';
import { Badge, Card, EmptyState } from '@/components/ui';

export type Doctor = {
  id: string; name: string; clinic_name: string; city: string; specialty: string;
  classification: string; phone: string; email: string; status: string;
};
export type ProfileSummary = { total_visits: number; completed_visits: number; last_visit_at: Date | string | null };
export type ProfileVisit = {
  id: string; visited_at: Date | string; notes: string; status: string;
  rep_name: string | null; follow_up_at: string | null; follow_up_note: string;
  items: Array<{ id: string; product_name: string; kind: string; quantity: number; sample_purpose: string | null; approval_status: string | null }>;
  presented: Array<{ product_id: string; product_name: string; reaction: string }>;
  attachments: Array<{ id: string; file_name: string; mime_type: string; size_bytes: number; created_at: string }>;
};
export type ProfilePlan = {
  id: string; plan_id: string; planned_date: string; note: string; priority: string;
  product_name: string | null; rep_name: string | null;
};
export type ProfileTask = { id: string; title: string; priority: string; due_date: string | null; status: string };

const date = (value: Date | string) => new Intl.DateTimeFormat('ar-SA', {
  timeZone: 'Asia/Riyadh', calendar: 'gregory', year: 'numeric', month: 'short', day: 'numeric',
}).format(new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+03:00` : value));
const statuses: Record<string, string> = { completed: 'مكتملة', planned: 'مجدولة', cancelled: 'ملغاة', follow_up: 'متابعة', pending: 'قيد الانتظار', in_progress: 'قيد التنفيذ', failed: 'لم تنجز' };
const priorities: Record<string, string> = { urgent: 'عاجلة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };
const purposes: Record<string, string> = { personal_use: 'استخدام شخصي', video_shooting: 'تصوير فيديو', workshop: 'ورشة عمل' };
const approvals: Record<string, string> = { approved: 'معتمد', pending: 'بانتظار الموافقة', rejected: 'مرفوض' };
const reactions: Record<string, string> = { interested: 'مهتم', neutral: 'محايد', not_interested: 'غير مهتم' };
const actionClass = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-bold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]';

export default function DoctorProfile({ doctor, summary, visits, plans, tasks, isAdmin }: {
  doctor: Doctor; summary: ProfileSummary; visits: ProfileVisit[]; plans: ProfilePlan[]; tasks: ProfileTask[]; isAdmin: boolean;
}) {
  return <div className="mx-auto max-w-6xl space-y-5" dir="rtl">
    <Link href="/doctors" className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--navy)] hover:underline">→ العودة إلى الأطباء والعيادات</Link>
    <Card className="overflow-hidden">
      <div className="bg-[var(--navy)] p-5 text-white sm:p-6">
        <div className="text-xs font-bold text-[var(--gold)]">ملف الطبيب · 360°</div>
        <h1 className="mt-2 break-words text-2xl font-extrabold">{doctor.name}</h1>
        <p className="mt-2 break-words text-sm text-white/80">{doctor.clinic_name || 'العيادة غير مسجلة'}{doctor.city ? ` · ${doctor.city}` : ''}</p>
        <div className="mt-3 flex flex-wrap gap-2"><Badge tone={doctor.status === 'active' ? 'success' : 'neutral'}>{doctor.status === 'active' ? 'نشط' : doctor.status === 'inactive' ? 'غير نشط' : doctor.status}</Badge><Badge>التصنيف: {doctor.classification || 'غير محدد'}</Badge></div>
      </div>
      <div className="flex flex-wrap gap-2 p-4">
        {!isAdmin && doctor.status === 'active' && <Link href={`/visits/new?doctorId=${encodeURIComponent(doctor.id)}`} className={`${actionClass} !border-transparent !bg-[var(--gold)] !text-[var(--navy)]`}>+ تسجيل زيارة لهذا الطبيب</Link>}
        {doctor.phone?.trim() && <a href={`tel:${doctor.phone.replace(/[^+\d]/g, '')}`} className={actionClass}>اتصال بالطبيب</a>}
        {doctor.email?.trim() && <a href={`mailto:${doctor.email.trim()}`} className={actionClass}>إرسال بريد إلكتروني</a>}
      </div>
      <p className="px-4 pb-4 text-xs text-[var(--muted)]">الاتجاهات غير متاحة: لا يوجد عنوان تفصيلي أو إحداثيات مسجلة للعيادة.</p>
    </Card>

    <p className="text-sm text-[var(--muted)]">{isAdmin ? 'سجل نشاط جميع المناديب لدى هذا الطبيب.' : 'بيانات الطبيب مشتركة؛ الزيارات والخطط والمهام المعروضة تخصك فقط.'} التواريخ بتوقيت الرياض.</p>
    <section aria-label="ملخص الزيارات" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Card className="p-4"><div className="text-xs text-[var(--muted)]">إجمالي الزيارات المسجلة</div><div className="mt-2 text-2xl font-extrabold text-[var(--navy)]">{summary.total_visits}</div></Card>
      <Card className="p-4"><div className="text-xs text-[var(--muted)]">الزيارات المكتملة</div><div className="mt-2 text-2xl font-extrabold text-[var(--navy)]">{summary.completed_visits}</div></Card>
      <Card className="col-span-2 p-4 sm:col-span-1"><div className="text-xs text-[var(--muted)]">آخر زيارة فعلية (مكتملة / متابعة)</div><div className="mt-2 text-lg font-extrabold text-[var(--navy)]">{summary.last_visit_at ? date(summary.last_visit_at) : 'لا توجد زيارة فعلية بعد'}</div></Card>
    </section>

    <div className="grid items-start gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-1">
        <Card className="p-5"><h2 className="text-lg font-extrabold text-[var(--navy)]">بيانات الطبيب والعيادة</h2>
          <dl className="mt-4 space-y-3 text-sm">{[
            ['العيادة', doctor.clinic_name], ['المدينة', doctor.city], ['التخصص', doctor.specialty], ['التصنيف', doctor.classification], ['الهاتف', doctor.phone], ['البريد الإلكتروني', doctor.email],
          ].map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-1 break-words font-semibold" dir={label === 'الهاتف' || label === 'البريد الإلكتروني' ? 'ltr' : undefined}>{value || 'غير مسجل'}</dd></div>)}</dl>
        </Card>
        <Card className="p-5"><h2 className="text-lg font-extrabold text-[var(--navy)]">المهام المرتبطة</h2><p className="mt-1 text-xs text-[var(--muted)]">حتى 20 مهمة غير مؤرشفة · الأقرب استحقاقًا أولًا</p>
          {!tasks.length ? <EmptyState title="لا توجد مهام مرتبطة" desc="لا توجد مهام متاحة لك مرتبطة بهذا الطبيب." /> : <ul className="mt-4 space-y-3">{tasks.map(task => <li key={task.id} className="rounded-xl border border-[var(--border)] p-3"><div className="break-words font-bold">{task.title}</div><div className="mt-2 flex flex-wrap gap-2"><Badge tone={task.status === 'completed' ? 'success' : 'neutral'}>{statuses[task.status] || task.status}</Badge><Badge tone={['high','urgent'].includes(task.priority) ? 'warn' : 'neutral'}>{priorities[task.priority] || task.priority}</Badge></div><div className="mt-2 text-xs text-[var(--muted)]">{task.due_date ? `الاستحقاق: ${date(task.due_date)}` : 'بدون موعد استحقاق'}</div></li>)}</ul>}
          <Link href="/tasks" className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-[var(--navy)] hover:underline">فتح مساحة المهام ←</Link>
        </Card>
      </div>
      <div className="space-y-5 lg:col-span-2">
        <Card className="p-5"><h2 className="text-lg font-extrabold text-[var(--navy)]">الزيارات القادمة المعتمدة</h2><p className="mt-1 text-xs text-[var(--muted)]">حتى 20 زيارة من اليوم فصاعدًا · من الخطط المعتمدة فقط</p>
          {!plans.length ? <EmptyState title="لا توجد زيارات قادمة معتمدة" desc="ستظهر هنا زيارات الطبيب ضمن الخطط المعتمدة." /> : <ol className="mt-4 space-y-3">{plans.map(plan => <li key={plan.id} className="rounded-xl border border-sky-200 bg-sky-50/50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><time className="font-bold" dateTime={plan.planned_date}>{date(plan.planned_date)}</time><Badge tone="info">معتمدة</Badge></div>{isAdmin && plan.rep_name && <div className="mt-2 text-sm">المندوب: {plan.rep_name}</div>}{plan.product_name && <div className="mt-2 text-sm font-semibold">المنتج: {plan.product_name}</div>}{plan.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{plan.note}</p>}</li>)}</ol>}
          <Link href="/plans" className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-[var(--navy)] hover:underline">فتح مساحة الخطط ←</Link>
        </Card>
        <Card className="p-5"><h2 className="text-lg font-extrabold text-[var(--navy)]">سجل الزيارات</h2><p className="mt-1 text-xs text-[var(--muted)]">آخر 20 زيارة مسجلة · الأحدث أولًا</p>
          {!visits.length ? <EmptyState title="لا توجد زيارات مسجلة" desc="سجل زيارة لهذا الطبيب لتظهر ملاحظاتها وعيناتها هنا." /> : <ol className="mt-5 space-y-4">{visits.map(visit => <li key={visit.id} className="border-r-2 border-[var(--gold)] pr-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><time className="text-sm font-bold text-[var(--navy)]" dateTime={new Date(visit.visited_at).toISOString()}>{date(visit.visited_at)}</time><Badge tone={visit.status === 'completed' ? 'success' : visit.status === 'cancelled' ? 'danger' : 'info'}>{statuses[visit.status] || visit.status}</Badge></div>
            {isAdmin && visit.rep_name && <div className="mt-2 text-xs text-[var(--muted)]">المندوب: {visit.rep_name}</div>}
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{visit.notes}</p>
            {visit.presented.length > 0 && <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3"><div className="text-xs font-extrabold text-sky-900">المنتجات التي تم شرحها ورد فعل الطبيب</div><div className="mt-2 flex flex-wrap gap-2">{visit.presented.map(item => <span key={item.product_id} className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-bold text-sky-900">{item.product_name} · {reactions[item.reaction] || item.reaction}</span>)}</div></div>}
            {visit.attachments.length > 0 && <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3"><div className="text-xs font-extrabold text-violet-900">مرفقات الزيارة</div><div className="mt-2 flex flex-wrap gap-2">{visit.attachments.map(file => <a key={file.id} href={`/api/visits/${visit.id}/attachments/${file.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-900 hover:bg-violet-100">تنزيل {file.file_name}</a>)}</div></div>}
            {visit.items.length > 0 && <ul className="mt-3 space-y-2">{visit.items.map(item => <li key={item.id} className="rounded-xl bg-slate-50 p-3 text-sm"><span className="font-bold">{item.product_name}</span><span> · {item.kind === 'sample' ? 'عينات' : 'طلب'}: {item.quantity}</span>{item.kind === 'sample' && item.sample_purpose && <div className="mt-1 text-xs text-[var(--muted)]">الهدف: {purposes[item.sample_purpose] || item.sample_purpose}</div>}{item.kind === 'order' && item.approval_status && <div className="mt-1 text-xs text-[var(--muted)]">{approvals[item.approval_status] || item.approval_status}</div>}</li>)}</ul>}
            {(visit.follow_up_at || visit.follow_up_note) && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm"><div className="font-bold">متابعة{visit.follow_up_at ? ` · ${date(visit.follow_up_at)}` : ''}</div>{visit.follow_up_note && <p className="mt-1 whitespace-pre-wrap break-words">{visit.follow_up_note}</p>}</div>}
          </li>)}</ol>}
        </Card>
      </div>
    </div>
  </div>;
}
