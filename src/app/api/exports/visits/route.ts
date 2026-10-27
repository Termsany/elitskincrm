import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

function csvEscape(v: unknown){ const s=String(v??""); return `"${s.replace(/"/g,'""')}"`; }

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "csv"; // csv | json
  const repId = searchParams.get("repId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const status = searchParams.get("status");
  const q = (searchParams.get("q") || "").trim();

  const conds:string[]=[]; const vals:unknown[]=[]; let i=1;
  if (repId) { conds.push(`v.sales_rep_id=$${i++}`); vals.push(repId); }
  if (from) { conds.push(`v.visited_at >= $${i++}`); vals.push(new Date(from)); }
  if (to) { conds.push(`v.visited_at <= $${i++}`); vals.push(new Date(to)); }
  if (status) { conds.push(`v.status=$${i++}`); vals.push(status); }
  if (q) { conds.push(`(d.name ILIKE $${i} OR d.clinic_name ILIKE $${i} OR v.notes ILIKE $${i})`); vals.push(`%${q}%`); i++; }
  const where = conds.length? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await query(
    `SELECT v.id, v.visited_at, v.notes, v.status, u.name rep_name, d.name doctor_name, d.clinic_name, d.city, d.specialty,
            COALESCE(string_agg(p.name || ' (' || vi.kind || ' x' || vi.quantity || ')', ', ' ORDER BY vi.kind) FILTER (WHERE vi.id IS NOT NULL), '') items
     FROM visits v JOIN users u ON u.id=v.sales_rep_id JOIN doctors d ON d.id=v.doctor_id
     LEFT JOIN visit_items vi ON vi.visit_id=v.id LEFT JOIN products p ON p.id=vi.product_id
     ${where} GROUP BY v.id, u.name, d.name, d.clinic_name, d.city, d.specialty ORDER BY v.visited_at DESC`, vals
  );

  if (format === "json") return NextResponse.json({ visits: rows.rows });

  // CSV with BOM for Excel Arabic
  const header = ["التاريخ","المندوب","الطبيب","العيادة","المدينة","التخصص","الحالة","الملاحظات","العينات/الأوردرات"].map(csvEscape).join(",");
  const lines = rows.rows.map((r: Record<string,unknown>)=>[
    r.visited_at ? new Date(r.visited_at as string).toLocaleString("ar-EG") : "",
    r.rep_name, r.doctor_name, r.clinic_name, r.city, r.specialty, r.status, r.notes, r.items
  ].map(csvEscape).join(","));
  const csv = "\uFEFF" + [header, ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="visits-${new Date().toISOString().slice(0,10)}.csv"`,
    }
  });
}
