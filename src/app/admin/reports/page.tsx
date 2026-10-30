import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import ReportsWorkspace from "./ReportsWorkspace";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  const { query } = await import("@/lib/db");
  const reps = await query("SELECT id, name FROM users WHERE role='sales_rep' ORDER BY name");
  const products = await query("SELECT id, name FROM products ORDER BY active DESC, name");
  const cities = await query("SELECT DISTINCT city FROM doctors WHERE city<>'' ORDER BY city");
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/admin/reports">
      <h1 className="text-2xl font-extrabold text-[var(--navy)]">التقارير</h1>
      <p className="text-sm text-[var(--muted)]">اختار الفترة والفلاتر، اضغط على أي مندوب أو منتج أو يوم للتفاصيل، ونزّل أي تقرير Excel</p>
      <ReportsWorkspace reps={reps.rows as any} products={products.rows as any} cities={cities.rows.map((r:any)=>r.city)} />
    </AppShell>
  );
}
