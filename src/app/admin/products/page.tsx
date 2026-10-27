import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import ProductsClient from "./ProductsClient";

export default async function ProductsPage(){
  const user=await getCurrentUser();
  if(!user) redirect("/login");
  if(user.role!=="admin") redirect("/");
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/admin/products">
    <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-extrabold text-[var(--navy)]">إدارة المنتجات</h1><p className="text-sm text-[var(--muted)] mt-1">إضافة وتعديل وتفعيل وإيقاف وحذف المنتجات</p></div></div>
    <ProductsClient />
  </AppShell>;
}
