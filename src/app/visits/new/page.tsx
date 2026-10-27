import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import NewVisitClient from "./NewVisitClient";

export default async function NewVisitPage({searchParams}:{searchParams:Promise<{doctorId?:string;productId?:string}>}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/visits");
  const { query } = await import("@/lib/db");
  const doctors = await query("SELECT id, name, clinic_name, city FROM doctors WHERE status='active' ORDER BY name ASC");
  const products = await query("SELECT id, name FROM products WHERE active=true ORDER BY name");
  const params=await searchParams;
  const requestedDoctorId=params.doctorId||"";
  const requestedProductId=params.productId||"";
  const initialDoctorId=doctors.rows.some((d:Record<string,unknown>)=>String(d.id)===requestedDoctorId)?requestedDoctorId:"";
  const initialProductId=products.rows.some((p:Record<string,unknown>)=>String(p.id)===requestedProductId)?requestedProductId:"";
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/visits/new">
      <h1 className="text-2xl font-extrabold text-[var(--navy)]">تسجيل زيارة جديدة</h1>
      <p className="text-sm text-[var(--muted)] mt-1">سيتم تسجيل التاريخ والوقت تلقائيًا</p>
      <NewVisitClient doctors={doctors.rows as any} products={products.rows as any} assignedProductId={user.assigned_product_id} role={user.role} initialDoctorId={initialDoctorId} initialProductId={initialProductId} />
    </AppShell>
  );
}
