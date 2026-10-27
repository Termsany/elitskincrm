import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth";
export async function POST(req: Request){
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(()=>null) as Record<string,unknown>|null;
  if (!body?.currentPassword || !body?.newPassword) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  const cur=String(body.currentPassword), nw=String(body.newPassword);
  if (nw.length < 8) return NextResponse.json({ error: "كلمة المرور 8 أحرف على الأقل" }, { status: 400 });
  const r = await query("SELECT password_hash FROM users WHERE id=$1", [user.id]);
  const ok = await verifyPassword(cur, r.rows[0].password_hash);
  if (!ok) return NextResponse.json({ error: "كلمة المرور الحالية غير صحيحة" }, { status: 400 });
  const h = await hashPassword(nw);
  await query("UPDATE users SET password_hash=$1 WHERE id=$2", [h, user.id]);
  await query("INSERT INTO audit_logs(actor_id, action, entity, entity_id) VALUES($1,'password_change','user',$1)", [user.id]);
  return NextResponse.json({ ok: true });
}
