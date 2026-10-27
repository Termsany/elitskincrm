import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
export default async function MyAlertsPage(){
  const user = await getCurrentUser();
  if(!user) redirect("/login");
  if(user.role==="admin") redirect("/admin/alerts");
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/">
      <h1 className="text-2xl font-extrabold text-[var(--navy)]">تنبيهاتي</h1>
      <p className="text-sm text-[var(--muted)]">أطباء لم تتم زيارتهم منذ 10 أيام</p>
      <div className="mt-4 rounded-2xl bg-white border border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
        التنبيهات تظهر في لوحة التحكم الرئيسية — <Link href="/" className="text-[var(--gold)] font-bold">العودة للوحة</Link>
      </div>
    </AppShell>
  );
}
