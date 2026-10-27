import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
const UPLOAD_DIR=process.env.UPLOAD_DIR||"/tmp/elite-crm-uploads";
async function canAccessTask(id:string,user:{id:string;role:string}){
  const r=await query(`SELECT 1 FROM tasks t WHERE t.id=$1 AND ($3::boolean OR t.created_by=$2 OR EXISTS(SELECT 1 FROM task_assignees a WHERE a.task_id=t.id AND a.user_id=$2))`,[id,user.id,user.role==="admin"]);
  return Boolean(r.rowCount);
}
export async function GET(_req: Request, { params }: { params: Promise<{id:string}> }){
  const user=await getCurrentUser(); if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  if(!(await canAccessTask(id,user))) return NextResponse.json({error:"Not found"},{status:404});
  const r=await query(`SELECT id,file_name,mime_type,size_bytes,created_at FROM task_attachments WHERE task_id=$1 ORDER BY created_at`,[id]);
  return NextResponse.json({attachments:r.rows});
}
export async function POST(req: Request, { params }: { params: Promise<{id:string}> }){
  const user=await getCurrentUser(); if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  if(!(await canAccessTask(id,user))) return NextResponse.json({error:"Not found"},{status:404});
  const form=await req.formData().catch(()=>null);
  if(!form) return NextResponse.json({error:"Invalid"},{status:400});
  const file=form.get("file") as File|null;
  if(!file) return NextResponse.json({error:"الملف مطلوب"},{status:400});
  if(file.size>10*1024*1024) return NextResponse.json({error:"10MB max"},{status:400});
  const ext=path.extname(file.name).slice(0,10);
  const safe=`${randomUUID()}${ext}`;
  const dir=path.join(UPLOAD_DIR, "tasks", id);
  await mkdir(dir,{recursive:true});
  const fp=path.join(dir,safe);
  await writeFile(fp, Buffer.from(await file.arrayBuffer()));
  await query(`INSERT INTO task_attachments(task_id, file_name, file_path, mime_type, size_bytes) VALUES($1,$2,$3,$4,$5)`,[id,file.name,fp,file.type||"application/octet-stream",file.size]);
  return NextResponse.json({ok:true});
}
