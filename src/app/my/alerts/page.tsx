import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import Link from "next/link";
import DecliningClients from "@/components/DecliningClients";
import { decliningClients } from "@/lib/clinic-account";
import { riyadhToday } from "@/lib/finance";

export default async function MyAlertsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin/alerts");
  const declines = await decliningClients(user.id, riyadhToday(), { ownProducts: user.role === "sales_rep" }).catch(() => []);
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/">
      <h1 className="text-2xl font-extrabold text-[var(--navy)]">التنبيهات</h1>
      <Link href="/doctors?tag=late" className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 text-sm shadow-sm transition hover:border-teal-400">
        <span><b className="text-[var(--navy)]">الأطباء المتأخرين بقوا في صفحة الأطباء</b><span className="block text-xs text-[var(--muted)]">مترتبين بالأولوية ومعاهم السبب، وتضيفهم لبكرة بضغطة</span></span><span className="font-bold text-teal-700">افتحها ←</span></Link>
      <DecliningClients rows={declines} />
    </AppShell>
  );
}
