import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { riyadhToday } from "@/lib/fmt";

const SHARED_KEY = process.env.SHARED_API_KEY;
const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET(req: Request) {
  const auth = req.headers.get("x-api-key");
  if (!SHARED_KEY || auth !== SHARED_KEY) return forbid();

  const today = riyadhToday();
  const year = Number(today.slice(0, 4));
  const month = today.slice(0, 7);

  const [followups, samples, expenses, targets] = await Promise.all([
    query<{
      client_id: string; result: string; promise_date: string | null;
      promise_amount: number | null; note: string; created_at: string;
      rep_name: string;
    }>(`SELECT f.client_id, f.result, f.promise_date::text,
        f.amount::float8 promise_amount, f.note, f.created_at, u.name rep_name
      FROM collection_followups f JOIN users u ON u.id=f.rep_id
      WHERE f.created_at > now() - interval '90 days'
      ORDER BY f.created_at DESC LIMIT 500`),

    query<{
      product_name: string; doctor_name: string; clinic_name: string;
      rep_name: string; quantity: number; visited_at: string;
    }>(`SELECT p.name product_name, d.name doctor_name,
        COALESCE(c.name, d.clinic_name) clinic_name, u.name rep_name,
        vi.quantity::int, (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date::text visited_at
      FROM visit_items vi
      JOIN visits v ON v.id=vi.visit_id
      JOIN doctors d ON d.id=v.doctor_id
      LEFT JOIN clinics c ON c.id=d.clinic_id
      JOIN users u ON u.id=v.sales_rep_id
      LEFT JOIN products p ON p.id=vi.product_id
      WHERE vi.kind='sample'
        AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date >= ($1||'-01')::date
      ORDER BY v.visited_at DESC LIMIT 500`, [month]),

    query<{
      rep_name: string; category: string; amount: number;
      expense_date: string; merchant: string; description: string;
    }>(`SELECT u.name rep_name, cat.name category,
        e.amount::float8, e.expense_date::text, e.merchant, e.description
      FROM expenses e
      JOIN users u ON u.id=e.rep_id
      JOIN expense_categories cat ON cat.id=e.category_id
      WHERE e.status='approved'
        AND e.expense_date >= ($1||'-01')::date
      ORDER BY e.expense_date DESC LIMIT 300`, [month]),

    query<{
      rep_name: string; annual: number; month_target: number; month_actual: number;
    }>(`SELECT u.name rep_name,
        COALESCE(t.annual_amount,0)::float8 annual,
        COALESCE(ovr.amount, dist.amount, 0)::float8 month_target,
        COALESCE(act.value,0)::float8 month_actual
      FROM users u
      LEFT JOIN rep_target_years t ON t.rep_id=u.id AND t.year=$1
      LEFT JOIN rep_target_overrides ovr ON ovr.rep_id=u.id AND ovr.year=$1
        AND to_char(ovr.month,'YYYY-MM')=$2
      LEFT JOIN LATERAL (
        SELECT m.amount FROM rep_target_versions v
        JOIN rep_target_months m ON m.version_id=v.id
        WHERE v.rep_id=u.id AND v.year=$1 AND v.level='annual' AND v.status='approved'
          AND to_char(m.month,'YYYY-MM')=$2
        ORDER BY v.version DESC LIMIT 1
      ) dist ON true
      LEFT JOIN LATERAL (
        SELECT sum(fs.quantity*fs.unit_price*(CASE WHEN fs.kind='return' THEN -1 ELSE fs.direction END))::float8 value
        FROM daftra_sales_v fs
        WHERE fs.rep_id=u.id AND fs.status='approved' AND to_char(fs.month,'YYYY-MM')=$2
      ) act ON true
      WHERE u.role='sales_rep' AND u.active
      ORDER BY u.name`, [year, month]),
  ]);

  return NextResponse.json({
    today, month,
    followups: followups.rows,
    samples: samples.rows,
    expenses: { month, rows: expenses.rows, total: expenses.rows.reduce((s, r) => s + r.amount, 0) },
    targets: targets.rows,
  });
}
