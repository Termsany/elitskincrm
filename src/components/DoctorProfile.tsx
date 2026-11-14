import Link from 'next/link';
import { Card } from '@/components/ui';
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

const TONE: Record<string, string> = { red: 'bg-red-50 text-red-800 ring-red-200', amber: 'bg-amber-50 text-amber-900 ring-amber-200', teal: 'bg-teal-50 text-teal-900 ring-teal-200', gold: 'bg-amber-50 text-amber-800 ring-amber-200',
  slate: 'bg-slate-50 text-slate-700 ring-slate-200', navy: 'bg-[var(--sky-light)] text-[var(--navy)] ring-[var(--sky-border)]', green: 'bg-emerald-50 text-emerald-800 ring-emerald-200' };
export type NextStep = { reason: string; icon: string; tone: string; days: number | null; paused: boolean };

/** The doctor's page: who they are, the rep's next step and actions, the clinic account, and one timeline of everything. */
export default function DoctorProfile({ doctor, summary, timeline, isAdmin, next, actions, account }: {
  doctor: Doctor; summary: ProfileSummary; timeline: DoctorTimelineEvent[]; isAdmin: boolean; next?: NextStep | null; actions?: React.ReactNode; account?: React.ReactNode;
}) {
  const cls = (doctor.classification || '').toUpperCase();
  return <div className="mx-auto max-w-6xl space-y-4" dir="rtl">
    <Link href="/doctors" className="inline-flex min-h-10 items-center text-sm font-bold text-[var(--navy)] hover:underline">→ الأطباء</Link>
    <section className="overflow-hidden rounded-[26px] border border-[var(--border)] bg-white shadow-sm">
      <div className="flex items-start gap-4 bg-gradient-to-l from-[var(--sky-light)] to-white p-5">
        <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-xl font-black ${cls === 'A' ? 'bg-[var(--navy)] text-white' : cls === 'B' ? 'bg-[var(--sky-soft)] text-[var(--navy)]' : 'bg-slate-100 text-slate-600'}`}>{cls || '—'}</span>
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-2xl font-extrabold text-[var(--navy)]" dir="auto">{doctor.name}</h1>
          <p className="mt-0.5 break-words text-sm text-[var(--muted)]" dir="auto">{[doctor.clinic_name, doctor.city, doctor.specialty].filter(Boolean).join(' · ') || '—'}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px] font-bold">
            {doctor.status !== 'active' && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{doctor.status === 'inactive' ? 'مؤرشف' : doctor.status}</span>}
            {next?.paused && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">⏸ موقوف الشهر ده</span>}
            <span className="rounded-full bg-white px-2.5 py-1 text-[var(--navy)] ring-1 ring-[var(--border)]">{summary.completed_visits} زيارة</span>
            <span className="rounded-full bg-white px-2.5 py-1 text-[var(--navy)] ring-1 ring-[var(--border)]">آخر زيارة {summary.last_visit_at ? date(summary.last_visit_at) : '—'}</span>
          </div>
        </div>
      </div>
      {next?.reason && !next.paused && <div className={`mx-4 mt-4 rounded-2xl px-4 py-3 text-[14px] font-bold ring-1 ${TONE[next.tone] || TONE.slate}`} dir="auto">{next.icon} {next.reason}</div>}
      <div className="p-4">{actions ?? <div className="flex flex-wrap gap-2">
        {!isAdmin && doctor.status === 'active' && <Link href={`/visits/new?doctorId=${encodeURIComponent(doctor.id)}`} className={`${actionClass} !border-transparent !bg-[var(--navy)] !text-white`}>▶ سجل زيارة</Link>}
        {doctor.phone?.trim() && <a href={`tel:${doctor.phone.replace(/[^+\d]/g, '')}`} className={actionClass}>📞 اتصال</a>}
        {doctor.email?.trim() && <a href={`mailto:${doctor.email.trim()}`} className={actionClass}>✉ بريد</a>}
      </div>}</div>
    </section>

    <div className="grid items-start gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card className="p-4 sm:p-5">
          <h2 className="text-lg font-extrabold text-[var(--navy)]">السجل</h2>
          <DoctorTimeline events={timeline} isAdmin={isAdmin} />
        </Card>
      </div>
      <div className="space-y-4">
        <Card className="p-4 sm:p-5"><h2 className="text-base font-extrabold text-[var(--navy)]">البيانات</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm lg:grid-cols-1">{[
            ['العيادة', doctor.clinic_name], ['المدينة', doctor.city], ['التخصص', doctor.specialty], ['التصنيف', doctor.classification], ['الهاتف', doctor.phone], ['البريد', doctor.email],
          ].map(([label, value]) => <div key={label}><dt className="text-[11px] text-[var(--muted)]">{label}</dt><dd className="mt-0.5 break-words font-semibold" dir={label === 'الهاتف' || label === 'البريد' ? 'ltr' : 'auto'}>{value || '—'}</dd></div>)}</dl>
        </Card>
      </div>
    </div>
    {account}
  </div>;
}
