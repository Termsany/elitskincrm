import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What a rep should know at the clinic door: doctor profile, history, open follow-ups, today's plan, what to present.
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("doctorId") || "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const doctor = (await query(`SELECT id, name, clinic_name, city, specialty, classification, phone,
      (SELECT visits_per_month FROM plan_frequencies f WHERE f.classification=d.classification) visits_per_month FROM doctors d WHERE id=$1`, [id])).rows[0];
  if (!doctor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const history = (await query(`SELECT v.id, v.visited_at, v.status::text status, v.notes, u.name rep_name, v.sales_rep_id=$2 mine,
      COALESCE((SELECT json_agg(json_build_object('product_id',pp.product_id,'name',p.name,'reaction',pp.reaction) ORDER BY p.name)
        FROM visit_presented_products pp JOIN products p ON p.id=pp.product_id WHERE pp.visit_id=v.id),'[]'::json) presented,
      COALESCE((SELECT sum(vi.quantity) FROM visit_items vi WHERE vi.visit_id=v.id AND vi.kind='sample'),0)::int samples
    FROM visits v JOIN users u ON u.id=v.sales_rep_id WHERE v.doctor_id=$1 ORDER BY v.visited_at DESC LIMIT 5`, [id, u.id])).rows;

  const followups = (await query(`SELECT * FROM (
      SELECT v.follow_up_at::text due, COALESCE(v.follow_up_note,'') note FROM visits v WHERE v.doctor_id=$1 AND v.sales_rep_id=$2 AND v.follow_up_at IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM visits v2 WHERE v2.doctor_id=v.doctor_id AND v2.sales_rep_id=v.sales_rep_id AND v2.visited_at>v.visited_at AND v2.status='completed')
      UNION ALL
      SELECT f.due_at::text, concat_ws(' — ', NULLIF(f.title,''), NULLIF(f.note,'')) FROM doctor_followups f WHERE f.doctor_id=$1 AND f.sales_rep_id=$2
        AND f.completed_at IS NULL AND COALESCE(f.status,'') NOT IN ('done','completed','closed')) x ORDER BY due LIMIT 5`, [id, u.id])).rows;

  const plan = (await query(`SELECT pi.id, pi.priority, COALESCE(pi.note,'') note, pi.product_id, pr.name product_name
    FROM plan_items pi JOIN plans p ON p.id=pi.plan_id LEFT JOIN products pr ON pr.id=pi.product_id
    WHERE p.user_id=$2 AND pi.doctor_id=$1 AND p.status::text<>'rejected' AND pi.planned_date=(now() AT TIME ZONE 'Asia/Riyadh')::date LIMIT 1`, [id, u.id])).rows[0] || null;

  // Suggest: planned product → assigned product → products the doctor liked → never presented to this doctor
  const liked = (await query<{ product_id: string }>(`SELECT pp.product_id, max(v.visited_at) last FROM visit_presented_products pp JOIN visits v ON v.id=pp.visit_id
    WHERE v.doctor_id=$1 AND pp.reaction='interested' GROUP BY 1 ORDER BY last DESC`, [id])).rows.map(r => r.product_id);
  const seen = new Set(history.flatMap((h: Record<string, unknown>) => (h.presented as Array<{ product_id: string }>).map(p => p.product_id)));
  const active = (await query<{ id: string }>("SELECT id FROM products WHERE active ORDER BY sort_order, name")).rows.map(r => r.id);
  const order = [plan?.product_id, u.assigned_product_id, ...liked, ...active.filter(p => !seen.has(p))].filter((x): x is string => !!x && active.includes(x));
  const suggested = [...new Set(order)].slice(0, 3);

  const last = history[0] as Record<string, unknown> | undefined;
  const daysSince = last ? Math.floor((Date.now() - new Date(String(last.visited_at)).getTime()) / 864e5) : null;
  return NextResponse.json({ doctor, history, followups, plan, suggested, daysSince });
}
