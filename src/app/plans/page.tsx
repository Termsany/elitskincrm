import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import PlansClient from "./PlansClient";
import PlanningTabs from "@/components/PlanningTabs";
import Link from "next/link";
import WeekBoard from "./WeekBoard";
import TeamBoard from "./TeamBoard";
export default async function PlansPage({searchParams}:{searchParams:Promise<{status?:string;period?:string;planId?:string;repId?:string;view?:string}>}){
  const user=await getCurrentUser();
  if(!user) redirect("/login");
  const sp0=await searchParams;
  // the week view is the default; the full plans list (build, edit, approve history) stays one tap away and opens for deep links
  if(sp0.view!=="list" && !sp0.planId && !sp0.status && !sp0.period){
    return (
      <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/plans">
        <PlanningTabs active="plans" />
        <div className="mb-3 flex justify-end"><Link href="/plans?view=list" className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-xs font-bold text-[var(--navy)]">{user.role==="admin" ? "كل الخطط والاعتماد ←" : "كل خططي وتعديلها ←"}</Link></div>
        {user.role==="admin" ? <TeamBoard /> : <WeekBoard />}
      </AppShell>
    );
  }
  const { query } = await import("@/lib/db");
  const reps = user.role==="admin" ? await query("SELECT id, name, active FROM users WHERE role='sales_rep' ORDER BY active DESC, name") : {rows:[]};
  const doctors = await query("SELECT id, name, clinic_name, city, classification FROM doctors WHERE status='active' ORDER BY name");
  const products = await query(user.role==="admin" ? "SELECT id, name FROM products ORDER BY name" : "SELECT id, name FROM products WHERE active=true ORDER BY name");
  const sp=await searchParams;
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/plans">
      <PlanningTabs active="plans" />
      <Link href="/plans" className="mb-2 inline-block text-xs font-bold text-teal-700">→ {user.role==="admin" ? "خطط الفريق الأسبوع ده" : "خطتي الأسبوع ده"}</Link>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--navy)]">الخطة · الخطط والاعتماد</h1>
        </div>
      </div>
      <PlansClient isAdmin={user.role==="admin"} reps={reps.rows as any} doctors={doctors.rows as any} products={products.rows as any} currentUserId={user.id} initialStatus={sp.status||""} initialPeriod={sp.period||""} initialPlanId={sp.planId||""} initialRepId={sp.repId||""} />
    </AppShell>
  );
}
