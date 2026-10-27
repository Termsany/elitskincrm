import { NextResponse } from "next/server";
import { hitRateLimitDb } from "@/lib/rate-limit";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { getClientIp } from "@/lib/client-ip";
// Simple: if user provides email, admin can reset via this endpoint (admin-only in practice)
// For self-service without email, we return generic message
export async function POST(req: Request){
  const ip = getClientIp(req);
  const rl=await hitRateLimitDb(`forgot:ip:${ip}`,5,10*60*1000);
  if(!rl.allowed) return NextResponse.json({error:"حاول لاحقا"},{status:429});
  const body = await req.json().catch(()=>null) as Record<string,unknown>|null;
  const email = String(body?.email||"").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "البريد مطلوب" }, { status: 400 });
  // Generic response to avoid enumeration, but actually reset if admin calls
  // Check if caller is admin via session — if not, just return success message
  const { getCurrentUser } = await import("@/lib/session");
  const caller = await getCurrentUser();
  if (caller?.role === "admin" && body?.newPassword && String(body.newPassword).length >= 8) {
    const h = await hashPassword(String(body.newPassword));
    await query("UPDATE users SET password_hash=$1 WHERE lower(email)=lower($2)", [h, email]);
    return NextResponse.json({ ok: true, reset: true });
  }
  // For non-admin, just acknowledge
  return NextResponse.json({ ok: true, message: "تواصل مع الأدمن لإعادة التعيين" });
}
