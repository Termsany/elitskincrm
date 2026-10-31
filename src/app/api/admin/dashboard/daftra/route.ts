import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { daftraPulse } from "@/lib/dash-daftra";

export const dynamic = "force-dynamic";
/** Daftra sales pulse for the admin dashboard (admin only, read-only). */
export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { return NextResponse.json(await daftraPulse(), { headers: { "cache-control": "private, no-store" } }); }
  catch (e) { console.error("daftra pulse", e); return NextResponse.json({ error: "تعذر تحميل مبيعات دفترة" }, { status: 500 }); }
}
