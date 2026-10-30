import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(); if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params; const body = await req.json().catch(()=>null) as Record<string, unknown>|null;
  if (!body) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const sets:string[]=[];const vals:unknown[]=[];let i=1;
  const textFields=["name","description","detailing_points","key_questions","detailing_version","tagline","category"] as const;
  if(body.color!==undefined){if(typeof body.color!=="string"||!/^#[0-9a-f]{6}$/i.test(body.color))return NextResponse.json({error:"لون غير صالح"},{status:400});sets.push(`color=$${i++}`);vals.push(body.color);}
  if(body.name!==undefined&&String(body.name).trim().length<2)return NextResponse.json({error:"اسم المنتج قصير"},{status:400});
  for(const field of textFields){if(body[field]!==undefined){sets.push(`${field}=$${i++}`);vals.push(String(body[field]));}}
  if(body.active!==undefined){sets.push(`active=$${i++}`);vals.push(!!body.active);}
  if(!sets.length)return NextResponse.json({error:"لا تغييرات"},{status:400});
  sets.push("content_updated_at=now()");vals.push(id);await query(`UPDATE products SET ${sets.join(",")} WHERE id=$${i}`,vals);return NextResponse.json({ok:true});
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user=await getCurrentUser();if(!user||user.role!=="admin")return NextResponse.json({error:"Forbidden"},{status:403});const{id}=await params;const used=await query(`SELECT EXISTS(SELECT 1 FROM users WHERE assigned_product_id=$1) OR EXISTS(SELECT 1 FROM visit_items WHERE product_id=$1) OR EXISTS(SELECT 1 FROM targets WHERE product_id=$1) used`,[id]);if(used.rows[0]?.used){await query("UPDATE products SET active=false WHERE id=$1",[id]);return NextResponse.json({ok:true,action:"deactivated"});}await query("DELETE FROM products WHERE id=$1",[id]);return NextResponse.json({ok:true,action:"deleted"});
}
