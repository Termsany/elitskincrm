import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
export async function GET(){
  const user = await getCurrentUser();
  if(!user) return NextResponse.json({count:0});
  if(user.role==="admin") return NextResponse.json({count:0});
  const r = await query(`
    SELECT count(*)::int cnt FROM (
      SELECT d.id FROM doctors d JOIN visits v ON v.doctor_id=d.id AND v.sales_rep_id=$1
      GROUP BY d.id HAVING max(v.visited_at) < now() - make_interval(days => 10)
    ) s
  `, [user.id]);
  return NextResponse.json({count: r.rows[0].cnt});
}
