import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import NewVisitClient from "./NewVisitClient";

export default async function NewVisitPage({searchParams}:{searchParams:Promise<{doctorId?:string;productId?:string;products?:string}>}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/visits");
  const { query } = await import("@/lib/db");
  const doctors = await query("SELECT id, name, clinic_name, city, upper(classification) classification FROM doctors WHERE status='active' ORDER BY name ASC");
  const products = await query("SELECT id, name FROM products WHERE active=true ORDER BY sort_order, name");
  const params=await searchParams;
  const requestedDoctorId=params.doctorId||"";
  const requestedProductId=params.productId||"";
  const initialDoctorId=doctors.rows.some((d:Record<string,unknown>)=>String(d.id)===requestedDoctorId)?requestedDoctorId:"";
  let initialProductId=products.rows.some((p:Record<string,unknown>)=>String(p.id)===requestedProductId)?requestedProductId:"";
  // a link with the doctor only (home, doctors list, doctor page…) starts with the right product:
  // the one planned for this doctor, else the last one the doctor liked, else the last one shown
  if(initialDoctorId && !initialProductId && !params.products){
    const r=await query<{p:string|null}>(`SELECT COALESCE(
        (SELECT pi.product_id FROM plan_items pi JOIN plans pl ON pl.id=pi.plan_id JOIN products pr ON pr.id=pi.product_id AND pr.active
          WHERE pl.user_id=$1 AND pi.doctor_id=$2 AND pl.status::text<>'rejected' AND pi.planned_date >= (now() AT TIME ZONE 'Asia/Riyadh')::date - 7 ORDER BY abs(pi.planned_date - (now() AT TIME ZONE 'Asia/Riyadh')::date) LIMIT 1),
        (SELECT pp.product_id FROM visit_presented_products pp JOIN visits v ON v.id=pp.visit_id JOIN products pr ON pr.id=pp.product_id AND pr.active
          WHERE v.sales_rep_id=$1 AND v.doctor_id=$2 ORDER BY v.visited_at DESC, (pp.reaction='interested') DESC LIMIT 1))::text p`,[user.id,initialDoctorId]).catch(()=>({rows:[]}));
    if(r.rows[0]?.p) initialProductId=r.rows[0].p;
  }
  const validIds=new Set(products.rows.map((p:Record<string,unknown>)=>String(p.id)));
  const initialPresented=(params.products||"").split(",").map(x=>x.split(":")).filter(([id,r])=>validIds.has(id)&&["interested","neutral","not_interested"].includes(r||"neutral")).slice(0,20).map(([id,r])=>({productId:id,reaction:(r||"neutral") as "interested"|"neutral"|"not_interested"}));
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/visits/new">
      <NewVisitClient doctors={doctors.rows as any} products={products.rows as any} assignedProductId={user.assigned_product_id} role={user.role} initialDoctorId={initialDoctorId} initialProductId={initialProductId} initialPresented={initialPresented} />
    </AppShell>
  );
}
