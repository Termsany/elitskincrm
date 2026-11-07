import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import WorkHubClient from "./WorkHubClient";
import HrRequestPanel from "@/components/hr/HrRequestPanel";
import HrAdminBoard from "@/components/hr/HrAdminBoard";

export default async function WorkPage({ searchParams }: { searchParams: Promise<{ hr?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isAdmin = user.role === "admin";
  const hr = /^[0-9a-f-]{36}$/i.test((await searchParams).hr || "") ? (await searchParams).hr : undefined;
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/work">
    <div>
      <div className="text-xs font-extrabold text-[var(--sky-deep)]">{isAdmin ? "مركز العمليات" : "مساحة عمل المندوب"}</div>
      <h1 className="mt-1 text-2xl font-extrabold text-[var(--navy)] sm:text-3xl">مركز العمل والطلبات</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">{isAdmin ? "طلبات الموظفين والمهام والتنبيهات في مكان واحد." : "اطلب إجازة أو خروج وعودة أو سلفة أو خطاب في ضغطتين، وتابع مهامك وطلباتك."}</p>
    </div>
    <div className="mt-5">{isAdmin ? (!user.manager && <HrAdminBoard focus={hr} />) : <HrRequestPanel focus={hr} />}</div>
    <WorkHubClient isAdmin={isAdmin} />
  </AppShell>;
}
