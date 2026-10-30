import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import DashboardClient from "./DashboardClient";
import { riyadhNow } from "@/lib/forecast-contract";
import { AppShell } from "@/components/AppShell";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");
  const { query } = await import("@/lib/db");
  const cities = await query("SELECT DISTINCT city FROM doctors WHERE city<>'' ORDER BY city");
  const year = Number(riyadhNow().month.slice(0,4));
  const [annual, actual] = await Promise.all([
    query("SELECT annual_amount FROM rep_target_years WHERE rep_id=$1 AND year=$2", [user.id, year]),
    query(`SELECT fs.month::text AS month_value, COALESCE(sum((CASE WHEN fs.kind='return' THEN -1 ELSE fs.direction END) * fs.quantity * unit_price),0)::numeric AS amount
      FROM forecast_sales fs WHERE fs.rep_id=$1 AND fs.status='approved' AND EXTRACT(YEAR FROM fs.month)=$2::int AND fs.month >= $3::date AND fs.month < $4::date
      GROUP BY fs.month ORDER BY fs.month`, [user.id, year, `${year}-01-01`, `${year+1}-01-01`])
  ]);
  const salesSummary = { annual_sales_target: Number(annual.rows[0]?.annual_amount??0), annual_sales: actual.rows.reduce((total: number, row: Record<string,unknown>) => total + Number(row.amount), 0) };
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/">
    <DashboardClient cities={cities.rows.map((row: Record<string, unknown>) => String(row.city))} isAdmin={false} salesSummary={salesSummary} />
  </AppShell>;
}
