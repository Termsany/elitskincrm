import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import PlansClient from "./PlansClient";
import PlanningTabs, { type PlanTab } from "@/components/PlanningTabs";
import Link from "next/link";
import WeekBoard from "./WeekBoard";
import TeamBoard from "./TeamBoard";
import AreaBoard from "./AreaBoard";
import ScoreBoard from "./ScoreBoard";
import MapBoard from "./MapBoard";
import { aiStatus } from "@/lib/ai-provider";

export default async function PlansPage({searchParams}:{searchParams:Promise<{status?:string;period?:string;planId?:string;repId?:string;view?:string;tab?:string}>}){
  const user=await getCurrentUser();
  if(!user) redirect("/login");
  const sp=await searchParams;
  const isAdmin=user.role==="admin";
  const shell=(active: PlanTab, body: React.ReactNode)=>(
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/plans">
      <PlanningTabs active={active} isAdmin={isAdmin} />
      {body}
    </AppShell>
  );
  // the week / team board is the default; the full plans list (build, edit, approve history) stays one tap away and opens for deep links
  if(sp.view!=="list" && !sp.planId && !sp.status && !sp.period){
    if(sp.tab==="area") return shell("area", <AreaBoard />);
    if(sp.tab==="map" && isAdmin) return shell("map", <MapBoard />);
    if(sp.tab==="score"){
      const ai = isAdmin && !user.manager ? (await aiStatus().catch(()=>({configured:false}))).configured : false;
      return shell("score", <ScoreBoard isAdmin={isAdmin} ai={ai} aiSetup={isAdmin && !user.manager} />);
    }
    return shell(isAdmin ? "team" : "week", <>
      <div className="mb-3 flex justify-end"><Link href="/plans?view=list" className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-xs font-bold text-[var(--navy)]">{isAdmin ? "كل الخطط والاعتماد ←" : "كل خططي وتعديلها ←"}</Link></div>
      {isAdmin ? <TeamBoard /> : <WeekBoard />}
    </>);
  }
  const { query } = await import("@/lib/db");
  const reps = isAdmin ? await query("SELECT id, name, active FROM users WHERE role='sales_rep' ORDER BY active DESC, name") : {rows:[]};
  const doctors = await query("SELECT id, name, clinic_name, city, classification FROM doctors WHERE status='active' ORDER BY name");
  const products = await query(isAdmin ? "SELECT id, name FROM products ORDER BY name" : "SELECT id, name FROM products WHERE active=true ORDER BY name");
  return shell(isAdmin ? "team" : "week", <>
    <Link href="/plans" className="mb-2 inline-block text-xs font-bold text-teal-700">→ {isAdmin ? "خطط الفريق الأسبوع ده" : "خطتي الأسبوع ده"}</Link>
    <h1 className="text-2xl font-extrabold text-[var(--navy)]">الخطط والاعتماد</h1>
    <PlansClient isAdmin={isAdmin} reps={reps.rows as any} doctors={doctors.rows as any} products={products.rows as any} currentUserId={user.id} initialStatus={sp.status||""} initialPeriod={sp.period||""} initialPlanId={sp.planId||""} initialRepId={sp.repId||""} />
  </>);
}
