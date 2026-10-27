import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
function csv(v:unknown){return `"${String(v??"").replace(/"/g,'""')}"`}
export async function GET(req:Request){
 const user=await getCurrentUser();if(!user||user.role!=="admin")return NextResponse.json({error:"Forbidden"},{status:403});
 const format=new URL(req.url).searchParams.get("format")||"xlsx",r=await query("SELECT id,name,clinic_name,city,specialty,classification,phone,status FROM doctors ORDER BY name"),stamp=new Date().toISOString().slice(0,10);
 const headers=["معرف الطبيب","اسم الطبيب","العيادة","المدينة","التخصص","التصنيف","الهاتف","الحالة"];
 if(format==="csv"){const lines=r.rows.map((x:Record<string,unknown>)=>[x.id,x.name,x.clinic_name,x.city,x.specialty,x.classification,x.phone,x.status].map(csv).join(","));return new NextResponse("\uFEFF"+[headers.map(csv).join(","),...lines].join("\n"),{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="doctors-${stamp}.csv"`}})}
 const ExcelJS=await import("exceljs"),wb=new ExcelJS.Workbook(),ws=wb.addWorksheet("الأطباء والعيادات");wb.creator="Elite Skin CRM";ws.views=[{state:"frozen",ySplit:1,rightToLeft:true}];
 const header=ws.addRow(headers);header.height=28;header.eachCell(c=>{c.font={bold:true,color:{argb:"FFFFFFFF"}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF0E1C34"}};c.alignment={horizontal:"center",vertical:"middle"}});
 for(const x of r.rows as Record<string,unknown>[])ws.addRow([x.id,x.name,x.clinic_name,x.city,x.specialty,x.classification,x.phone,x.status]);
 ws.columns=[{width:38},{width:25},{width:26},{width:18},{width:18},{width:12},{width:18},{width:12}];ws.autoFilter={from:"A1",to:"H1"};ws.getColumn(1).hidden=true;
 ws.eachRow((row,n)=>row.eachCell(c=>{c.alignment={horizontal:n===1?"center":"right",vertical:"middle"};c.border={top:{style:"thin",color:{argb:"FFDDE3EC"}},left:{style:"thin",color:{argb:"FFDDE3EC"}},bottom:{style:"thin",color:{argb:"FFDDE3EC"}},right:{style:"thin",color:{argb:"FFDDE3EC"}}}}));
 const info=wb.addWorksheet("تعليمات");info.views=[{rightToLeft:true}];info.getColumn(1).width=100;["تعليمات رفع بيانات الأطباء","1- عدّل البيانات في ورقة الأطباء والعيادات ثم ارفع نفس الملف.","2- لا تحذف أو تعدّل عمود معرف الطبيب المخفي، لأنه يستخدم لتحديث السجل الصحيح.","3- لإضافة طبيب جديد أضف صفًا جديدًا واترك معرف الطبيب فارغًا.","4- الحقول المدعومة: اسم الطبيب، العيادة، المدينة، التخصص، التصنيف، الهاتف، الحالة.","5- الصفوف غير الصحيحة لن تمنع استيراد باقي الملف وسيظهر تقرير بالأخطاء."].forEach((v,i)=>{const row=info.addRow([v]);row.height=i?24:32;if(i===0){row.getCell(1).font={bold:true,size:16,color:{argb:"FF0E1C34"}}}});
 const buf=await wb.xlsx.writeBuffer();return new NextResponse(buf as unknown as BodyInit,{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":`attachment; filename="doctors-${stamp}.xlsx"`}})
}
