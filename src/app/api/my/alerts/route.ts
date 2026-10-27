import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
export async function GET(){
  const user = await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const days = 10;
  // Doctors this rep has visited, but last visit >10 days ago OR never revisited after first
  // Actually: all doctors where this rep's last visit is >10 days
  const r = await query(`
    SELECT d.id, d.name, d.clinic_name, d.city, d.phone, max(v.visited_at) last_visit, count(v.id)::int cnt
    FROM doctors d
    JOIN visits v ON v.doctor_id=d.id AND v.sales_rep_id=$1
    GROUP BY d.id
    HAVING max(v.visited_at) < now() - make_interval(days => ${days})
    ORDER BY last_visit ASC
    LIMIT 50
  `, [user.id]);
  // Also: doctors never visited by this rep (optional — show as suggestion)
  const never = await query(`
    SELECT d.id, d.name, d.clinic_name, d.city FROM doctors d
    WHERE NOT EXISTS (SELECT 1 FROM visits v WHERE v.doctor_id=d.id AND v.sales_rep_id=$1)
    ORDER BY d.name LIMIT 20
  `, [user.id]);
  return NextResponse.json({ stale: r.rows, neverVisited: never.rows, days });
}
