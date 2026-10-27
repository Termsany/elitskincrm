import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import DoctorStatsClient from "./DoctorStatsClient";
export default async function DoctorStatsPage(){
  const user = await getCurrentUser();
  if(!user) redirect("/login");
  if(user.role !== "admin") redirect("/");
  if(user.role!=="admin") redirect("/");
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/admin/doctor-stats">
      <h1 className="text-2xl font-extrabold text-[var(--navy)]">أداء الأطباء</h1>
      <p className="text-sm text-[var(--muted)]">كم زيارة وكم عينة وأوردر وآخر ملاحظات لكل طبيب</p>
      <DoctorStatsClient />
    </AppShell>
  );
}
