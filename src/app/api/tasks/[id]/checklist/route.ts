import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
export async function POST(req: Request, { params }: { params: Promise<{id:string}> }){
  const user=await getCurrentUser(); if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
  const title=String(body?.title||"").trim();
  if(!title) return NextResponse.json({error:"العنوان مطلوب"},{status:400});
  const r=await query(`INSERT INTO task_checklist(task_id, title) VALUES($1,$2) RETURNING id`,[id,title]);
  return NextResponse.json({id:r.rows[0].id},{status:201});
}
export async function PATCH(req: Request, { params }: { params: Promise<{id:string}> }){
  const user=await getCurrentUser(); if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
  const cid=String(body?.checklist_id||"");
  const done=!!body?.is_done;
  await query(`UPDATE task_checklist SET is_done=$1 WHERE id=$2`,[done,cid]);
  // Update progress
  const {id}=await params;
  const prog=await query(`SELECT count(*)::int total, count(*) FILTER (WHERE is_done=true)::int done FROM task_checklist WHERE task_id=$1`,[id]);
  const pct=prog.rows[0].total? Math.round(prog.rows[0].done/prog.rows[0].total*100):0;
  await query(`UPDATE tasks SET progress=$1 WHERE id=$2`,[pct,id]);
  return NextResponse.json({ok:true});
}
export async function DELETE(req: Request, { params }: { params: Promise<{id:string}> }){
  const user=await getCurrentUser(); if(!user || user.role!=="admin") return NextResponse.json({error:"Forbidden"},{status:403});
  const { searchParams }=new URL(req.url);
  const cid=searchParams.get("id");
  if(!cid) return NextResponse.json({error:"id required"},{status:400});
  await query(`DELETE FROM task_checklist WHERE id=$1`,[cid]);
  return NextResponse.json({ok:true});
}
