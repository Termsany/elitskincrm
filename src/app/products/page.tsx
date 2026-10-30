import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import ProductsShowroom from "./ProductsShowroom";

export default async function ProductsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin/products");
  const { query } = await import("@/lib/db");
  const doctors = await query("SELECT id, name, clinic_name, city FROM doctors WHERE status='active' ORDER BY name");
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/products">
    <h1 className="text-2xl font-extrabold text-[var(--navy)]">المنتجات</h1>
    <ProductsShowroom doctors={doctors.rows as any} canVisit={user.role === "sales_rep"} />
  </AppShell>;
}
