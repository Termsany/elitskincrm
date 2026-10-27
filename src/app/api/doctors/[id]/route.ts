import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/session";
import {query} from "@/lib/db";
import {doctorContactPatchSchema,doctorSchema} from "@/lib/validation";
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id}=await params,body=await req.json().catch(()=>null);if(!body||typeof body!=="object")return NextResponse.json({error:"بيانات غير صحيحة"},{status:400});
 const parsed=user.role==="admin"?doctorSchema.partial().strict().safeParse(body):doctorContactPatchSchema.safeParse(body);
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||"بيانات غير صحيحة"},{status:400});
 const data=parsed.data as Record<string,unknown>,allowed=user.role==="admin"?["name","clinic_name","city","specialty","classification","phone","email","status"]:["phone","email"];
 const sets:string[]=[],values:unknown[]=[];let i=1;for(const key of allowed)if(data[key]!==undefined){sets.push(`${key}=$${i++}`);values.push(String(data[key]??"").trim())}
 if(!sets.length)return NextResponse.json({error:"لا توجد تغييرات"},{status:400});values.push(id);
 const updated=await query(`UPDATE doctors SET ${sets.join(",")} WHERE id=$${i} RETURNING id,name,clinic_name,city,specialty,classification,phone,email,status`,values);
 if(!updated.rows[0])return NextResponse.json({error:"الطبيب غير موجود"},{status:404});
 await query(`INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'update','doctor',$2,$3)`,[user.id,id,JSON.stringify({fields:Object.keys(data),role:user.role})]);
 return NextResponse.json({doctor:updated.rows[0]});
}
