import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
export async function POST(req: Request, {params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser(); if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
  const b=String(body?.body||"").trim();
  if(!b) return NextResponse.json({error:"اكتب تعليقا"},{status:400});
  await query(`INSERT INTO task_comments(task_id, plan_id, user_id, body) VALUES(NULL,$1,$2,$3)`,[id,user.id,b]);
  // For plans, also notify other side
  const planRow=await query(`SELECT user_id FROM plans WHERE id=$1`,[id]);
  if(planRow.rows[0]){
    const other=String(planRow.rows[0].user_id)===user.id ? (await query(`SELECT id FROM users WHERE role='admin' LIMIT 1`)).rows[0]?.id : planRow.rows[0].user_id;
    if(other && String(other)!==user.id) await query(`INSERT INTO task_notifications(user_id, task_id, plan_id, kind, message) VALUES($1,NULL,$2,'plan_comment',$3)`,[other, id, `${user.name} علّق على الخطة`]);
  }
  return NextResponse.json({ok:true});
}
