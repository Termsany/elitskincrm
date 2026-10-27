import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import RequestsClient from "../../requests/RequestsClient";
import DoctorRequestsClient from "./DoctorRequestsClient";

export default async function AdminRequestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/admin/requests">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-xs font-extrabold text-[var(--sky-deep)]">مركز العمليات</div>
        <h1 className="mt-1 text-2xl font-extrabold text-[var(--navy)] sm:text-3xl">مركز الطلبات</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">قرارات واضحة، مسؤول وموعد لكل طلب، وسجل كامل للتواصل والتنفيذ.</p>
      </div>
      <a href="#doctor-requests" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-bold">طلبات الأطباء والعيادات ↓</a>
    </div>
    <RequestsClient isAdmin={true} />
    <section id="doctor-requests" className="scroll-mt-24 pt-4">
      <DoctorRequestsClient />
    </section>
  </AppShell>;
}
