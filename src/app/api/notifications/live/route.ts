import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { alertCount, staleDoctors } from "@/lib/my-alerts";
import { ACTION_CARDS, ACTION_CENTER_SQL, ACTION_CENTER_VALUES, type ActionKind } from "@/lib/admin-action-center";

export const dynamic = "force-dynamic";
export type LiveItem = { key: string; icon: string; text: string; href: string; count: number; tone: "red" | "amber" | "teal" };

const one = async (sql: string, vals: unknown[]) => (await query<{ n: number }>(sql, vals).catch(() => ({ rows: [{ n: 0 }] }))).rows[0]?.n ?? 0;
const TODAY = "(now() AT TIME ZONE 'Asia/Riyadh')::date";

/** "Needs you now": counted live from the data, so an item disappears by itself once it is dealt with. */
export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items: LiveItem[] = [];

  if (u.role === "admin") {
    const snap = (await query<{ counts: Record<ActionKind, number> }>(ACTION_CENTER_SQL, [...ACTION_CENTER_VALUES]).catch(() => ({ rows: [] }))).rows[0];
    const icons: Record<ActionKind, string> = { pendingPlans: "🗓", pendingDoctorRequests: "🩺", activeServiceRequests: "📨", overdueTasks: "⏰", overdueFollowups: "🔁" };
    for (const c of ACTION_CARDS) {
      const n = snap?.counts?.[c.key] ?? 0;
      if (n) items.push({ key: c.key, icon: icons[c.key], text: c.label, href: c.href, count: n, tone: c.key === "pendingPlans" || c.key === "overdueTasks" ? "red" : "amber" });
    }
    const exp = await one("SELECT count(*)::int n FROM expenses WHERE status='pending'", []);
    if (exp) items.push({ key: "pendingExpenses", icon: "🧾", text: "مصروفات مستنية اعتمادك", href: "/expenses", count: exp, tone: "amber" });
    const pw = await one("SELECT count(*)::int n FROM password_reset_requests WHERE handled_at IS NULL", []);
    if (pw) items.push({ key: "passwordResets", icon: "🔑", text: "طلبات كلمة سر جديدة", href: "/admin/reps", count: pw, tone: "red" });
  } else {
    const late = alertCount(await staleDoctors(u.id).catch(() => []));
    if (late) items.push({ key: "late", icon: "⏰", text: late === 1 ? "طبيب عدّى ميعاد زيارته ومش في خطتك" : "أطباء عدّى ميعاد زيارتهم ومش في خطتك", href: "/doctors?tag=late", count: late, tone: "red" });
    const fu = await one(`SELECT count(DISTINCT doctor_id)::int n FROM (
        SELECT f.doctor_id FROM doctor_followups f WHERE f.sales_rep_id=$1 AND f.completed_at IS NULL AND COALESCE(f.status,'') NOT IN ('done','completed','closed','cancelled') AND f.due_at::date <= ${TODAY}
        UNION ALL
        SELECT v.doctor_id FROM visits v WHERE v.sales_rep_id=$1 AND v.follow_up_at IS NOT NULL AND v.follow_up_at::date <= ${TODAY} AND v.follow_up_at::date >= ${TODAY} - 30
          AND NOT EXISTS (SELECT 1 FROM visits v2 WHERE v2.doctor_id=v.doctor_id AND v2.sales_rep_id=v.sales_rep_id AND v2.visited_at>v.visited_at AND v2.status='completed')
      ) x JOIN doctors d ON d.id=x.doctor_id AND COALESCE(d.status,'active')='active'`, [u.id]);
    if (fu) items.push({ key: "followups", icon: "🔁", text: "متابعات ميعادها النهارده أو فات", href: "/doctors?tag=followup", count: fu, tone: "amber" });
    const plan = await one(`SELECT count(DISTINCT pi.doctor_id)::int n FROM plan_items pi JOIN plans p ON p.id=pi.plan_id
        WHERE p.user_id=$1 AND p.status::text IN ('pending','approved') AND pi.planned_date=${TODAY}
          AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.sales_rep_id=$1 AND v.doctor_id=pi.doctor_id AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=${TODAY})`, [u.id]);
    if (plan) items.push({ key: "todayPlan", icon: "🗓", text: "زيارات باقية في خطة النهارده", href: "/", count: plan, tone: "teal" });
  }
  return NextResponse.json({ items }, { headers: { "cache-control": "private, no-store" } });
}
