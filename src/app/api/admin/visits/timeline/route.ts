import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_RE = /^(?:20\d\d)-(?:0[1-9]|1[0-2])$/;
const DAY_RE = /^(?:20\d\d)-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const repId = url.searchParams.get("repId") || "";
  const month = url.searchParams.get("month");
  const day = url.searchParams.get("day");
  if (!UUID_RE.test(repId) || (month !== null) === (day !== null) ||
      (month !== null && !MONTH_RE.test(month)) ||
      (day !== null && (!DAY_RE.test(day) || Number.isNaN(Date.parse(`${day}T12:00:00Z`)) ||
        new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day))) {
    return NextResponse.json({ error: "Invalid representative or date" }, { status: 400 });
  }

  const rep = (await query<{ id: string; name: string }>(
    "SELECT id,name FROM users WHERE id=$1 AND role='sales_rep'", [repId]
  )).rows[0];
  if (!rep) return NextResponse.json({ error: "Representative not found" }, { status: 404 });

  if (month !== null) {
    const result = await query<{ day: string; total: number; completed: number }>(`
      SELECT (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date::text AS day,
             count(*)::int AS total,
             count(*) FILTER (WHERE v.status='completed')::int AS completed
      FROM visits v
      WHERE v.sales_rep_id=$1
        AND v.visited_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Riyadh')
        AND v.visited_at < (($2::date + interval '1 month') AT TIME ZONE 'Asia/Riyadh')
      GROUP BY day ORDER BY day DESC
    `, [repId, `${month}-01`]);
    return NextResponse.json({ rep, month, days: result.rows,
      total: result.rows.reduce((sum, row) => sum + Number(row.total), 0) });
  }

  const result = await query<{
    id: string; day: string; visited_at: string; status: string;
    doctor_name: string; clinic_name: string; city: string;
  }>(`
    SELECT v.id, (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date::text AS day,
           v.visited_at, v.status, d.name AS doctor_name, d.clinic_name, d.city
    FROM visits v JOIN doctors d ON d.id=v.doctor_id
    WHERE v.sales_rep_id=$1
      AND v.visited_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Riyadh')
      AND v.visited_at < (($2::date + interval '1 day') AT TIME ZONE 'Asia/Riyadh')
    ORDER BY v.visited_at DESC, v.id DESC
  `, [repId, day]);
  return NextResponse.json({ rep, day, visits: result.rows });
}
