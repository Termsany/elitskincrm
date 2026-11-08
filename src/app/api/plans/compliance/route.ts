import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

/** Plan adherence per rep over their last 5 plans: planned visits up to today vs. visits logged on the planned Riyadh day. One query. */
export async function GET(){
  const user=await getCurrentUser(); if(!user || user.role!=="admin") return NextResponse.json({error:"Forbidden"},{status:403});
  const r=await query<{ user_id: string; name: string; totalPlanned: number; totalDone: number; plans: number }>(`
    SELECT u.id user_id, u.name, count(pi.id)::int "totalPlanned",
      count(pi.id) FILTER (WHERE EXISTS (SELECT 1 FROM visits v WHERE v.doctor_id=pi.doctor_id AND v.sales_rep_id=u.id AND v.status::text<>'cancelled'
        AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=pi.planned_date))::int "totalDone",
      count(DISTINCT p.id)::int plans
    FROM users u
    LEFT JOIN LATERAL (SELECT id FROM plans WHERE user_id=u.id ORDER BY period_start DESC LIMIT 5) p ON true
    LEFT JOIN plan_items pi ON pi.plan_id=p.id AND pi.planned_date <= (now() AT TIME ZONE 'Asia/Riyadh')::date
    WHERE u.role='sales_rep' GROUP BY u.id, u.name`);
  const out=r.rows.map(x=>({ ...x, adherence: x.totalPlanned ? Math.round(x.totalDone/x.totalPlanned*100) : 0 }));
  out.sort((a,b)=> a.adherence - b.adherence);
  return NextResponse.json({compliance: out});
}
