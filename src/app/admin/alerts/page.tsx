import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import AlertsClient from "./AlertsClient";
export default async function AlertsPage(){
  const user = await getCurrentUser();
  if(!user) redirect("/login");
  if(user.role !== "admin") redirect("/");
  if(user.role!=="admin") redirect("/");
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/admin/alerts">
      <h1 className="text-2xl font-extrabold text-[var(--navy)]">التنبيهات</h1>
      <p className="text-sm text-[var(--muted)]">تنبيهات عاجلة ومتابعات الخطط والزيارات والأطباء والمناديب</p>
      <AlertsClient />
    </AppShell>
  );
}
