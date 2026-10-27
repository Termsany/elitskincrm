import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const repId = searchParams.get("repId");
  const status = searchParams.get("status");
  const conds = ["vi.kind='order'"]; const vals: unknown[]=[]; let i=1;
  if (repId) { conds.push(`v.sales_rep_id=$${i++}`); vals.push(repId); }
  if (status) { conds.push(`vi.approval_status=$${i++}`); vals.push(status); }
  const rows = await query(`
    SELECT vi.id, vi.quantity, vi.approval_status, vi.approval_note, vi.created_at, vi.approved_at,
      p.name product_name, v.id visit_id, v.visited_at, u.id rep_id, u.name rep_name,
      d.name doctor_name, d.clinic_name, a.name approved_by_name
    FROM visit_items vi
    JOIN visits v ON v.id=vi.visit_id
    JOIN users u ON u.id=v.sales_rep_id
    JOIN doctors d ON d.id=v.doctor_id
    JOIN products p ON p.id=vi.product_id
    LEFT JOIN users a ON a.id=vi.approved_by
    WHERE ${conds.join(" AND ")}
    ORDER BY CASE vi.approval_status WHEN 'pending' THEN 0 ELSE 1 END, vi.created_at DESC
    LIMIT 200
  `, vals);
  return NextResponse.json({ orders: rows.rows });
}
