import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import PlansClient from "./PlansClient";
export default async function PlansPage({searchParams}:{searchParams:Promise<{status?:string;period?:string;planId?:string;repId?:string}>}){
  const user=await getCurrentUser();
  if(!user) redirect("/login");
  const { query } = await import("@/lib/db");
  const reps = user.role==="admin" ? await query("SELECT id, name, active FROM users WHERE role='sales_rep' ORDER BY active DESC, name") : {rows:[]};
  const doctors = await query("SELECT id, name, clinic_name, city, classification FROM doctors WHERE status='active' ORDER BY name");
  const products = await query(user.role==="admin" ? "SELECT id, name FROM products ORDER BY name" : "SELECT id, name FROM products WHERE active=true ORDER BY name");
  const sp=await searchParams;
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/plans">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--navy)]">الخطط والاعتماد</h1>
          <p className="text-sm text-[var(--muted)]">{user.role==="admin" ? "راجع واعتمد خطط المناديب وطلبات التعديل، وتابع التغطية والتنفيذ" : "رتّب خطتك وابعتها للاعتماد — وتقدر تعدّل بعد الاعتماد بموافقة المدير"}</p>
        </div>
      </div>
      <PlansClient isAdmin={user.role==="admin"} reps={reps.rows as any} doctors={doctors.rows as any} products={products.rows as any} currentUserId={user.id} initialStatus={sp.status||""} initialPeriod={sp.period||""} initialPlanId={sp.planId||""} initialRepId={sp.repId||""} />
    </AppShell>
  );
}
