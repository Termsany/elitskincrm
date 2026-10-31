import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { badId, validIds } from "@/lib/ids";

export async function GET(_request:Request,{params}:{params:Promise<{id:string;attachmentId:string}>}){if(!validIds(await params))return badId();
  const user=await getCurrentUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id,attachmentId}=await params;
  const visit=await query(`SELECT sales_rep_id FROM visits WHERE id=$1`,[id]);
  if(!visit.rows[0])return NextResponse.json({error:"Not found"},{status:404});
  if(user.role!=="admin"&&visit.rows[0].sales_rep_id!==user.id)return NextResponse.json({error:"Forbidden"},{status:403});
  const result=await query(`SELECT file_name,file_path,mime_type FROM visit_attachments WHERE id=$1 AND visit_id=$2`,[attachmentId,id]);
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
