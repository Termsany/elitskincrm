import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE } from "@/lib/fmt";

async function admin() { const u = await getCurrentUser(); return u && u.role === "admin" && !u.manager ? u : null; }

/** Archived (inactive, not merged) doctors with their visit history (GET); bring some back (POST { ids }). Admin only. */
export async function GET() {
  if (!await admin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const r = await query(`SELECT d.id, d.name, d.clinic_name, d.city, d.specialty, d.classification, d.phone, d.email,
      (SELECT count(*)::int FROM visits v WHERE v.doctor_id=d.id) visits,
      (SELECT (max(v.visited_at) AT TIME ZONE 'Asia/Riyadh')::date::text FROM visits v WHERE v.doctor_id=d.id) last_visit
    FROM doctors d WHERE d.status='inactive' AND d.merged_into IS NULL ORDER BY d.name LIMIT 2000`);
  return NextResponse.json({ doctors: r.rows });
}

export async function POST(req: Request) {
  const u = await admin(); if (!u) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as { ids?: unknown } | null;
  const ids = Array.isArray(b?.ids) ? b!.ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)).slice(0, 2000) : [];
  if (!ids.length) return NextResponse.json({ error: "اختار طبيب" }, { status: 400 });
  const r = await query("UPDATE doctors SET status='active' WHERE id=ANY($1::uuid[]) AND status='inactive' AND merged_into IS NULL RETURNING id", [ids]);
  await query("INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'restore','doctors','archive',$2)", [u.id, JSON.stringify({ ids: r.rows.map(x => x.id) })]);
  return NextResponse.json({ ok: true, restored: r.rowCount || 0 });
}
