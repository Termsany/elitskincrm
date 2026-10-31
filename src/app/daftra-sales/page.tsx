import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { daftraConfigured, syncIfStale } from "@/lib/daftra";
import FinanceHub from "./FinanceHub";

export default async function DaftraSalesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  await syncIfStale(60);
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/daftra-sales">
    <h1 className="text-2xl font-extrabold text-[var(--navy)]">مبيعات دفترة والحسابات</h1>
    <p className="text-sm text-[var(--muted)]">مبيعاتك ومشترياتك وأرباحك ومديونياتك من دفترة — بلغة بسيطة، ومعاها نصايح مستشار مالي</p>
    {daftraConfigured() ? <FinanceHub subdomain={process.env.DAFTRA_SUBDOMAIN || ""} /> : <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">ربط دفترة غير مُعدّ على السيرفر.</div>}
  </AppShell>;
}
