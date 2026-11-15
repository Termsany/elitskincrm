import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import { daftraConfigured, syncIfStale } from "@/lib/daftra";
import SalesHub from "./SalesHub";
import FinanceHub from "../daftra-sales/FinanceHub";

/** One sales page. The admin gets Daftra sales, team, goals, month plan, collection and settings together;
 *  the sales manager keeps the team console (no company money); a rep sees their own targets and sales. */
export default async function SalesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "sales_rep" && user.role !== "admin") redirect("/");
  const full = user.role === "admin" && !user.manager && daftraConfigured();
  if (full) await syncIfStale(60);
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/sales">
      <h1 className="text-2xl font-extrabold text-[var(--navy)]">المبيعات</h1>
      {user.role === "admin" && !user.manager && !daftraConfigured() && <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200">
        <b>أرقام دفترة مش ظاهرة لأن الربط بدفترة مش متضبط على السيرفر.</b>
        <div className="mt-1 text-[13px]">لازم يتحط <span dir="ltr">DAFTRA_SUBDOMAIN</span> و <span dir="ltr">DAFTRA_API_KEY</span> في ملف <span dir="ltr">.env</span> على السيرفر وبعدين يتعمل تحديث للبرنامج.</div>
      </div>}
      {full ? <FinanceHub subdomain={process.env.DAFTRA_SUBDOMAIN || ""} /> : <SalesHub isAdmin={user.role === "admin"} />}
    </AppShell>
  );
}
