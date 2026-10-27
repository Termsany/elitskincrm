import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import ProductsClient from "./ProductsClient";

export default async function ProductsPage(){
  const user=await getCurrentUser();
  if(!user) redirect("/login");
  if(user.role==="admin") redirect("/admin/products");
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/products">
    <h1 className="text-2xl font-extrabold text-[var(--navy)]">المنتجات</h1>
    <p className="text-sm text-[var(--muted)] mt-1">المنتجات المضافة من المدير — اختر منتجًا لعرض تفاصيله وتسجيل زيارة</p>
    <ProductsClient />
  </AppShell>;
}
