import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const [clinic, doctors, products, recentVisits] = await Promise.all([
    query<{ name: string; city: string }>("SELECT name, COALESCE(city,'') city FROM clinics WHERE id=$1", [id]),
    query<{ name: string; classification: string; visits: number; last_visit: string | null }>(
      `SELECT d.name, COALESCE(d.classification,'—') classification,
        (SELECT count(*)::int FROM visits v WHERE v.doctor_id=d.id AND v.status::text IN ('completed','follow_up') AND v.visited_at > now()-interval '6 months') visits,
        (SELECT max((v2.visited_at AT TIME ZONE 'Asia/Riyadh')::date)::text FROM visits v2 WHERE v2.doctor_id=d.id AND v2.status::text IN ('completed','follow_up')) last_visit
      FROM doctors d WHERE d.clinic_id=$1 AND d.status='active' ORDER BY d.classification, d.name`, [id]),
    query<{ product: string; presented: number; interested: number; sampled: number }>(
      `SELECT p.name product, count(pp.id)::int presented,
        count(pp.id) FILTER (WHERE pp.reaction='interested')::int interested,
        COALESCE((SELECT sum(vi.quantity)::int FROM visit_items vi JOIN visits v2 ON v2.id=vi.visit_id JOIN doctors d2 ON d2.id=v2.doctor_id WHERE d2.clinic_id=$1 AND vi.product_id=p.id AND vi.kind='sample' AND v2.visited_at > now()-interval '6 months'),0) sampled
      FROM visit_presented_products pp JOIN visits v ON v.id=pp.visit_id JOIN doctors d ON d.id=v.doctor_id JOIN products p ON p.id=pp.product_id
      WHERE d.clinic_id=$1 AND v.visited_at > now()-interval '6 months'
      GROUP BY p.name ORDER BY presented DESC`, [id]),
    query<{ date: string; doctor: string; rep: string; status: string; notes: string }>(
      `SELECT (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date::text date, d.name doctor, u.name rep, v.status::text status, COALESCE(v.notes,'') notes
      FROM visits v JOIN doctors d ON d.id=v.doctor_id JOIN users u ON u.id=v.sales_rep_id
      WHERE d.clinic_id=$1 ORDER BY v.visited_at DESC LIMIT 20`, [id]),
  ]);

  const c = clinic.rows[0];
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ name: c.name, city: c.city, doctors: doctors.rows, products: products.rows, recentVisits: recentVisits.rows });
}
