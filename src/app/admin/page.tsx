import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import DashboardClient from "@/app/DashboardClient";

export default async function AdminPage(){
  const user=await getCurrentUser();
  if(!user) redirect("/login");
  if(user.role!=="admin") redirect("/");
  const { query } = await import("@/lib/db");
  const cities = await query("SELECT DISTINCT city FROM doctors WHERE city<>'' ORDER BY city");
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/admin">
    <DashboardClient cities={cities.rows.map((row: Record<string, unknown>) => String(row.city))} isAdmin />
  </AppShell>;
}
