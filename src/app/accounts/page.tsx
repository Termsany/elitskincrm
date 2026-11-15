import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { daftraConfigured, syncIfStale } from "@/lib/daftra";
import AccountsHub from "./AccountsHub";

/** The owner's books: customers, suppliers, expenses, profit & loss, VAT, cash and audit — all from the Daftra mirror. */
export default async function AccountsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" || user.manager) redirect("/");
  const ok = daftraConfigured();
  if (ok) await syncIfStale(60);
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/accounts">
      {ok ? <AccountsHub subdomain={process.env.DAFTRA_SUBDOMAIN || ""} />
        : <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200"><b>الحسابات بتتسحب من دفترة، والربط بدفترة مش متضبط على السيرفر.</b>
          <div className="mt-1 text-[13px]">لازم يتحط <span dir="ltr">DAFTRA_SUBDOMAIN</span> و <span dir="ltr">DAFTRA_API_KEY</span> في ملف <span dir="ltr">.env</span> على السيرفر.</div></div>}
    </AppShell>
  );
}
