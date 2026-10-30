import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE, clinicKey } from "@/lib/visit-intel";

/** Manager confirms "this visit's GPS point is the clinic" (or clears the pin). */
async function target(id: string) {
  if (!UUID_RE.test(id)) return null;
  return (await query(`SELECT v.lat, v.lng, d.id::text doctor_id, d.clinic_id::text clinic_id, d.clinic_name FROM visits v JOIN doctors d ON d.id=v.doctor_id WHERE v.id=$1`, [id])).rows[0] || null;
}
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params; const t = await target(id);
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (t.lat === null || t.lng === null) return NextResponse.json({ error: "الزيارة دي من غير موقع" }, { status: 400 });
  const key = clinicKey(t.clinic_id, t.clinic_name, t.doctor_id);
  await query(`INSERT INTO clinic_locations(clinic_key,lat,lng,set_by,from_visit) VALUES($1,$2,$3,$4,$5) ON CONFLICT (clinic_key) DO UPDATE SET lat=$2,lng=$3,set_by=$4,from_visit=$5,set_at=now()`, [key, t.lat, t.lng, u.id, id]);
  return NextResponse.json({ ok: true });
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const t = await target((await params).id);
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await query(`DELETE FROM clinic_locations WHERE clinic_key=$1`, [clinicKey(t.clinic_id, t.clinic_name, t.doctor_id)]);
  return NextResponse.json({ ok: true });
}
