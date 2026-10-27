import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import WorkHubClient from "./WorkHubClient";

export default async function WorkPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isAdmin = user.role === "admin";
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/work">
    <div>
      <div className="text-xs font-extrabold text-[var(--sky-deep)]">{isAdmin ? "مركز العمليات" : "مساحة عمل المندوب"}</div>
      <h1 className="mt-1 text-2xl font-extrabold text-[var(--navy)] sm:text-3xl">مركز العمل</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">الطلبات والمهام والتنبيهات المرتبطة بها في قائمة واحدة مرتبة حسب ما يحتاج إجراءً الآن.</p>
    </div>
    <WorkHubClient isAdmin={isAdmin} />
  </AppShell>;
}
