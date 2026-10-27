import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import RequestsClient from "./RequestsClient";

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ request?: string; view?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin/requests");
  const params = await searchParams;
  if (!params.request && params.view !== "full") redirect("/work");
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/work">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-xs font-extrabold text-[var(--sky-deep)]">مساحة عمل المندوب</div>
        <h1 className="mt-1 text-2xl font-extrabold text-[var(--navy)] sm:text-3xl">طلباتي</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">أنشئ الطلب، تابع المسؤول والموعد، ورد من داخل سجل واحد.</p>
      </div>
    </div>
    <RequestsClient isAdmin={false} />
  </AppShell>;
}
