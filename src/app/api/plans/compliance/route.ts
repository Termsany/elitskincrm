import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
export async function GET(){
  const user=await getCurrentUser(); if(!user || user.role!=="admin") return NextResponse.json({error:"Forbidden"},{status:403});
  const reps=await query(`SELECT id, name FROM users WHERE role='sales_rep' ORDER BY name`);
  const out=[];
  for(const rep of reps.rows as Record<string,unknown>[]){
    const uid=String(rep.id);
    const plans=await query(`SELECT id, period_start, period_end, status FROM plans WHERE user_id=$1 ORDER BY period_start DESC LIMIT 5`,[uid]);
    let totalPlanned=0, totalDone=0;
    for(const p of plans.rows as Record<string,unknown>[]){
      const pid=String(p.id);
      const items=await query(`SELECT pi.doctor_id, pi.planned_date::text AS planned_date FROM plan_items pi WHERE pi.plan_id=$1`,[pid]);
      totalPlanned+=items.rows.length;
      for(const it of items.rows as Record<string,unknown>[]){
        const done=await query(`SELECT 1 FROM visits v WHERE v.doctor_id=$1 AND v.sales_rep_id=$2 AND date(v.visited_at)=$3 LIMIT 1`,[it.doctor_id, uid, it.planned_date]);
        if(done.rows.length) totalDone++;
      }
    }
    const adherence=totalPlanned? Math.round(totalDone/totalPlanned*100):0;
    out.push({ user_id:uid, name: rep.name, totalPlanned, totalDone, adherence, plans: plans.rows.length });
  }
  out.sort((a,b)=> a.adherence - b.adherence);
  return NextResponse.json({compliance: out});
}
