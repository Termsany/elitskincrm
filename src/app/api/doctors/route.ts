import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const city = (searchParams.get("city") || "").trim();
  const classification = (searchParams.get("classification") || "").trim();
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 2000);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);

  const conds: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;
  if (q) { conds.push(`(name ILIKE $${idx} OR clinic_name ILIKE $${idx} OR city ILIKE $${idx} OR phone ILIKE $${idx} OR email ILIKE $${idx})`); vals.push(`%${q}%`); idx++; }
  if (city) { conds.push(`city ILIKE $${idx}`); vals.push(`%${city}%`); idx++; }
  if (classification) { conds.push(`classification = $${idx}`); vals.push(classification); idx++; }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await query(`SELECT id, name, clinic_name, city, specialty, classification, phone, email, status FROM doctors ${where} ORDER BY name ASC LIMIT $${idx} OFFSET $${idx+1}`, [...vals, limit, offset]);
  const count = await query<{count:string}>(`SELECT count(*)::text AS count FROM doctors ${where}`, vals);
  return NextResponse.json({ doctors: rows.rows, total: parseInt(count.rows[0].count,10) });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(()=>null) as Record<string,unknown> | null;
  if (!body || !body.name || String(body.name).trim().length < 2) return NextResponse.json({ error: "name required" }, { status: 400 });
  const r = await query("INSERT INTO doctors(name, clinic_name, city, specialty, classification, phone, email, status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [String(body.name).trim(), String(body.clinic_name||body.clinicName||"").trim(), String(body.city||"").trim(), String(body.specialty||"").trim(), String(body.classification||"").trim(), String(body.phone||"").trim(), String(body.email||"").trim(), String(body.status||"active").trim()]);
  return NextResponse.json({ id: r.rows[0].id }, { status: 201 });
}