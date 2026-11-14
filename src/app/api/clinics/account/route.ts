import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { riyadhToday } from "@/lib/riyadh-day";
import { clinicAccount } from "@/lib/clinic-account";
import { UUID_RE } from "@/lib/fmt";


/** One clinic's Daftra account (balance, open invoices, what it buys) — by clinic id, or by name for doctors without a clinic id. */
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams; const id = sp.get("id") || ""; const name = (sp.get("name") || "").trim();
  if (id && !UUID_RE.test(id)) return NextResponse.json({ error: "عيادة غير صحيحة" }, { status: 400 });
  if (!id && !name) return NextResponse.json({ error: "عيادة غير صحيحة" }, { status: 400 });
  const c = (await query<{ id: string; name: string; city: string | null }>(id ? "SELECT id, name, city FROM clinics WHERE id=$1"
    : `SELECT c.id, c.name, c.city FROM clinics c WHERE lower(btrim(c.name))=lower($1)
       ORDER BY EXISTS (SELECT 1 FROM doctors d WHERE d.clinic_id=c.id) DESC, c.active DESC LIMIT 1`, [id || name.slice(0, 200)])).rows[0];
  if (!c) return NextResponse.json({ clinic: null, account: null });
  const account = await clinicAccount(c.id, riyadhToday(), u.role === "admin" ? null : u.id).catch(() => null);
  return NextResponse.json({ clinic: c, account });
}
