import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { visitSchema } from "@/lib/validation";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  // Only admin can edit, or owner can edit own visit within 24h
  const existing = await query("SELECT sales_rep_id, visited_at FROM visits WHERE id=$1", [id]);
  if (!existing.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const owner = existing.rows[0] as { sales_rep_id:string; visited_at:string };
  const isAdmin = user.role === "admin";
  const isOwner = owner.sales_rep_id === user.id;
  const within24h = (Date.now() - new Date(owner.visited_at).getTime()) < 24*60*60*1000;
  if (!isAdmin && !(isOwner && within24h)) return NextResponse.json({ error: "غير مسموح" }, { status: 403 });

  const body = await req.json().catch(()=>null) as Record<string,unknown>|null;
  if (!body) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  // Allow partial: notes, status, sample/order items
  const sets:string[]=[]; const vals:unknown[]=[]; let idx=1;
  if (body.notes !== undefined) {
    const n=String(body.notes).trim();
    if (n.length < 10) return NextResponse.json({ error: "الملاحظات 10 أحرف على الأقل" }, { status: 400 });
    sets.push(`notes=$${idx++}`); vals.push(n);
  }
  if (body.status !== undefined) {
    if (!["planned","completed","cancelled"].includes(String(body.status))) return NextResponse.json({ error: "حالة غير صحيحة" }, { status: 400 });
    sets.push(`status=$${idx++}`); vals.push(body.status);
  }
  if (body.doctorId !== undefined) { sets.push(`doctor_id=$${idx++}`); vals.push(body.doctorId); }
      if (body.follow_up_at !== undefined) { sets.push(`follow_up_at=$${idx++}`); vals.push(String(body.follow_up_at)||null); }
      if (body.follow_up_note !== undefined) { sets.push(`follow_up_note=$${idx++}`); vals.push(String(body.follow_up_note)); }
      if (body.lat !== undefined) { sets.push(`lat=$${idx++}`); vals.push(body.lat); }
      if (body.lng !== undefined) { sets.push(`lng=$${idx++}`); vals.push(body.lng); }

  if (sets.length) {
    vals.push(id);
    await query(`UPDATE visits SET ${sets.join(", ")} WHERE id=$${idx}`, vals);
    // audit
    await query("INSERT INTO audit_logs(actor_id, action, entity, entity_id, details) VALUES($1,'update','visit',$2,$3)", [user.id, id, JSON.stringify(body).slice(0,2000)]);
  }

  // Replace items if provided
  if (body.sampleItems !== undefined || body.orderItems !== undefined) {
    const client = await (await import("@/lib/db")).pool.connect();
    try{
      await client.query("BEGIN");
      if (body.sampleItems !== undefined || body.orderItems !== undefined) {
        await client.query("DELETE FROM visit_items WHERE visit_id=$1", [id]);
      }
      const samples = (body.sampleItems as Array<{productId:string; quantity:number; purpose?:string}>) || [];
      const orders = (body.orderItems as Array<{productId:string; quantity:number; purpose?:string}>) || [];
      for(const it of samples) await client.query("INSERT INTO visit_items(visit_id, product_id, kind, quantity, sample_purpose) VALUES($1,$2,'sample',$3,$4)", [id, it.productId, it.quantity, it.purpose||null]);
      for(const it of orders){
        const status=isAdmin?"approved":"pending";
        const order=await client.query("INSERT INTO visit_items(visit_id, product_id, kind, quantity, approval_status, approved_by, approved_at) VALUES($1,$2,'order',$3,$4,$5,$6) RETURNING id",[id,it.productId,it.quantity,status,isAdmin?user.id:null,isAdmin?new Date():null]);
        if(!isAdmin){
          const admins=await client.query("SELECT id FROM users WHERE role='admin' AND active=true");
          for(const admin of admins.rows) await client.query("INSERT INTO task_notifications(user_id,task_id,order_item_id,kind,message) VALUES($1,NULL,$2,'order_pending',$3)",[admin.id,order.rows[0].id,`${user.name} حدّث طلب أوردر ويحتاج موافقة`]);
        }
      }
      await client.query("COMMIT");
    }catch(e){ await client.query("ROLLBACK"); throw e; } finally{ client.release(); }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await query("DELETE FROM visits WHERE id=$1", [id]);
  await query("INSERT INTO audit_logs(actor_id, action, entity, entity_id) VALUES($1,'delete','visit',$2)", [user.id, id]);
  return NextResponse.json({ ok: true });
}
