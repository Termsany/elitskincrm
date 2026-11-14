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
      {full ? <FinanceHub subdomain={process.env.DAFTRA_SUBDOMAIN || ""} /> : <SalesHub isAdmin={user.role === "admin"} />}
    </AppShell>
  );
}
