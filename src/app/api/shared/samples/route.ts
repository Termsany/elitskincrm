import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const SHARED_KEY = process.env.SHARED_API_KEY;

export async function GET(req: Request) {
  const auth = req.headers.get("x-api-key");
  if (!SHARED_KEY || auth !== SHARED_KEY)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  const repName = url.searchParams.get("rep");
  if (!month) return NextResponse.json({ error: "month required" }, { status: 400 });

  const [y, m] = month.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  const rows = (await query<{
    rep_name: string; product_name: string; total_units: string;
    doctor_name: string; clinic_name: string;
  }>(
    `SELECT u.name as rep_name, p.name as product_name,
            SUM(vi.quantity)::int as total_units,
            d.name as doctor_name, COALESCE(c.name, d.clinic_name) as clinic_name
     FROM visit_items vi
     JOIN visits v ON v.id = vi.visit_id
     JOIN doctors d ON d.id = v.doctor_id
     LEFT JOIN clinics c ON c.id = d.clinic_id
     JOIN users u ON u.id = v.sales_rep_id
     LEFT JOIN products p ON p.id = vi.product_id
     WHERE vi.kind = 'sample'
       AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date >= $1::date
       AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date < $2::date
       ${repName ? "AND u.name = $3" : ""}
     GROUP BY u.name, p.name, d.name, c.name, d.clinic_name
     ORDER BY u.name, total_units DESC`,
    repName ? [from, to, repName] : [from, to]
  )).rows;

  type RepSummary = { rep_name: string; total_units: number; by_doctor: Array<{ doctor: string; clinic: string; product: string; units: number }> };
  const map = new Map<string, RepSummary>();
  for (const r of rows) {
    if (!map.has(r.rep_name)) map.set(r.rep_name, { rep_name: r.rep_name, total_units: 0, by_doctor: [] });
    const rep = map.get(r.rep_name)!;
    const units = Number(r.total_units);
    rep.total_units += units;
    rep.by_doctor.push({ doctor: r.doctor_name, clinic: r.clinic_name, product: r.product_name, units });
  }

  return NextResponse.json({ month, reps: [...map.values()] });
}
