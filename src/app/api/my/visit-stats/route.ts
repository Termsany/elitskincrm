import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { riyadhToday } from "@/lib/riyadh-day";

/** The rep's month at a glance: visits, how many had a result, open and overdue follow-ups. */
export async function GET() {
  const u = await getCurrentUser(); if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = riyadhToday(), m1 = `${today.slice(0, 7)}-01`;
  const r = (await query<{ visits: number; result: number }>(`SELECT count(*) FILTER (WHERE v.status::text IN ('completed','follow_up'))::int visits,
      count(*) FILTER (WHERE v.status::text IN ('completed','follow_up') AND (v.follow_up_at IS NOT NULL OR length(btrim(COALESCE(v.notes,''))) >= 20
        OR EXISTS (SELECT 1 FROM visit_items i WHERE i.visit_id=v.id) OR EXISTS (SELECT 1 FROM visit_presented_products pp WHERE pp.visit_id=v.id)))::int result
    FROM visits v WHERE v.sales_rep_id=$1 AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $2::date AND $3::date`, [u.id, m1, today])).rows[0];
  return NextResponse.json({ today, ...r });
}
