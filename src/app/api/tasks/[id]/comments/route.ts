import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { badId, validIds } from "@/lib/ids";
export async function GET(_req: Request, { params }: { params: Promise<{id:string}> }){if(!validIds(await params))return badId();
  const user=await getCurrentUser(); if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const r=await query(`SELECT c.*, u.name user_name FROM task_comments c JOIN users u ON u.id=c.user_id WHERE c.task_id=$1 ORDER BY c.created_at`,[id]);
  return NextResponse.json({comments:r.rows});
}
export async function POST(req: Request, { params }: { params: Promise<{id:string}> }){if(!validIds(await params))return badId();
  const user=await getCurrentUser(); if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
  const b=String(body?.body||"").trim();
  if(!b) return NextResponse.json({error:"اكتب تعليقا"},{status:400});
  const r=await query(`INSERT INTO task_comments(task_id, user_id, body) VALUES($1,$2,$3) RETURNING id`,[id,user.id,b]);
  // Notify other assignees + creator
  const assignees=await query(`SELECT user_id FROM task_assignees WHERE task_id=$1`,[id]);
  const task=await query(`SELECT created_by, title FROM tasks WHERE id=$1`,[id]);
  const creator=String(task.rows[0]?.created_by||"");
  const toNotify=new Set([...assignees.rows.map((x:Record<string,unknown>)=> String(x.user_id)), creator].filter(x=> x && x!==user.id));
  for(const uid of toNotify) await query(`INSERT INTO task_notifications(user_id, task_id, kind, message) VALUES($1,$2,'comment',$3)`,[uid,id,`${user.name} علّق على: ${task.rows[0]?.title}`]);
  return NextResponse.json({id:r.rows[0].id},{status:201});
}
