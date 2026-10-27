import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { pool,query } from "@/lib/db";
import { doctorSchema } from "@/lib/validation";
import { normalizeDoctorImportRow } from "@/lib/doctor-import";
import { sheetToObjects } from "@/lib/workbook";
import ExcelJS from "exceljs";

export async function POST(req:Request){
 const user=await getCurrentUser();if(!user||user.role!=="admin")return NextResponse.json({error:"Forbidden"},{status:403});
 let rawRows:Record<string,unknown>[]=[];
 const contentType=req.headers.get("content-type")||"";
 if(contentType.includes("multipart/form-data")){
  const form=await req.formData(),file=form.get("file");
  if(!(file instanceof File))return NextResponse.json({error:"اختر ملف Excel"},{status:400});
  if(file.size>10*1024*1024)return NextResponse.json({error:"حجم الملف يجب ألا يتجاوز 10MB"},{status:400});
  const workbook=new ExcelJS.Workbook();
  // @types/node's generic Buffer<T> and exceljs's bundled (older, non-generic) Buffer type are
  // structurally incompatible at the type level only; Buffer.from(arrayBuffer) is exactly what
  // exceljs expects at runtime (confirmed by a manual end-to-end parse test).
  await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
  const sheet=workbook.worksheets[0];
  if(!sheet)return NextResponse.json({error:"الملف لا يحتوي على أي ورقة عمل"},{status:400});
  rawRows=sheetToObjects(sheet);
 }else{
  const body=await req.json().catch(()=>null) as {doctors?:Record<string,unknown>[]} | null;rawRows=Array.isArray(body?.doctors)?body.doctors:[];
 }
 if(!rawRows.length)return NextResponse.json({error:"الملف لا يحتوي على بيانات"},{status:400});
 if(rawRows.length>5000)return NextResponse.json({error:"الحد الأقصى 5000 طبيب في الملف"},{status:400});
 const client=await pool.connect();let inserted=0,updated=0,skipped=0;const errors:string[]=[];
 try{
  await client.query("BEGIN");
  for(let i=0;i<rawRows.length;i++){
   const normalized=normalizeDoctorImportRow(rawRows[i]),{id,...candidate}=normalized,parsed=doctorSchema.safeParse(candidate);
   if(!parsed.success){skipped++;errors.push(`سطر ${i+2}: ${parsed.error.issues.map(x=>x.message).join("، ")}`);continue}
   const d=parsed.data;
   try{
    if(id){
     const result=await client.query("UPDATE doctors SET name=$1,clinic_name=$2,city=$3,specialty=$4,classification=$5,phone=$6,status=$7 WHERE id=$8 RETURNING id",[d.name,d.clinic_name||"",d.city||"",d.specialty||"",d.classification||"",d.phone||"",d.status||"active",id]);
     if(result.rowCount){updated++;continue}
    }
    const result=await client.query(`INSERT INTO doctors(name,clinic_name,city,specialty,classification,phone,status) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(name,clinic_name,phone) DO UPDATE SET city=excluded.city,specialty=excluded.specialty,classification=excluded.classification,status=excluded.status
      RETURNING (xmax=0) inserted`,[d.name,d.clinic_name||"",d.city||"",d.specialty||"",d.classification||"",d.phone||"",d.status||"active"]);
    if(result.rows[0]?.inserted)inserted++;else updated++;
   }catch(e:unknown){skipped++;errors.push(`سطر ${i+2}: ${e instanceof Error?e.message:String(e)}`)}
  }
  await client.query("COMMIT");
 }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
 await query("INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'bulk_import','doctor','',$2)",[user.id,`inserted ${inserted} updated ${updated} skipped ${skipped}`]);
 return NextResponse.json({inserted,updated,skipped,total:rawRows.length,errors:errors.slice(0,30)});
}
