import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const reps = await query(`
    SELECT u.id, u.name, u.email, u.active, p.name product_name,
      count(DISTINCT v.id)::int total_visits,
      count(DISTINCT v.id) FILTER (WHERE v.visited_at >= date_trunc('week', now()))::int weekly_visits,
      count(DISTINCT pl.id) FILTER (WHERE pl.status='pending')::int pending_plans,
      count(DISTINCT vi.id) FILTER (WHERE vi.kind='order' AND vi.approval_status='pending')::int pending_orders
    FROM users u
    LEFT JOIN products p ON p.id=u.assigned_product_id
    LEFT JOIN visits v ON v.sales_rep_id=u.id
    LEFT JOIN plans pl ON pl.user_id=u.id
    LEFT JOIN visit_items vi ON vi.visit_id=v.id
    WHERE u.role='sales_rep'
    GROUP BY u.id, p.name
    ORDER BY u.active DESC, u.name
  `);
  const orders = await query(`
    SELECT vi.id, vi.quantity, vi.created_at, p.name product_name, u.id rep_id, u.name rep_name, d.name doctor_name, d.clinic_name
    FROM visit_items vi JOIN visits v ON v.id=vi.visit_id JOIN users u ON u.id=v.sales_rep_id
    JOIN doctors d ON d.id=v.doctor_id JOIN products p ON p.id=vi.product_id
    WHERE vi.kind='order' AND vi.approval_status='pending'
    ORDER BY vi.created_at DESC LIMIT 20
  `);
  const pendingPlans = await query(`SELECT p.id, p.user_id rep_id, u.name rep_name, p.period_start, p.period_end, (SELECT count(*)::int FROM plan_items pi WHERE pi.plan_id=p.id) items_count FROM plans p JOIN users u ON u.id=p.user_id WHERE p.status='pending' ORDER BY p.created_at DESC LIMIT 20`);
  return NextResponse.json({ reps: reps.rows, pendingOrders: orders.rows, pendingPlans: pendingPlans.rows });
}
