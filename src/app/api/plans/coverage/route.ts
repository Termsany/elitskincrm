import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { coverageMonthStart, resolveCoverageUserId } from "@/lib/plan-coverage";
export async function GET(req: Request){
  const user=await getCurrentUser(); if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const { searchParams }=new URL(req.url);
  const planId=searchParams.get("planId");
  const requestedUserId = searchParams.get("userId");
  const userId = resolveCoverageUserId(user, requestedUserId);
  if(user.role==="admin" && requestedUserId){
    const rep=await query(`SELECT id FROM users WHERE id=$1 AND role='sales_rep' AND active=true`,[userId]);
    if(!rep.rows[0]) return NextResponse.json({error:"المندوب غير موجود أو غير فعال"},{status:400});
  }
  // Frequencies
  const freqs=await query(`SELECT classification, visits_per_month FROM plan_frequencies`);
  const freqMap=new Map(freqs.rows.map((r:Record<string,unknown>)=> [String(r.classification), Number(r.visits_per_month)]));
  // All doctors grouped by classification
  const doctorsByClass=await query(`SELECT classification, count(*)::int cnt FROM doctors WHERE status='active' GROUP BY classification`);
  // If planId given: coverage of that plan
  if(planId){
    const plan=await query(`SELECT * FROM plans WHERE id=$1`,[planId]);
    if(!plan.rows[0]) return NextResponse.json({error:"Not found"},{status:404});
    const pr=plan.rows[0] as Record<string,unknown>;
    if(user.role!=="admin" && String(pr.user_id)!==user.id) return NextResponse.json({error:"Forbidden"},{status:403});
    const uid=String(pr.user_id);
    // Items in plan per classification
    const items=await query(`SELECT d.classification, count(*)::int cnt FROM plan_items pi JOIN doctors d ON d.id=pi.doctor_id WHERE pi.plan_id=$1 GROUP BY d.classification`,[planId]);
    const itemMap=new Map(items.rows.map((r:Record<string,unknown>)=> [String(r.classification)||"—", Number(r.cnt)]));
    // Execution: which planned were actually visited
    const exec=await query(`SELECT d.classification, count(*)::int done FROM plan_items pi JOIN doctors d ON d.id=pi.doctor_id WHERE pi.plan_id=$1 AND EXISTS(SELECT 1 FROM visits v WHERE v.doctor_id=pi.doctor_id AND v.sales_rep_id=$2 AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=pi.planned_date) GROUP BY d.classification`,[planId, uid]);
    const execMap=new Map(exec.rows.map((r:Record<string,unknown>)=> [String(r.classification)||"—", Number(r.done)]));
    const coverage=(["A","B","C"] as const).map(cls=>{
      const total=Number(freqMap.get(cls)||0);
      // Expected visits for this plan's period: if weekly, freq/4 ; if monthly, freq
      const isWeekly=String(pr.period)==="weekly";
      const expectedPerDoctor = isWeekly ? Math.ceil(total/4) : total;
      // Count doctors of this class
      const doctorsCnt=Number(doctorsByClass.rows.find((x:Record<string,unknown>)=> String(x.classification)===cls)?.cnt||0);
      const expected=doctorsCnt * expectedPerDoctor;
      const planned=Number(itemMap.get(cls)||0);
      const done=Number(execMap.get(cls)||0);
      return { classification:cls, freq:total, doctors:doctorsCnt, expected, planned, done, coverage: expected? Math.round(planned/expected*100):0, adherence: planned? Math.round(done/planned*100):0 };
    });
    return NextResponse.json({
      coverage,
      items: items.rows,
      exec: exec.rows,
      semantics:{scope:"plan", period:`${String(pr.period)} plan dates`, timezone:"Asia/Riyadh"},
    });
  }
  // No planId: coverage for the selected rep's current Riyadh calendar month.
  const uid=userId;
  const monthStart=coverageMonthStart();
  const allPlans=await query(`SELECT id FROM plans WHERE user_id=$1 AND status<>'rejected' AND period_start >= $2::date AND period_start < ($2::date + interval '1 month')`,[uid,monthStart]);
  const planIds=allPlans.rows.map((r:Record<string,unknown>)=> String(r.id));
  const plannedByClass=new Map<string,number>();
  if(planIds.length){
    const r=await query(`SELECT d.classification, count(*)::int cnt FROM plan_items pi JOIN doctors d ON d.id=pi.doctor_id WHERE pi.plan_id = ANY($1) GROUP BY d.classification`,[planIds]);
    for(const row of r.rows as Record<string,unknown>[]) plannedByClass.set(String(row.classification)||"—", Number(row.cnt));
  }
  const coverage=(["A","B","C"] as const).map(cls=>{
    const freq=Number(freqMap.get(cls)||0);
    const doctorsCnt=Number(doctorsByClass.rows.find((x:Record<string,unknown>)=> String(x.classification)===cls)?.cnt||0);
    const expected=doctorsCnt * freq;
    const planned=Number(plannedByClass.get(cls)||0);
    return { classification:cls, freq, doctors:doctorsCnt, expected, planned, coverage: expected? Math.round(planned/expected*100):0 };
  });
  return NextResponse.json({
    coverage,
    semantics:{scope:"selected representative", period:"current Riyadh calendar month", timezone:"Asia/Riyadh", month_start:monthStart},
  });
}
