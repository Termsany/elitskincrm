import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE, riyadhToday } from "@/lib/fmt";
import { rankedDoctors } from "@/lib/doctor-suggest";

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

  const repParam=searchParams.get("repId")||"";
  const owner=user.role==="admin" && UUID_RE.test(repParam) ? repParam : user.id;
  const ranked=(await rankedDoctors(owner, riyadhToday())).filter(d=>!d.paused);
  const candidates:Candidate[]=ranked.map(d=>({ id:d.id, name:d.name, clinic_name:String(d.clinic_name||"بدون عيادة"), city:String(d.city||"بدون منطقة"), classification:String(d.classification||"").toUpperCase(),
    last_visit:d.last_visit, monthly_goal:freqMap[String(d.classification||"").toUpperCase()]||0, remaining_visits:d.prio.score>=20?1:0, suggested_visits:d.prio.score>=20?1:0, score:d.prio.score, reason:d.prio.reason } as Candidate));

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
    need:group.reduce((sum,row)=>sum+row.score,0),
    bestClass:Math.min(...group.map(row=>CLASS_RANK[row.classification]??3)),
  })).sort((a,b)=>
    Number(b.city===focusCity)-Number(a.city===focusCity) ||
    Number(b.clinic===focusClinic)-Number(a.clinic===focusClinic) ||
    b.need-a.need || a.bestClass-b.bestClass || a.city.localeCompare(b.city,"ar") || a.clinic.localeCompare(b.clinic,"ar")
  );
  const ordered=groupRows.flatMap(({group})=>group.sort((a,b)=>b.score-a.score||(CLASS_RANK[a.classification]??3)-(CLASS_RANK[b.classification]??3)||String(a.name||"").localeCompare(String(b.name||""),"ar")));
  const needed=ordered.filter(row=>row.remaining_visits>0);
  const rest=ordered.filter(row=>row.remaining_visits<=0);
  const selected=[...needed,...rest].slice(0,target).map((row,index)=>({...row,rank:index+1}));
  return NextResponse.json({suggestions:selected,meta:{target,period,start,end,focusCity,focusClinic,frequencies:freqMap,selected:selected.length}});
}
