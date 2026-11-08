import { NextResponse } from "next/server";
import { hitRateLimitDb } from "@/lib/rate-limit";
import { query } from "@/lib/db";
import { getClientIp } from "@/lib/client-ip";

// Self-service "forgot password": there is no mail flow, so the request goes to the admin(s),
// who set a new password from the reps page. The answer is always the same (no account enumeration).
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = await hitRateLimitDb(`forgot:ip:${ip}`, 5, 10 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "حاول لاحقا" }, { status: 429 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const email = String(body?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@") || email.length > 200) return NextResponse.json({ error: "اكتب البريد الإلكتروني" }, { status: 400 });
  const rl2 = await hitRateLimitDb(`forgot:email:${email}`, 2, 60 * 60 * 1000);
  if (rl2.allowed) {
    const u = await query<{ id: string; name: string }>("SELECT id, name FROM users WHERE lower(email)=$1 AND active=true AND role::text<>'admin'", [email]);
    const user = u.rows[0];
    if (user) {
      const open = await query("SELECT 1 FROM password_reset_requests WHERE user_id=$1 AND handled_at IS NULL", [user.id]);
      if (!open.rows.length) {
        await query("INSERT INTO password_reset_requests(user_id) VALUES($1)", [user.id]);
        await query(
          `INSERT INTO task_notifications(user_id, task_id, kind, message, action_url)
           SELECT id, NULL, 'password_reset_request', $1, '/admin/reps' FROM users WHERE role::text='admin' AND active=true`,
          [`${user.name} طلب إعادة تعيين كلمة السر`],
        ).catch(() => {});
      }
    }
  }
  return NextResponse.json({ ok: true, message: "لو الحساب موجود وصل الطلب للأدمن، وهيبعتلك كلمة سر جديدة." });
}
