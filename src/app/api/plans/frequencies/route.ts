import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
export async function GET(){
  const user=await getCurrentUser(); if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const r=await query(`SELECT classification, visits_per_month FROM plan_frequencies ORDER BY classification`);
  return NextResponse.json({frequencies:r.rows});
}
export async function POST(req: Request){
  const user=await getCurrentUser(); if(!user || user.role!=="admin") return NextResponse.json({error:"Forbidden"},{status:403});
  const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
  const list=body?.frequencies as Array<{classification:string; visits_per_month:number}>|undefined;
  if(!list) return NextResponse.json({error:"Invalid"},{status:400});
  for(const f of list){
    await query(`INSERT INTO plan_frequencies(classification, visits_per_month) VALUES($1,$2) ON CONFLICT(classification) DO UPDATE SET visits_per_month=$2`,[String(f.classification).toUpperCase(), Number(f.visits_per_month)]);
  }
  return NextResponse.json({ok:true});
}
