import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import DashboardClient from "./DashboardClient";
import { AppShell } from "@/components/AppShell";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");
  const { query } = await import("@/lib/db");
  const cities = await query("SELECT DISTINCT city FROM doctors WHERE city<>'' ORDER BY city");
  const salesSummary = await query(`SELECT u.annual_sales_target,COALESCE((SELECT sum(amount) FROM rep_monthly_sales s WHERE s.rep_id=u.id AND extract(year from s.sale_month)=extract(year from current_date)),0)::numeric annual_sales FROM users u WHERE u.id=$1`, [user.id]);
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/">
    <DashboardClient cities={cities.rows.map((row: Record<string, unknown>) => String(row.city))} isAdmin={false} salesSummary={salesSummary.rows[0] as { annual_sales_target: number; annual_sales: number } | undefined} />
  </AppShell>;
}
