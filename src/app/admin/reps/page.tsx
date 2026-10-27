import {getCurrentUser} from "@/lib/session";
import {AppShell} from "@/components/AppShell";
import {redirect} from "next/navigation";
import RepsClient from "./RepsClient";
export default async function RepsPage(){
 const user=await getCurrentUser();if(!user)redirect("/login");if(user.role!=="admin")redirect("/");const{query}=await import("@/lib/db");
 const reps=await query(`SELECT u.id,u.name,u.email,u.job_title,u.role,u.active,u.last_login_at,u.assigned_product_id,p.name product_name,
  (SELECT count(*)::int FROM visits v WHERE v.sales_rep_id=u.id) visits_count,
  (SELECT count(*)::int FROM visits v WHERE v.sales_rep_id=u.id AND v.visited_at >= date_trunc('month',now())) month_visits,
  (SELECT count(*)::int FROM visits v WHERE v.sales_rep_id=u.id AND v.status='completed') completed_visits,
  (SELECT count(*)::int FROM plans pl WHERE pl.user_id=u.id) plans_count,
  (SELECT count(*)::int FROM plan_items pi JOIN plans pl ON pl.id=pi.plan_id WHERE pl.user_id=u.id) planned_visits,
  (SELECT count(*)::int FROM visit_items vi JOIN visits v ON v.id=vi.visit_id WHERE v.sales_rep_id=u.id AND vi.kind='sample') samples_count,
  (SELECT count(*)::int FROM tasks t WHERE t.assigned_to=u.id AND t.status IN ('pending','in_progress') AND t.archived=false) open_tasks,
  (SELECT count(*)::int FROM service_requests sr WHERE sr.requester_id=u.id AND sr.status IN ('pending','in_progress')) open_requests,
  COALESCE((SELECT sum(amount) FROM rep_monthly_sales s WHERE s.rep_id=u.id AND extract(year from s.sale_month)=extract(year from current_date)),0)::numeric annual_sales,
  COALESCE(u.annual_sales_target,0)::numeric annual_sales_target,
  (SELECT max(v.visited_at) FROM visits v WHERE v.sales_rep_id=u.id) last_visit
 FROM users u LEFT JOIN products p ON p.id=u.assigned_product_id WHERE u.role='sales_rep' ORDER BY u.active DESC,u.name`);
 const products=await query("SELECT id,name,active FROM products WHERE active=true ORDER BY name");
 return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/admin/reps"><h1 className="text-2xl font-extrabold text-[var(--navy)]">المناديب</h1><p className="mt-1 text-sm text-[var(--muted)]">مركز متابعة الزيارات والخطط والمبيعات والعينات والمهام وبيانات الحسابات</p><div className="mt-6"><RepsClient initial={reps.rows as any} products={products.rows as any}/></div></AppShell>;
}
