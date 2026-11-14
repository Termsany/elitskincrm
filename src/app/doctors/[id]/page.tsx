import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import DoctorProfile, { type Doctor, type ProfileSummary, type ProfileVisit, type ProfilePlan, type ProfileTask } from '@/components/DoctorProfile';
import { getCurrentUser } from '@/lib/session';
import { query } from '@/lib/db';
import { doctorProfileQueries } from '@/lib/doctor-profile';
import { buildDoctorTimeline, type Followup } from '@/lib/doctor-timeline';
import DoctorActions from './DoctorActions';
import { rankedDoctors } from '@/lib/doctor-suggest';
import { openFollowups } from '@/lib/followups';
import ClinicAccountCard from '@/components/ClinicAccountCard';
import { clinicAccount, doctorClinic } from '@/lib/clinic-account';
import { riyadhToday } from '@/lib/finance';

export default async function DoctorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { id } = await params;
  // Reject malformed route IDs before PostgreSQL's UUID cast.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  // a doctor merged into another opens the one that was kept
  const merged = (await query<{ merged_into: string | null }>('SELECT merged_into FROM doctors WHERE id=$1', [id])).rows[0]?.merged_into;
  if (merged) redirect(`/doctors/${merged}`);
  const sql = doctorProfileQueries(user, id);
  const doctor = (await query<Doctor>(sql.doctor.text, sql.doctor.values)).rows[0];
  if (!doctor) notFound();
  const [summary, visits, plans, tasks, followups] = await Promise.all([
    query<ProfileSummary>(sql.summary.text, sql.summary.values),
    query<ProfileVisit>(sql.visits.text, sql.visits.values),
    query<ProfilePlan>(sql.plans.text, sql.plans.values),
    query<ProfileTask>(sql.tasks.text, sql.tasks.values),
    query<Followup>(sql.followups.text, sql.followups.values),
  ]);
  // Daftra account of the doctor's clinic (balance + buying pattern). Never blocks the page.
  const clinic = await doctorClinic(id).catch(() => null);
  const account = clinic ? await clinicAccount(clinic.id, riyadhToday(), user.role === 'admin' ? null : user.id).catch(() => null) : null;
  const timeline = buildDoctorTimeline({ visits: visits.rows, followups: followups.rows, tasks: tasks.rows, plans: plans.rows });
  const isAdmin = user.role === 'admin';
  const today = riyadhToday();
  // the rep's next step with this doctor: same ranking as the doctors list, open follow-ups, and the product to start a visit with
  const rep = isAdmin ? null : await (async () => {
    const [ranked, fu, prod] = await Promise.all([
      rankedDoctors(user.id, today).then(r => r.find(d => d.id === id) || null).catch(() => null),
      openFollowups(user.id, id).catch(() => []),
      query<{ p: string | null }>(`SELECT COALESCE(
          (SELECT pi.product_id FROM plan_items pi JOIN plans pl ON pl.id=pi.plan_id WHERE pl.user_id=$1 AND pi.doctor_id=$2 AND pl.status::text<>'rejected' AND pi.planned_date >= $3::date AND pi.product_id IS NOT NULL ORDER BY pi.planned_date LIMIT 1),
          (SELECT pp.product_id FROM visit_presented_products pp JOIN visits v ON v.id=pp.visit_id WHERE v.sales_rep_id=$1 AND v.doctor_id=$2 ORDER BY v.visited_at DESC, (pp.reaction='interested') DESC LIMIT 1),
          (SELECT assigned_product_id FROM users WHERE id=$1))::text p`, [user.id, id, today]).then(r => r.rows[0]?.p || null).catch(() => null),
    ]);
    return { ranked, fu, prod };
  })();
  const r = rep?.ranked;
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/doctors">
    <DoctorProfile doctor={doctor} summary={summary.rows[0]} timeline={timeline} isAdmin={isAdmin}
      next={r ? { reason: r.prio.reason, icon: r.prio.icon, tone: r.prio.tone, days: r.days_since, paused: r.paused } : null}
      actions={rep ? <DoctorActions doctorId={id} name={doctor.name} phone={doctor.phone || ''} clinic={doctor.clinic_name || ''} city={doctor.city || ''} productId={rep.prod} inPlan={r?.in_plan_next || null}
        paused={!!r?.paused} followups={JSON.parse(JSON.stringify(rep.fu))} today={today} active={doctor.status === 'active'} /> : null}
      account={<ClinicAccountCard clinic={clinic} account={account ? JSON.parse(JSON.stringify(account)) : null} isAdmin={isAdmin} />} />
  </AppShell>;
}
