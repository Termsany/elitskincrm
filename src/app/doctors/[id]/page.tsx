import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import DoctorProfile, { type Doctor, type ProfileSummary, type ProfileVisit, type ProfilePlan, type ProfileTask } from '@/components/DoctorProfile';
import { getCurrentUser } from '@/lib/session';
import { query } from '@/lib/db';
import { doctorProfileQueries } from '@/lib/doctor-profile';
import { buildDoctorTimeline, type Followup } from '@/lib/doctor-timeline';
import DoctorFollowups from '@/components/DoctorFollowups';
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
  const account = clinic ? await clinicAccount(clinic.id, riyadhToday()).catch(() => null) : null;
  const timeline = buildDoctorTimeline({ visits: visits.rows, followups: followups.rows, tasks: tasks.rows, plans: plans.rows });
  const isAdmin = user.role === 'admin';
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/doctors">
    <DoctorProfile doctor={doctor} summary={summary.rows[0]} timeline={timeline} isAdmin={isAdmin} />
    <ClinicAccountCard clinic={clinic} account={account ? JSON.parse(JSON.stringify(account)) : null} isAdmin={isAdmin} />
    {!isAdmin && <DoctorFollowups doctorId={id} />}
  </AppShell>;
}
