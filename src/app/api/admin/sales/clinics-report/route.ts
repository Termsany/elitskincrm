import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { riyadhToday } from "@/lib/fmt";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role === "sales_rep")
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const month = sp.get("month") || riyadhToday().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  const [salesRows, sampleRows, balanceRows] = await Promise.all([
    query<{ clinic_id: string; clinic_name: string; rep_name: string; product_name: string; total_sales: string; total_units: string }>(
      `SELECT c.id as clinic_id, c.name as clinic_name,
              u.name as rep_name, p.name as product_name,
              SUM(s.value)::float8 as total_sales,
              SUM(s.quantity)::float8 as total_units
       FROM daftra_sales_v s
       JOIN clinics c ON c.daftra_client_id = s.client_id
                      OR EXISTS (SELECT 1 FROM daftra_client_links l WHERE l.clinic_id = c.id AND l.client_id = s.client_id)
                      OR EXISTS (SELECT 1 FROM daftra_client_branches b WHERE b.clinic_id = c.id AND b.client_id = s.client_id)
       LEFT JOIN users u ON u.id = s.rep_id
       LEFT JOIN products p ON p.id = s.product_id
       WHERE s.invoice_date >= $1::date AND s.invoice_date < $2::date
       GROUP BY c.id, c.name, u.name, p.name
       ORDER BY total_sales DESC`,
      [from, to]
    ),

    query<{ clinic_id: string; clinic_name: string; rep_name: string; product_name: string; total_units: string }>(
      `SELECT c.id as clinic_id, c.name as clinic_name,
              u.name as rep_name, p.name as product_name,
              SUM(vi.quantity)::int as total_units
       FROM visit_items vi
       JOIN visits v ON v.id = vi.visit_id
       JOIN doctors d ON d.id = v.doctor_id
       LEFT JOIN clinics c ON c.id = d.clinic_id
       JOIN users u ON u.id = v.sales_rep_id
       JOIN products p ON p.id = vi.product_id
       WHERE vi.kind = 'sample'
         AND v.visited_at >= $1::date AND v.visited_at < $2::date
       GROUP BY c.id, c.name, u.name, p.name
       ORDER BY total_units DESC`,
      [from, to]
    ),

    query<{ clinic_id: string; unpaid: string; overdue: string }>(
      `SELECT c.id as clinic_id,
              COALESCE(SUM(i.unpaid), 0)::float8 as unpaid,
              COALESCE(SUM(i.unpaid) FILTER (WHERE i.invoice_date + COALESCE(i.due_days,0) < $3::date), 0)::float8 as overdue
       FROM clinics c
       JOIN daftra_invoices i ON (i.client_id = c.daftra_client_id
         OR EXISTS (SELECT 1 FROM daftra_client_links l WHERE l.clinic_id = c.id AND l.client_id = i.client_id)
         OR EXISTS (SELECT 1 FROM daftra_client_branches b WHERE b.clinic_id = c.id AND b.client_id = i.client_id))
       WHERE i.unpaid > 0 AND i.payment_status IN (0,1)
       GROUP BY c.id`,
      [from, to, riyadhToday()]
    ),
  ]);

  type ClinicReport = {
    clinic_id: string; clinic_name: string;
    total_sales: number; total_units_sold: number;
    total_samples: number;
    unpaid: number; overdue: number;
    sales_by_rep: Array<{ rep: string; product: string; sales: number; units: number }>;
    samples_by_rep: Array<{ rep: string; product: string; units: number }>;
  };

  const map = new Map<string, ClinicReport>();
  const ensure = (id: string, name: string) => {
    if (!map.has(id)) map.set(id, { clinic_id: id, clinic_name: name, total_sales: 0, total_units_sold: 0, total_samples: 0, unpaid: 0, overdue: 0, sales_by_rep: [], samples_by_rep: [] });
    return map.get(id)!;
  };

  for (const r of salesRows.rows) {
    if (!r.clinic_id) continue;
    const c = ensure(r.clinic_id, r.clinic_name);
    const sales = Number(r.total_sales || 0);
    const units = Number(r.total_units || 0);
    c.total_sales += sales;
    c.total_units_sold += units;
    c.sales_by_rep.push({ rep: r.rep_name || "—", product: r.product_name || "—", sales: Math.round(sales), units: Math.round(units) });
  }

  for (const r of sampleRows.rows) {
    if (!r.clinic_id) continue;
    const c = ensure(r.clinic_id, r.clinic_name);
    const units = Number(r.total_units || 0);
    c.total_samples += units;
    c.samples_by_rep.push({ rep: r.rep_name || "—", product: r.product_name || "—", units });
  }

  for (const r of balanceRows.rows) {
    const c = map.get(r.clinic_id);
    if (c) { c.unpaid = Math.round(Number(r.unpaid)); c.overdue = Math.round(Number(r.overdue)); }
  }

  const clinics = [...map.values()]
    .map(c => ({ ...c, total_sales: Math.round(c.total_sales), total_units_sold: Math.round(c.total_units_sold) }))
    .sort((a, b) => b.total_sales - a.total_sales);

  const totals = {
    sales: clinics.reduce((s, c) => s + c.total_sales, 0),
    samples: clinics.reduce((s, c) => s + c.total_samples, 0),
    unpaid: clinics.reduce((s, c) => s + c.unpaid, 0),
    overdue: clinics.reduce((s, c) => s + c.overdue, 0),
  };

  return NextResponse.json({ month, clinics, totals });
}
