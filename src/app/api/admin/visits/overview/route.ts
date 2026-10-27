import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/session";
import {query} from "@/lib/db";
import {riyadhDateParts} from "@/lib/plan-reminders";
export async function GET(){
 const user=await getCurrentUser();if(!user||user.role!=="admin")return NextResponse.json({error:"Forbidden"},{status:403});
 const today=riyadhDateParts().date; const month=today.slice(0,7)+"-01"; const freqRows=await query(`SELECT classification,visits_per_month FROM plan_frequencies`);const freq:Record<string,number>={A:3,B:3,C:2};for(const r of freqRows.rows as Record<string,unknown>[])freq[String(r.classification||"").toUpperCase()]=Number(r.visits_per_month)||0;
 const reps=await query(`SELECT id,name,email FROM users WHERE role='sales_rep' AND active=true ORDER BY name`);const out=[];
 for(const rep of reps.rows as Record<string,unknown>[]){const id=String(rep.id);
  const visits=await query(`SELECT count(*)::int total,count(*) FILTER(WHERE status='completed')::int completed FROM visits WHERE sales_rep_id=$1 AND (visited_at AT TIME ZONE 'Asia/Riyadh')::date >= $2::date AND (visited_at AT TIME ZONE 'Asia/Riyadh')::date <= $3::date`,[id,month,today]);
  const byClass=await query(`SELECT upper(coalesce(d.classification,'')) classification,count(*)::int visits FROM visits v JOIN doctors d ON d.id=v.doctor_id WHERE v.sales_rep_id=$1 AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date >= $2::date AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date <= $3::date GROUP BY upper(coalesce(d.classification,''))`,[id,month,today]);
  const doctors=await query(`SELECT upper(coalesce(classification,'')) classification,count(*)::int n FROM doctors WHERE status='active' GROUP BY upper(coalesce(classification,''))`);const classMap:Record<string,number>={};for(const r of byClass.rows as Record<string,unknown>[])classMap[String(r.classification)]=Number(r.visits);let expected=0,achieved=0;const coverage=(['A','B','C']).map(cls=>{const docs=Number((doctors.rows as Record<string,unknown>[]).find(r=>String(r.classification)===cls)?.n||0);const exp=docs*freq[cls];const got=classMap[cls]||0;expected+=exp;achieved+=got;return {classification:cls,goal:freq[cls],doctors:docs,expected:exp,achieved:got,percent:exp?Math.min(100,Math.round(got/exp*100)):0}});
  const planned=await query(`SELECT count(*)::int total,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM visits v WHERE v.doctor_id=pi.doctor_id AND v.sales_rep_id=$1 AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=pi.planned_date))::int done FROM plan_items pi JOIN plans p ON p.id=pi.plan_id WHERE p.user_id=$1 AND p.status='approved' AND pi.planned_date >= $2::date AND pi.planned_date <= $3::date`,[id,month,today]);
   out.push({id,name:rep.name,email:rep.email,visits:visits.rows[0],coverage,coveragePercent:expected?Math.min(100,Math.round(achieved/expected*100)):0,plan:{planned:Number(planned.rows[0]?.total||0),done:Number(planned.rows[0]?.done||0),adherence:Number(planned.rows[0]?.total)?Math.round(Number(planned.rows[0].done)/Number(planned.rows[0].total)*100):0},});
 }
 return NextResponse.json({today,month,reps:out});
}