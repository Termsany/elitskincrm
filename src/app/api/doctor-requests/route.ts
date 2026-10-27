import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

const fields=["name","clinic_name","city","specialty","classification","phone","email"] as const;
function clean(input:Record<string,unknown>){const out:Record<string,string>={};for(const k of fields) out[k]=String(input[k]??"").trim();return out;}
export async function GET(){
 const user=await getCurrentUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const r=user.role==="admin"?await query(`SELECT dr.*,u.name requester_name,d.name doctor_name FROM doctor_requests dr JOIN users u ON u.id=dr.requester_id LEFT JOIN doctors d ON d.id=dr.doctor_id ORDER BY dr.created_at DESC LIMIT 500`):await query(`SELECT dr.*,d.name doctor_name FROM doctor_requests dr LEFT JOIN doctors d ON d.id=dr.doctor_id WHERE dr.requester_id=$1 ORDER BY dr.created_at DESC LIMIT 100`,[user.id]);
 return NextResponse.json({requests:r.rows});
}
export async function POST(req:Request){
 const user=await getCurrentUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401}); if(user.role!=="sales_rep")return NextResponse.json({error:"Forbidden"},{status:403});
 const body=await req.json().catch(()=>null) as Record<string,unknown>|null; if(!body)return NextResponse.json({error:"بيانات غير صالحة"},{status:400});
 const kind=body.kind==="update"?"update":"create"; const payload=clean((body.payload||{}) as Record<string,unknown>); const doctorId=body.doctor_id?String(body.doctor_id):null;
 if(!payload.name||payload.name.length<2)return NextResponse.json({error:"اسم الطبيب مطلوب"},{status:400});
 if(kind==="update"&&!doctorId)return NextResponse.json({error:"الطبيب المطلوب غير محدد"},{status:400});
 const r=await query(`INSERT INTO doctor_requests(requester_id,doctor_id,kind,payload) VALUES($1,$2,$3,$4::jsonb) RETURNING id`,[user.id,doctorId,kind,JSON.stringify(payload)]);
 return NextResponse.json({id:r.rows[0].id},{status:201});
}