import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { riyadhToday } from "@/lib/riyadh-day";
import { addDays, UUID_RE } from "@/lib/fmt";
import { DAY_MIN, OFFICE_KINDS } from "@/lib/office-kinds";

export const dynamic = "force-dynamic";
const DAY_RE = /^20\d\d-\d\d-\d\d$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

async function summary(userId: string, day: string) {
  const [rows, plan] = await Promise.all([
    query<{ id: string; kind: string; minutes: number; from_time: string | null; to_time: string | null; note: string | null; created_at: string }>(`SELECT id::text id, kind, minutes, to_char(from_time,'HH24:MI') from_time, to_char(to_time,'HH24:MI') to_time, note, created_at::text created_at
      FROM office_time WHERE user_id=$1 AND day=$2::date ORDER BY created_at`, [userId, day]),
    query<{ n: number }>(`SELECT count(*)::int n FROM plan_items pi JOIN plans p ON p.id=pi.plan_id WHERE p.user_id=$1 AND p.status='approved' AND pi.planned_date=$2::date`, [userId, day]),
  ]);
  const minutes = rows.rows.reduce((a, r) => a + r.minutes, 0), planned = plan.rows[0]?.n || 0, base = planned || 8;
  const field = Math.max(0, DAY_MIN - Math.min(DAY_MIN, minutes));
  return { day, entries: rows.rows, minutes, planned, base, fieldMin: field, expected: Math.round(base * field / DAY_MIN) };
}

/** Rep's office time for a day (default today) and how it changes the day's expected visits. */
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (u.role !== "sales_rep") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const d = new URL(req.url).searchParams.get("day") || ""; const today = riyadhToday();
  return NextResponse.json(await summary(u.id, DAY_RE.test(d) && d <= today ? d : today));
}

/** Log office time: { kind, minutes | from+to, day?, note? } — today or up to 7 days back. */
export async function POST(req: Request) {
  const u = await getCurrentUser(); if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (u.role !== "sales_rep") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const today = riyadhToday();
  const kind = String(b?.kind || ""), day = String(b?.day || today), note = String(b?.note || "").trim().slice(0, 300);
  const from = String(b?.from || ""), to = String(b?.to || "");
  if (!OFFICE_KINDS[kind]) return NextResponse.json({ error: "اختار نوع الشغل" }, { status: 400 });
  if (!DAY_RE.test(day) || day > today || day < addDays(today, -7)) return NextResponse.json({ error: "تقدر تسجّل للنهارده أو لحد 7 أيام فاتوا" }, { status: 400 });
  let minutes = Math.round(Number(b?.minutes) || 0);
  if (from || to) {
    if (!TIME_RE.test(from) || !TIME_RE.test(to) || toMin(to) <= toMin(from)) return NextResponse.json({ error: "وقت البداية لازم يكون قبل النهاية" }, { status: 400 });
    minutes = toMin(to) - toMin(from);
  }
  if (minutes < 5 || minutes > 600) return NextResponse.json({ error: "المدة لازم تكون من 5 دقايق لحد 10 ساعات" }, { status: 400 });
  const used = (await query<{ m: number }>(`SELECT COALESCE(sum(minutes),0)::int m FROM office_time WHERE user_id=$1 AND day=$2::date`, [u.id, day])).rows[0]?.m || 0;
  if (used + minutes > 600) return NextResponse.json({ error: `مسجّل ${Math.round(used / 60 * 10) / 10} ساعة في اليوم ده — المجموع مايزيدش عن 10 ساعات` }, { status: 400 });
  if (from && (await query(`SELECT 1 FROM office_time WHERE user_id=$1 AND day=$2::date AND from_time IS NOT NULL AND from_time < $4::time AND to_time > $3::time LIMIT 1`, [u.id, day, from, to])).rows.length)
    return NextResponse.json({ error: "الوقت ده متداخل مع وقت مسجّل قبل كده" }, { status: 400 });
  await query(`INSERT INTO office_time(user_id, day, kind, minutes, from_time, to_time, note) VALUES ($1,$2::date,$3,$4,$5::time,$6::time,NULLIF($7,''))`, [u.id, day, kind, minutes, from || null, to || null, note]);
  return NextResponse.json(await summary(u.id, day));
}

/** Remove one of the rep's own entries (within the 7-day window). */
export async function DELETE(req: Request) {
  const u = await getCurrentUser(); if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (u.role !== "sales_rep") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || ""; const today = riyadhToday();
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const r = await query<{ day: string }>(`DELETE FROM office_time WHERE id=$1 AND user_id=$2 AND day >= $3::date RETURNING day::text AS day`, [id, u.id, addDays(today, -7)]);
  if (!r.rows.length) return NextResponse.json({ error: "مش موجود" }, { status: 404 });
  return NextResponse.json(await summary(u.id, r.rows[0].day));
}
