import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import ProductsStudio from "./ProductsStudio";

export default async function AdminProductsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/admin/products">
    <h1 className="text-2xl font-extrabold text-[var(--navy)]">إدارة المنتجات</h1>
    <p className="text-sm text-[var(--muted)] mt-1">بيانات المنتج، البروشورات، نقاط الشرح، والأداء — وكل تعديل بيوصل للمناديب فوراً</p>
    <ProductsStudio />
  </AppShell>;
}
