import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { riyadhToday } from "@/lib/fmt";

const FINANCE_URL = process.env.FINANCE_APP_URL || "https://finance.eliteskinsa.com";
const SHARED_KEY = process.env.SHARED_API_KEY;

type DoctorSample = { doctor_id: string; doctor_name: string; clinic_name: string; product_name: string; total_units: number };
type RepSpend = {
  rep_name: string; product_name: string | null;
  sample_pct: number; promo_pct: number;
  samples: { budget_units: number; used_units: number; used_cost: number; remaining_units: number };
  promo: { budget_amount: number; used_amount: number; remaining_amount: number; by_type: Record<string, number>; details?: Array<{ date: string; type: string; amount: number; place: string; doctors: string[]; desc: string }> };
  prev_month: { units: number; sales: number; unit_cost: number };
  doctor_samples: DoctorSample[];
};

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role === "sales_rep")
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const month = sp.get("month") || riyadhToday().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  if (!SHARED_KEY)
    return NextResponse.json({ error: "الربط مع المالية مش متضبط" }, { status: 500 });

  const [finRes, sampleRows] = await Promise.all([
    fetch(`${FINANCE_URL}/api/shared/samples-promo?month=${month}&details=true`, {
      headers: { "x-api-key": SHARED_KEY },
      next: { revalidate: 300 },
    }).then(r => r.ok ? r.json() : null).catch(() => null),

    query<{ rep_id: string; rep_name: string; doctor_id: string; doctor_name: string; clinic_name: string; product_name: string; total_units: string }>(
      `SELECT v.sales_rep_id as rep_id, u.name as rep_name,
              d.id::text as doctor_id, d.name as doctor_name, d.clinic_name,
              p.name as product_name, SUM(vi.quantity) as total_units
       FROM visit_items vi
       JOIN visits v ON v.id = vi.visit_id
       JOIN doctors d ON d.id = v.doctor_id
       JOIN users u ON u.id = v.sales_rep_id
       JOIN products p ON p.id = vi.product_id
       WHERE vi.kind = 'sample'
         AND v.visited_at >= $1::date AND v.visited_at < $2::date
       GROUP BY v.sales_rep_id, u.name, d.id, d.name, d.clinic_name, p.name
       ORDER BY total_units DESC`,
      [from, to]
    ),
  ]);

  const finReps: RepSpend[] = finRes?.reps || [];
  const samplesByRep = new Map<string, DoctorSample[]>();
  for (const r of sampleRows.rows) {
    const key = r.rep_name;
    if (!samplesByRep.has(key)) samplesByRep.set(key, []);
    samplesByRep.get(key)!.push({
      doctor_id: r.doctor_id, doctor_name: r.doctor_name, clinic_name: r.clinic_name,
      product_name: r.product_name, total_units: Number(r.total_units),
    });
  }

  const reps = finReps.map(r => ({
    ...r,
    doctor_samples: samplesByRep.get(r.rep_name) || [],
  }));

  return NextResponse.json({ month, reps });
}
