import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
export async function GET(req: Request){
  const user = await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || new Date().toISOString().slice(0,10);
  const repId = searchParams.get("repId");
  const conds:string[]=[]; const vals:unknown[]=[]; let i=1;
  conds.push(`date(v.visited_at) = $${i++}`); vals.push(date);
  if(user.role!=="admin"){
    conds.push(`v.sales_rep_id=$${i++}`); vals.push(user.id);
  } else if(repId){
    conds.push(`v.sales_rep_id=$${i++}`); vals.push(repId);
  }
  const where = `WHERE ${conds.join(" AND ")}`;
  const r = await query(`
    SELECT v.id, v.visited_at, v.lat, v.lng, v.accuracy_m, u.name rep_name, d.name doctor_name, d.clinic_name
    FROM visits v JOIN users u ON u.id=v.sales_rep_id JOIN doctors d ON d.id=v.doctor_id
    ${where} ORDER BY v.visited_at`, vals);
  return NextResponse.json({ visits: r.rows, date });
}
