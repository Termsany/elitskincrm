import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { userUpsertSchema } from "@/lib/validation";
import { validateUserAdminEdit } from "@/lib/user-admin";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(()=>null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  // allow partial
  const parsed = userUpsertSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  const current=await query(`SELECT role,assigned_product_id,active FROM users WHERE id=$1`,[id]);
  if(!current.rows[0]) return NextResponse.json({error:"المستخدم غير موجود"},{status:404});
  const nextRole=d.role??current.rows[0].role;
  const nextProduct=d.assigned_product_id!==undefined?d.assigned_product_id:current.rows[0].assigned_product_id;
  const nextActive=d.active!==undefined?d.active:current.rows[0].active;
  const validation=validateUserAdminEdit({actorId:user.id,targetId:id,role:nextRole,assignedProductId:nextRole==="sales_rep"?nextProduct:null,active:nextActive});
  if(validation) return NextResponse.json({error:validation},{status:400});
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;
  if (d.name !== undefined) { sets.push(`name=$${idx++}`); vals.push(d.name); }
  if (d.job_title !== undefined) { sets.push(`job_title=$${idx++}`); vals.push(d.job_title || ""); }
  if (d.email !== undefined) { sets.push(`email=lower($${idx++})`); vals.push(d.email); }
  if (d.role !== undefined) { sets.push(`role=$${idx++}`); vals.push(d.role); if(d.role==="admin"&&d.assigned_product_id===undefined){sets.push(`assigned_product_id=NULL`);} }
  if (d.assigned_product_id !== undefined) { sets.push(`assigned_product_id=$${idx++}`); vals.push(d.assigned_product_id || null); }
  if (d.active !== undefined) { sets.push(`active=$${idx++}`); vals.push(d.active); }
  if (d.password && String(d.password).trim().length >= 8) {
    const h = await hashPassword(String(d.password));
    sets.push(`password_hash=$${idx++}`); vals.push(h);
  }
  if (sets.length === 0) return NextResponse.json({ error: "لا تغييرات" }, { status: 400 });
  vals.push(id);
  await query(`UPDATE users SET ${sets.join(", ")} WHERE id=$${idx}`, vals);
  await query(`INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'update','user',$2,$3)`,[user.id,id,JSON.stringify({role:nextRole,active:nextActive,assigned_product_id:nextRole==="sales_rep"?nextProduct:null})]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (id === user.id) return NextResponse.json({ error: "لا يمكن حذف نفسك" }, { status: 400 });
  await query("DELETE FROM users WHERE id=$1", [id]);
  return NextResponse.json({ ok: true });
}
