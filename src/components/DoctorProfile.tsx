import Link from 'next/link';
import { Badge, Card } from '@/components/ui';
import DoctorTimeline from '@/components/DoctorTimeline';
import type { DoctorTimelineEvent } from '@/lib/doctor-timeline';

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
const actionClass = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-bold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]';

export default function DoctorProfile({ doctor, summary, timeline, isAdmin }: {
  doctor: Doctor; summary: ProfileSummary; timeline: DoctorTimelineEvent[]; isAdmin: boolean;
}) {
  return <div className="mx-auto max-w-6xl space-y-5" dir="rtl">
    <Link href="/doctors" className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--navy)] hover:underline">→ العودة إلى الأطباء والعيادات</Link>
    <Card className="overflow-hidden">
      <div className="bg-[var(--navy)] p-5 text-white sm:p-6">
        <div className="text-xs font-bold text-[var(--sky)]">ملف الطبيب · 360°</div>
        <h1 className="mt-2 break-words text-2xl font-extrabold">{doctor.name}</h1>
        <p className="mt-2 break-words text-sm text-white/80">{doctor.clinic_name || 'العيادة غير مسجلة'}{doctor.city ? ` · ${doctor.city}` : ''}</p>
        <div className="mt-3 flex flex-wrap gap-2"><Badge tone={doctor.status === 'active' ? 'success' : 'neutral'}>{doctor.status === 'active' ? 'نشط' : doctor.status === 'inactive' ? 'غير نشط' : doctor.status}</Badge><Badge>التصنيف: {doctor.classification || 'غير محدد'}</Badge></div>
      </div>
      <div className="flex flex-wrap gap-2 p-4">
        {!isAdmin && doctor.status === 'active' && <Link href={`/visits/new?doctorId=${encodeURIComponent(doctor.id)}`} className={`${actionClass} !border-transparent !bg-[var(--gold)] !text-white`}>+ تسجيل زيارة لهذا الطبيب</Link>}
        {doctor.phone?.trim() && <a href={`tel:${doctor.phone.replace(/[^+\d]/g, '')}`} className={actionClass}>اتصال بالطبيب</a>}
        {doctor.email?.trim() && <a href={`mailto:${doctor.email.trim()}`} className={actionClass}>إرسال بريد إلكتروني</a>}
      </div>
      <p className="px-4 pb-4 text-xs text-[var(--muted)]">الاتجاهات غير متاحة: لا يوجد عنوان تفصيلي أو إحداثيات مسجلة للعيادة.</p>
    </Card>

    <p className="text-sm text-[var(--muted)]">{isAdmin ? 'سجل تفاعل جميع المناديب مع هذا الطبيب.' : 'بيانات الطبيب مشتركة؛ سجل التفاعل أدناه يخصك فقط.'} التواريخ بتوقيت الرياض.</p>
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
      </div>
      <div className="space-y-5 lg:col-span-2">
        <Card className="p-5">
          <h2 className="text-lg font-extrabold text-[var(--navy)]">سجل التفاعل</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">كل الزيارات والمتابعات والمهام والزيارات القادمة المعتمدة، في ترتيب زمني واحد — الأقرب أولًا.</p>
          <DoctorTimeline events={timeline} isAdmin={isAdmin} />
        </Card>
      </div>
    </div>
  </div>;
}
