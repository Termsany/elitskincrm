import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { targetSchema } from "@/lib/validation";
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const r = await query("SELECT t.*, u.name user_name, p.name product_name FROM targets t JOIN users u ON u.id=t.user_id JOIN products p ON p.id=t.product_id ORDER BY t.period_start DESC");
  return NextResponse.json({ targets: r.rows });
}
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(()=>null);
  const parsed = targetSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  const r = await query(
    "INSERT INTO targets(user_id,product_id,target_value,period_start,period_end) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,product_id,period_start) DO UPDATE SET target_value=EXCLUDED.target_value, period_end=EXCLUDED.period_end RETURNING id",
    [d.user_id, d.product_id, d.target_value, d.period_start, d.period_end]
  );
  return NextResponse.json({ id: r.rows[0].id }, { status: 201 });
}
