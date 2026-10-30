import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { riyadhNow } from "@/lib/forecast-contract";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
 const admin = await getCurrentUser();
 if (!admin || admin.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 const { id } = await params;
 const year = Number(riyadhNow().month.slice(0, 4));
 const start = `${year}-01-01`, end = `${year + 1}-01-01`;
 const rep = await query(`SELECT u.id,u.name,u.email,u.job_title,u.university,u.hire_date,u.iqama_expiry,u.salary,u.active,
  COALESCE(y.annual_amount,0)::numeric AS annual_sales_target,
  COALESCE((SELECT sum(CASE WHEN s.kind='return' OR s.direction=-1 THEN -s.quantity * s.unit_price ELSE s.quantity * s.unit_price END)
    FROM forecast_sales s WHERE s.rep_id=u.id AND s.status='approved' AND s.month >= $3::date AND s.month < $4::date),0)::numeric AS annual_sales,
  COALESCE((SELECT json_agg(rp.product_id) FROM rep_products rp WHERE rp.rep_id=u.id),'[]') products
  FROM users u LEFT JOIN rep_target_years y ON y.rep_id=u.id AND y.year=$2
  WHERE u.id=$1 AND u.role='sales_rep'`, [id,year,start,end]);
 if (!rep.rows[0]) return NextResponse.json({ error: "المندوب غير موجود" }, { status: 404 });
 const sales = await query(`SELECT s.id,s.month::text AS sale_month,s.month::text AS month,s.clinic_id,s.product_id,
  c.name AS clinic_name,p.name AS product_name,s.quantity,s.unit_price,s.kind,s.direction,s.source_sale_id,s.reason,s.status,s.reviewed_at,
  CASE WHEN s.kind='return' OR s.direction=-1 THEN -s.quantity * s.unit_price ELSE s.quantity * s.unit_price END AS amount
  FROM forecast_sales s LEFT JOIN clinics c ON c.id=s.clinic_id LEFT JOIN products p ON p.id=s.product_id
  WHERE s.rep_id=$1 AND s.status='approved' ORDER BY s.month DESC,s.reviewed_at DESC`, [id]);
 return NextResponse.json({ rep: rep.rows[0], sales: sales.rows });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
 const admin = await getCurrentUser();
 if (!admin || admin.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 const { id } = await params;
 const d = await req.json().catch(() => null);
 if (!d || typeof d.name !== 'string' || !d.name.trim() || typeof d.annual_sales_target !== 'number' ||
     !Number.isFinite(d.annual_sales_target) || d.annual_sales_target < 0 || d.annual_sales_target > 9999999999 ||
     Math.abs(d.annual_sales_target * 100 - Math.round(d.annual_sales_target * 100)) > 1e-7)
  return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
 const client = await pool.connect();
 try {
  await client.query("BEGIN");
  const rep = await client.query("SELECT id FROM users WHERE id=$1 AND role='sales_rep' FOR UPDATE", [id]);
  if (!rep.rows[0]) { await client.query("ROLLBACK"); return NextResponse.json({ error: "المندوب غير موجود" }, { status: 404 }); }
  const year = Number(riyadhNow().month.slice(0, 4));
  const annual = await client.query("SELECT annual_amount FROM rep_target_years WHERE rep_id=$1 AND year=$2 FOR UPDATE", [id,year]);
  if (Number(annual.rows[0]?.annual_amount ?? 0) !== d.annual_sales_target) {
   const versions = await client.query("SELECT count(*)::int AS count FROM rep_target_versions WHERE rep_id=$1 AND year=$2 AND level='annual' AND status IN ('pending','approved')", [id,year]);
   if (Number(versions.rows[0]?.count || 0) > 0) { await client.query("ROLLBACK"); return NextResponse.json({ error: "التوزيع المقدم أو المعتمد يمنع تغيير الهدف السنوي" }, { status: 409 }); }
   const overrides = await client.query("SELECT COALESCE(sum(amount),0)::numeric AS amount FROM rep_target_overrides WHERE rep_id=$1 AND year=$2", [id,year]);
   if (Number(overrides.rows[0]?.amount || 0) > d.annual_sales_target) { await client.query("ROLLBACK"); return NextResponse.json({ error: "الهدف أقل من التخصيصات الشهرية" }, { status: 409 }); }
   await client.query(`INSERT INTO rep_target_years(rep_id,year,annual_amount,set_by) VALUES($1,$2,$3,$4)
    ON CONFLICT(rep_id,year) DO UPDATE SET annual_amount=$3,set_by=$4,updated_at=now()`, [id,year,d.annual_sales_target,admin.id]);
  }
  await client.query(`UPDATE users SET name=$1,university=$2,hire_date=$3,iqama_expiry=$4,salary=$5,annual_sales_target=$6 WHERE id=$7 AND role='sales_rep'`,
   [d.name,d.university||"",d.hire_date||null,d.iqama_expiry||null,Number(d.salary)||0,d.annual_sales_target,id]);
  await client.query("DELETE FROM rep_products WHERE rep_id=$1", [id]);
  for (const pid of Array.isArray(d.product_ids) ? d.product_ids : [])
   await client.query("INSERT INTO rep_products(rep_id,product_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [id,pid]);
  await client.query("COMMIT");
  return NextResponse.json({ ok: true });
 } catch {
  await client.query("ROLLBACK");
  return NextResponse.json({ error: "تعذر حفظ بيانات المندوب" }, { status: 400 });
 } finally { client.release(); }
}
