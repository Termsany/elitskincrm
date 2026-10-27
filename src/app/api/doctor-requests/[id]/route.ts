import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 const user=await getCurrentUser(); if(!user||user.role!=="admin")return NextResponse.json({error:"Forbidden"},{status:403});
 const {id}=await params; const body=await req.json().catch(()=>null) as {status?:string;admin_note?:string;payload?:Record<string,unknown>}|null; const status=body?.status;
 if(status!==undefined&&status!=="approved"&&status!=="rejected")return NextResponse.json({error:"حالة غير صالحة"},{status:400});
 const clean=(input:Record<string,unknown>)=>Object.fromEntries(["name","clinic_name","city","specialty","classification","phone","email"].map(k=>[k,String(input[k]??"").trim()]));
 const client=await pool.connect(); try{await client.query("BEGIN"); const r=await client.query(`SELECT * FROM doctor_requests WHERE id=$1 FOR UPDATE`,[id]); if(!r.rowCount){await client.query("ROLLBACK");return NextResponse.json({error:"الطلب غير موجود"},{status:404});} const reqRow=r.rows[0]; if(reqRow.status!=="pending"){await client.query("ROLLBACK");return NextResponse.json({error:"تمت مراجعة الطلب سابقا"},{status:409});}
  const payload=body?.payload?clean(body.payload):reqRow.payload;
  if(!payload.name||String(payload.name).length<2){await client.query("ROLLBACK");return NextResponse.json({error:"اسم الطبيب مطلوب"},{status:400});}
  if(status==="approved"){const p=payload; if(reqRow.kind==="create"){await client.query(`INSERT INTO doctors(name,clinic_name,city,specialty,classification,phone,email,status) VALUES($1,$2,$3,$4,$5,$6,$7,'active')`,[p.name||"",p.clinic_name||"",p.city||"",p.specialty||"",p.classification||"",p.phone||"",p.email||""]);}else{await client.query(`UPDATE doctors SET name=$1,clinic_name=$2,city=$3,specialty=$4,classification=$5,phone=$6,email=$7 WHERE id=$8`,[p.name||"",p.clinic_name||"",p.city||"",p.specialty||"",p.classification||"",p.phone||"",p.email||"",reqRow.doctor_id]);}}
  const nextStatus=status||reqRow.status;
  await client.query(`UPDATE doctor_requests SET status=$1,payload=$2::jsonb,admin_note=$3,reviewed_by=$4,reviewed_at=CASE WHEN $1<>'pending' THEN now() ELSE reviewed_at END WHERE id=$5`,[nextStatus,JSON.stringify(payload),String(body?.admin_note||reqRow.admin_note||""),user.id,id]);
  await client.query(`INSERT INTO task_notifications(user_id,task_id,kind,message) VALUES($1,NULL,$2,$3)`,[reqRow.requester_id,`doctor_request_${nextStatus}`,nextStatus==="approved"?"تمت الموافقة على طلب الطبيب وتطبيقه":nextStatus==="rejected"?`تم رفض طلب الطبيب: ${String(body?.admin_note||"")}`:"تم تعديل طلب الطبيب من الإدارة، وهو بانتظار الاعتماد"]);
  await client.query(`INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,$2,'doctor_request',$3,$4)`,[user.id,status?status==="approved"?"approve":"reject":"update",id,JSON.stringify({payload,admin_note:body?.admin_note||""})]);
  await client.query("COMMIT"); return NextResponse.json({ok:true});
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}