import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import DoctorProfile, { type Doctor, type ProfileSummary, type ProfileVisit, type ProfilePlan, type ProfileTask } from '@/components/DoctorProfile';
import { getCurrentUser } from '@/lib/session';
import { query } from '@/lib/db';
import { doctorProfileQueries } from '@/lib/doctor-profile';
import DoctorFollowups from '@/components/DoctorFollowups';

export default async function DoctorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { id } = await params;
  // Reject malformed route IDs before PostgreSQL's UUID cast.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const sql = doctorProfileQueries(user, id);
  const doctor = (await query<Doctor>(sql.doctor.text, sql.doctor.values)).rows[0];
  if (!doctor) notFound();
  const [summary, visits, plans, tasks] = await Promise.all([
    query<ProfileSummary>(sql.summary.text, sql.summary.values),
    query<ProfileVisit>(sql.visits.text, sql.visits.values),
    query<ProfilePlan>(sql.plans.text, sql.plans.values),
    query<ProfileTask>(sql.tasks.text, sql.tasks.values),
  ]);
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/doctors">
    <DoctorProfile doctor={doctor} summary={summary.rows[0]} visits={visits.rows} plans={plans.rows} tasks={tasks.rows} isAdmin={user.role === 'admin'} />
    <DoctorFollowups doctorId={id} isAdmin={user.role === 'admin'} />
  </AppShell>;
}
