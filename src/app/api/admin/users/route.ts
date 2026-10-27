import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { userUpsertSchema } from "@/lib/validation";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const r = await query(`
    SELECT u.id, u.name, u.email, u.role, u.job_title, u.active, u.assigned_product_id, p.name product_name,
      COALESCE(t.target_value,0) target_value,
      (SELECT count(*)::int FROM visits v WHERE v.sales_rep_id=u.id) visits_count
    FROM users u LEFT JOIN products p ON p.id=u.assigned_product_id
    LEFT JOIN targets t ON t.user_id=u.id AND t.product_id=u.assigned_product_id
    ORDER BY u.role DESC, u.name ASC
  `);
  return NextResponse.json({ users: r.rows });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(()=>null);
  const parsed = userUpsertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  if (d.role === "sales_rep" && !d.assigned_product_id) return NextResponse.json({ error: "المنتج مطلوب للمندوب" }, { status: 400 });
  const pw = (d.password || "").trim();
  if (!pw) return NextResponse.json({ error: "كلمة المرور مطلوبة" }, { status: 400 });
  const hash = await hashPassword(pw);
  try {
    const r = await query(
      "INSERT INTO users(name,email,password_hash,role,job_title,assigned_product_id,active) VALUES($1,lower($2),$3,$4,$5,$6,COALESCE($7,true)) RETURNING id",
      [d.name, d.email, hash, d.role, d.job_title || "", d.assigned_product_id || null, d.active]
    );
    await query(`INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'create','user',$2,$3)`,[user.id,r.rows[0].id,JSON.stringify({name:d.name,email:d.email,role:d.role})]);
    return NextResponse.json({ id: r.rows[0].id }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("duplicate") || msg.includes("unique")) return NextResponse.json({ error: "البريد مستخدم من قبل" }, { status: 409 });
    throw e;
  }
}
