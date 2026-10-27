import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

export async function GET(_request:Request,{params}:{params:Promise<{id:string;attachmentId:string}>}){
  const user=await getCurrentUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id,attachmentId}=await params;
  const access=await query(`SELECT 1 FROM tasks t WHERE t.id=$1 AND ($3::boolean OR t.created_by=$2 OR EXISTS(SELECT 1 FROM task_assignees a WHERE a.task_id=t.id AND a.user_id=$2))`,[id,user.id,user.role==="admin"]);
  if(!access.rowCount)return NextResponse.json({error:"Not found"},{status:404});
  const result=await query(`SELECT file_name,file_path,mime_type FROM task_attachments WHERE id=$1 AND task_id=$2`,[attachmentId,id]);
  if(!result.rows[0])return NextResponse.json({error:"Not found"},{status:404});
  const file=result.rows[0];
  try{
    const bytes=await readFile(String(file.file_path));
    const filename=encodeURIComponent(String(file.file_name)).replace(/'/g,"%27");
    return new NextResponse(new Uint8Array(bytes),{headers:{"content-type":String(file.mime_type||"application/octet-stream"),"content-disposition":`attachment; filename*=UTF-8''${filename}`,"content-length":String(bytes.byteLength),"x-content-type-options":"nosniff"}});
  }catch(error){
    if(typeof error==="object"&&error!==null&&"code" in error&&error.code==="ENOENT")return NextResponse.json({error:"الملف غير متاح على الخادم"},{status:410});
    throw error;
  }
}
