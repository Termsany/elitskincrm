import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { brokenPromises, discountAlerts, reorderDue, salesPace } from "@/lib/smart";
import { nextWeekStart, workDays } from "@/lib/auto-plan";
import { riyadhToday } from "@/lib/visit-intel";

/** Smart lists: reorder-due clinics, sales pace, broken payment promises (+ discount alerts for the admin). */
export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = riyadhToday(), ws = nextWeekStart(today), we = workDays(ws)[4];
  if (u.role === "sales_rep") {
    const [reorder, pace, promises, plan] = await Promise.all([reorderDue(today, { repId: u.id }), salesPace(today, u.id), brokenPromises(today, u.id),
      query<{ id: string; status: string }>("SELECT id, status::text status FROM plans WHERE user_id=$1 AND status::text<>'rejected' AND period_start<=$3::date AND period_end>=$2::date ORDER BY created_at DESC LIMIT 1", [u.id, ws, we])]);
    return NextResponse.json({ today, reorder, pace: pace[0] || null, promises, nextWeek: { start: ws, plan: plan.rows[0] || null } });
  }
  if (u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const manager = !!u.manager;
  const [reorder, pace, promises, discounts, plans] = await Promise.all([reorderDue(today), salesPace(today), brokenPromises(today), manager ? Promise.resolve(null) : discountAlerts(60),
    query<{ n: number }>("SELECT count(DISTINCT user_id)::int n FROM plans WHERE status::text<>'rejected' AND period_start<=$2::date AND period_end>=$1::date", [ws, we])]);
  return NextResponse.json({ today, reorder, pace, promises, discounts, nextWeek: { start: ws, withPlan: plans.rows[0]?.n || 0 } });
}

/** Admin: set the allowed discount % used by the discount alerts. */
export async function PUT(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin" || u.manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as { max_discount_pct?: number } | null;
  const v = Number(b?.max_discount_pct);
  if (!(v >= 0 && v <= 90)) return NextResponse.json({ error: "النسبة من 0 لـ 90" }, { status: 400 });
  await query("UPDATE fin_settings SET max_discount_pct=$1, updated_at=now()", [v]);
  return NextResponse.json({ ok: true });
}
