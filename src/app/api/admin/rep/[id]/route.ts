import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const rep = await query("SELECT u.id, u.name, u.email, u.role, u.assigned_product_id, p.name product_name FROM users u LEFT JOIN products p ON p.id=u.assigned_product_id WHERE u.id=$1", [id]);
  if (!rep.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const visits = await query(
    `SELECT v.id, v.visited_at, v.notes, v.status, d.name doctor_name, d.clinic_name, d.city,
            COALESCE(json_agg(json_build_object('product_name', p.name, 'kind', vi.kind, 'quantity', vi.quantity) ORDER BY vi.kind) FILTER (WHERE vi.id IS NOT NULL), '[]'::json) items
     FROM visits v JOIN doctors d ON d.id=v.doctor_id LEFT JOIN visit_items vi ON vi.visit_id=v.id LEFT JOIN products p ON p.id=vi.product_id
     WHERE v.sales_rep_id=$1 GROUP BY v.id, d.name, d.clinic_name, d.city ORDER BY v.visited_at DESC`,
    [id]
  );
  const doctorAgg = await query(
    `SELECT d.id doctor_id, d.name doctor_name, d.clinic_name, count(v.id)::int cnt, max(v.visited_at) last_visit
     FROM visits v JOIN doctors d ON d.id=v.doctor_id WHERE v.sales_rep_id=$1 GROUP BY d.id, d.name, d.clinic_name ORDER BY cnt DESC`,
    [id]
  );
  const weekly = await query("SELECT count(*)::int cnt FROM visits WHERE sales_rep_id=$1 AND visited_at >= date_trunc('week', now())", [id]);
  const monthly = await query("SELECT count(*)::int cnt FROM visits WHERE sales_rep_id=$1 AND visited_at >= date_trunc('month', now())", [id]);
  const yearly = await query("SELECT count(*)::int cnt FROM visits WHERE sales_rep_id=$1 AND visited_at >= date_trunc('year', now())", [id]);
  const plans = await query(
    `SELECT p.id,p.period_start,p.period_end,p.status,p.admin_note,p.created_at,p.approved_at,
       COALESCE(json_agg(json_build_object('id',pi.id,'planned_date',pi.planned_date,'doctor_name',d.name,'clinic_name',d.clinic_name) ORDER BY pi.planned_date) FILTER(WHERE pi.id IS NOT NULL),'[]'::json) items
     FROM plans p LEFT JOIN plan_items pi ON pi.plan_id=p.id LEFT JOIN doctors d ON d.id=pi.doctor_id
     WHERE p.user_id=$1 GROUP BY p.id ORDER BY p.period_start DESC LIMIT 20`, [id]);
  const orders = await query(
    `SELECT vi.id,vi.quantity,vi.approval_status,vi.approval_note,vi.created_at,vi.approved_at,p.name product_name,
       v.id visit_id,v.visited_at,d.name doctor_name,d.clinic_name,a.name approved_by_name
     FROM visit_items vi JOIN visits v ON v.id=vi.visit_id JOIN products p ON p.id=vi.product_id JOIN doctors d ON d.id=v.doctor_id
     LEFT JOIN users a ON a.id=vi.approved_by WHERE v.sales_rep_id=$1 AND vi.kind='order'
     ORDER BY CASE vi.approval_status WHEN 'pending' THEN 0 ELSE 1 END,vi.created_at DESC LIMIT 100`, [id]);
  return NextResponse.json({ rep: rep.rows[0], visits: visits.rows, doctorAgg: doctorAgg.rows, plans: plans.rows, orders: orders.rows, counts: { weekly: weekly.rows[0].cnt, monthly: monthly.rows[0].cnt, yearly: yearly.rows[0].cnt, total: visits.rows.length } });
}
