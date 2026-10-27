import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const city = searchParams.get("city");
  const isRep = user.role !== "admin";

  // Build visit filter
  const visitConds: string[] = [];
  const visitVals: unknown[] = [];
  let vi = 1;
  if (isRep) { visitConds.push(`v.sales_rep_id = $${vi++}`); visitVals.push(user.id); }
  if (from) { visitConds.push(`v.visited_at >= $${vi++}`); visitVals.push(new Date(from)); }
  if (to) { visitConds.push(`v.visited_at <= $${vi++}`); visitVals.push(new Date(to)); }
  if (city) { visitConds.push(`d.city = $${vi++}`); visitVals.push(city); }
  const visitWhere = visitConds.length ? `WHERE ${visitConds.join(" AND ")}` : "";

  // Total visits (filtered)
  const joinCityForVisits = city ? "JOIN doctors d ON d.id=v.doctor_id" : "";
  const totalVisitsR = city
    ? await query<{count:string}>(`SELECT count(*)::text count FROM visits v JOIN doctors d ON d.id=v.doctor_id WHERE ${visitConds.join(" AND ")}`, visitVals)
    : isRep || from || to
      ? await query<{count:string}>(`SELECT count(*)::text count FROM visits v ${visitWhere}`, visitVals)
      : await query<{count:string}>(`SELECT count(*)::text count FROM visits v`, []);
  // Simpler: above branch already handles all, keep one
  void joinCityForVisits;

  const totalDoctorsR = await query<{count:string}>(`SELECT count(*)::text count FROM doctors`);

  // Orders filtered
  let ordersCount = "0";
  {
    const conds: string[] = ["vi.kind='order'"];
    const vals: unknown[] = [];
    let j = 1;
    if (isRep) { conds.push(`v.sales_rep_id = $${j++}`); vals.push(user.id); }
    if (from) { conds.push(`v.visited_at >= $${j++}`); vals.push(new Date(from)); }
    if (to) { conds.push(`v.visited_at <= $${j++}`); vals.push(new Date(to)); }
    if (city) { conds.push(`d.city = $${j++}`); vals.push(city); }
    const cityJoin = city ? "JOIN doctors d ON d.id=v.doctor_id" : "";
    const q = `SELECT count(*)::text count FROM visit_items vi JOIN visits v ON v.id=vi.visit_id ${cityJoin} WHERE ${conds.join(" AND ")}`;
    const r = await query<{count:string}>(q, vals);
    ordersCount = r.rows[0].count;
  }

  // Performance per rep (filtered visits only)
  const perfVals: unknown[] = [];
  let pj = 1;
  let dateFilter = "";
  if (from) { dateFilter += ` AND v.visited_at >= $${pj++}`; perfVals.push(new Date(from)); }
  if (to) { dateFilter += ` AND v.visited_at <= $${pj++}`; perfVals.push(new Date(to)); }
  if (city) { dateFilter += ` AND d.city = $${pj++}`; perfVals.push(city); }
  const cityJ = city ? "JOIN doctors d ON d.id=v.doctor_id" : "";
  const perfWhere2 = isRep ? `WHERE u.id = $${pj++}` : `WHERE u.role='sales_rep' AND u.active=true`;
  if (isRep) perfVals.push(user.id);
  const perf = await query(`
    SELECT u.name rep_name, p.name product_name, COALESCE(t.target_value,0)::int target_value, COUNT(v.id)::int achieved, u.id rep_id
    FROM users u LEFT JOIN products p ON p.id=u.assigned_product_id
    LEFT JOIN targets t ON t.user_id=u.id AND t.product_id=p.id
    LEFT JOIN visits v ON v.sales_rep_id=u.id ${cityJ} ${dateFilter}
    ${perfWhere2}
    GROUP BY u.id, u.name, p.name, t.target_value ORDER BY u.name
  `, perfVals);

  // Heatmap / city breakdown / recent with same filters
  const heatmap = await query(`
    SELECT date_trunc('week', v.visited_at)::date wk, u.name rep_name, count(*)::int cnt
    FROM visits v JOIN users u ON u.id=v.sales_rep_id ${city ? "JOIN doctors d ON d.id=v.doctor_id" : ""}
    ${visitWhere} GROUP BY wk, u.name ORDER BY wk DESC LIMIT 40
  `, visitVals);

  const cityBreakdown = await query(`
    SELECT d.city, count(v.id)::int cnt FROM visits v JOIN doctors d ON d.id=v.doctor_id
    ${visitWhere} GROUP BY d.city ORDER BY cnt DESC
  `, visitVals);

  const recent = await query(`
    SELECT v.id, v.visited_at, v.status, u.name rep_name, d.name doctor_name, d.clinic_name, d.city
    FROM visits v JOIN users u ON u.id=v.sales_rep_id JOIN doctors d ON d.id=v.doctor_id
    ${visitWhere} ORDER BY v.visited_at DESC LIMIT 8
  `, visitVals);

  return NextResponse.json({
    kpis: {
      visits: parseInt(totalVisitsR.rows[0].count, 10),
      doctors: parseInt(totalDoctorsR.rows[0].count, 10),
      orders: parseInt(ordersCount, 10),
      reps: perf.rows.length,
    },
    performance: perf.rows,
    heatmap: heatmap.rows,
    cityBreakdown: cityBreakdown.rows,
    recent: recent.rows,
  });
}
