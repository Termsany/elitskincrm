import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { riyadhToday } from "@/lib/riyadh-day";
import { UUID_RE } from "@/lib/fmt";
import { territory } from "@/lib/territory";

async function rep(id: string) { return (await query("SELECT 1 FROM users WHERE id=$1 AND role='sales_rep' AND active", [id])).rowCount; }

/** A rep's area by city (own visits and own-product sales). Reps get their own; the admin passes repId. */
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("repId") || "";
  const id = u.role === "admin" ? q : u.id;
  if (!UUID_RE.test(id) || (u.role === "admin" && !(await rep(id)))) return NextResponse.json({ error: "اختار مندوب" }, { status: 400 });
  return NextResponse.json(await territory(id, riyadhToday()));
}

/** Admin: set a rep's cities (empty = follow where they actually work). */
export async function PUT(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as { repId?: string; cities?: unknown } | null;
  const id = String(b?.repId || "");
  if (!UUID_RE.test(id) || !(await rep(id))) return NextResponse.json({ error: "مندوب غير صحيح" }, { status: 400 });
  const cities = [...new Set((Array.isArray(b?.cities) ? b!.cities : []).map(c => String(c ?? "").replace(/\s+/g, " ").trim()).filter(c => c && c.length <= 80))].slice(0, 60);
  await query("DELETE FROM rep_cities WHERE rep_id=$1", [id]);
  if (cities.length) await query("INSERT INTO rep_cities(rep_id, city) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING", [id, cities]);
  await query("INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'update','rep_cities',$2,$3)", [u.id, id, JSON.stringify({ cities })]).catch(() => {});
  return NextResponse.json({ ok: true, cities });
}
