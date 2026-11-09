import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { riyadhToday } from "@/lib/riyadh-day";

export const dynamic = "force-dynamic";
const RESULTS = new Set(["promise", "extension", "no_answer", "collected"]);
/** Log a collection follow-up for a Daftra customer (CRM-side note only; nothing is written to Daftra). */
export async function POST(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin" || u.manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const party = String(b?.party || "").trim().slice(0, 200), result = String(b?.result || ""), note = String(b?.note || "").trim().slice(0, 1000), date = String(b?.promised_date || "");
  if (!party) return NextResponse.json({ error: "العميل مش محدد" }, { status: 400 });
  if (!RESULTS.has(result)) return NextResponse.json({ error: "اختار نتيجة المتابعة", field: "result" }, { status: 400 });
  const needDate = result === "promise" || result === "extension";
  if (needDate && (!/^20\d\d-\d\d-\d\d$/.test(date) || date < riyadhToday())) return NextResponse.json({ error: "حدّد تاريخ الدفع المتوقع (النهارده أو بعده)", field: "promised_date" }, { status: 400 });
  // same follow-up sent twice within a minute (double tap / retry) → keep one
  const dup = await query(`SELECT 1 FROM admin_collection_notes WHERE party=$1 AND result=$2 AND note=$3 AND created_by=$4 AND created_at > now() - interval '1 minute'`, [party, result, note, u.id]);
  if (!dup.rows.length) await query(`INSERT INTO admin_collection_notes(party, result, promised_date, note, created_by) VALUES ($1,$2,$3::date,$4,$5)`, [party, result, needDate ? date : null, note, u.id]);
  return NextResponse.json({ ok: true });
}
