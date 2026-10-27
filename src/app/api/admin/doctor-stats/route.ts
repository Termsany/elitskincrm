import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
export async function GET(){
  const user = await getCurrentUser();
  if(!user || user.role!=="admin") return NextResponse.json({error:"Forbidden"},{status:403});
  const r = await query(`
    SELECT d.id, d.name, d.clinic_name, d.city, d.specialty, d.classification, d.phone,
           count(v.id)::int visits,
           count(vi.id) FILTER (WHERE vi.kind='sample')::int samples,
           count(vi.id) FILTER (WHERE vi.kind='order')::int orders,
           max(v.visited_at) last_visit
    FROM doctors d
    LEFT JOIN visits v ON v.doctor_id=d.id
    LEFT JOIN visit_items vi ON vi.visit_id=v.id
    GROUP BY d.id
    ORDER BY visits DESC, d.name
    LIMIT 500
  `);
  const withNotes = await query(`
    SELECT d.id, string_agg(DISTINCT v.notes, ' | ') recent_notes
    FROM doctors d JOIN visits v ON v.doctor_id=d.id
    GROUP BY d.id
  `);
  const notesMap = new Map(withNotes.rows.map((x:Record<string,unknown>)=> [x.id, x.recent_notes]));
  const out = r.rows.map((x:Record<string,unknown>)=> ({...x, recent_notes: String(notesMap.get(x.id)||"").slice(0,300)}));
  return NextResponse.json({ doctors: out });
}
