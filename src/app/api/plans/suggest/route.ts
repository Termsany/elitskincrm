import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

const DEFAULT_FREQUENCIES: Record<string, number> = { A: 3, B: 3, C: 2 };
const CLASS_RANK: Record<string, number> = { A: 0, B: 1, C: 2 };

type Candidate = Record<string, unknown> & {
  city: string;
  clinic_name: string;
  classification: string;
  remaining_visits: number;
  score: number;
};

export async function GET(req: Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const { searchParams }=new URL(req.url);
  const period=searchParams.get("period")||"weekly";
  const start=searchParams.get("start")||new Date().toISOString().slice(0,10);
  const end=searchParams.get("end")||start;
  const target=Math.max(1, Math.min(50, Number(searchParams.get("target")||10)));
  const focusCity=String(searchParams.get("focusCity")||"");
  const focusClinic=String(searchParams.get("focusClinic")||"");

  const freqs=await query(`SELECT classification, visits_per_month FROM plan_frequencies`);
  const freqMap={...DEFAULT_FREQUENCIES};
  for(const row of freqs.rows as Record<string,unknown>[]){
    const cls=String(row.classification||"").toUpperCase();
    if(cls) freqMap[cls]=Math.max(0, Number(row.visits_per_month)||0);
  }

  const rows=await query(`
    SELECT d.id, d.name, d.clinic_name, d.city, d.classification,
      max(v.visited_at) last_visit,
      count(v.id) FILTER (WHERE v.visited_at >= date_trunc('month', $2::date)
        AND v.visited_at < date_trunc('month', $2::date) + interval '1 month')::int month_visits,
      (
        SELECT count(*)::int FROM plan_items pi JOIN plans p ON p.id=pi.plan_id
        WHERE p.user_id=$1 AND pi.doctor_id=d.id AND p.status<>'rejected'
          AND pi.planned_date >= date_trunc('month', $2::date)::date
          AND pi.planned_date < (date_trunc('month', $2::date) + interval '1 month')::date
      ) planned_visits
    FROM doctors d
    LEFT JOIN visits v ON v.doctor_id=d.id AND v.sales_rep_id=$1
    WHERE d.status='active'
    GROUP BY d.id
  `,[user.id,start]);

  const now=Date.now();
  const candidates:Candidate[]=(rows.rows as Record<string,unknown>[]).map(row=>{
    const classification=String(row.classification||"").toUpperCase();
    const monthlyGoal=freqMap[classification]||0;
    const monthVisits=Number(row.month_visits)||0;
    const plannedVisits=Number(row.planned_visits)||0;
    const remaining=Math.max(0, monthlyGoal-monthVisits-plannedVisits);
    const lastVisit=row.last_visit ? new Date(String(row.last_visit)).getTime() : 0;
    const daysSince=lastVisit ? Math.max(0, (now-lastVisit)/86400000) : 9999;
    return {...row, city:String(row.city||"بدون منطقة"), clinic_name:String(row.clinic_name||"بدون عيادة"), classification, monthly_goal:monthlyGoal, remaining_visits:remaining, suggested_visits:remaining>0?1:0, score:Math.min(120,Math.round(daysSince/2))+(lastVisit?0:120)} as Candidate;
  });

  // Route priority: same focus area, same clinic, then Class A/B/C, then remaining coverage need.
  const groups=new Map<string,Candidate[]>();
  for(const candidate of candidates){
    const key=`${candidate.city}::${candidate.clinic_name}`;
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key)!.push(candidate);
  }
  const groupRows=[...groups.values()].map(group=>({
    group,
    city:group[0].city,
    clinic:group[0].clinic_name,
    need:group.reduce((sum,row)=>sum+row.remaining_visits,0),
    bestClass:Math.min(...group.map(row=>CLASS_RANK[row.classification]??3)),
  })).sort((a,b)=>
    Number(b.city===focusCity)-Number(a.city===focusCity) ||
    Number(b.clinic===focusClinic)-Number(a.clinic===focusClinic) ||
    b.need-a.need || a.bestClass-b.bestClass || a.city.localeCompare(b.city,"ar") || a.clinic.localeCompare(b.clinic,"ar")
  );
  const ordered=groupRows.flatMap(({group})=>group.sort((a,b)=>(CLASS_RANK[a.classification]??3)-(CLASS_RANK[b.classification]??3)||b.remaining_visits-a.remaining_visits||b.score-a.score||String(a.name||"").localeCompare(String(b.name||""),"ar")));
  const needed=ordered.filter(row=>row.remaining_visits>0);
  const rest=ordered.filter(row=>row.remaining_visits<=0);
  const selected=[...needed,...rest].slice(0,target).map((row,index)=>({...row,rank:index+1}));
  return NextResponse.json({suggestions:selected,meta:{target,period,start,end,focusCity,focusClinic,frequencies:freqMap,selected:selected.length}});
}
