import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { csvSafe } from "@/lib/csv";
function esc(v:unknown){ return `"${csvSafe(v).replace(/"/g,'""')}"`; }
export async function GET(req: Request){
  const user=await getCurrentUser(); if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const { searchParams }=new URL(req.url);
  const id=searchParams.get("id");
  if(!id) return NextResponse.json({error:"id required"},{status:400});
  const plan=await query(`SELECT p.*, u.name user_name FROM plans p JOIN users u ON u.id=p.user_id WHERE p.id=$1`,[id]);
  if(!plan.rows[0]) return NextResponse.json({error:"Not found"},{status:404});
  if(user.role!=="admin" && String(plan.rows[0].user_id)!==user.id) return NextResponse.json({error:"Forbidden"},{status:403});
  const items=await query(`SELECT pi.planned_date, pi.priority, pi.note, d.name doctor_name, d.clinic_name, d.city, p.name product_name FROM plan_items pi JOIN doctors d ON d.id=pi.doctor_id LEFT JOIN products p ON p.id=pi.product_id WHERE pi.plan_id=$1 ORDER BY pi.planned_date`,[id]);
  const format=searchParams.get("format")||"xlsx";
  if(format==="csv"){
    const header=["التاريخ","الطبيب","العيادة","المدينة","المنتج","الأولوية","ملاحظة"].map(esc).join(",");
    const lines=items.rows.map((x:Record<string,unknown>)=> [x.planned_date? new Date(x.planned_date as string).toLocaleDateString("ar-EG"):"", x.doctor_name, x.clinic_name, x.city, x.product_name, x.priority, x.note].map(esc).join(","));
    const csv="\uFEFF"+[header,...lines].join("\n");
    return new NextResponse(csv,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="plan-${id.slice(0,8)}.csv"`}});
  }
  const ExcelJS=await import("exceljs");
  const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet("الخطة");
  const pr=plan.rows[0] as Record<string,unknown>;
  ws.addRow([`خطة ${pr.period==="weekly"?"أسبوعية":"شهرية"} — ${pr.user_name}`]); ws.addRow([`الفترة: ${pr.period_start} → ${pr.period_end} — الحالة: ${pr.status}`]); ws.addRow([]);
  const hr=ws.addRow(["التاريخ","الطبيب","العيادة","المدينة","المنتج","الأولوية","ملاحظة"]);
  hr.eachCell(c=>{ c.font={bold:true, color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern", pattern:"solid", fgColor:{argb:"FF091424"}}; });
  for(const x of items.rows as Record<string,unknown>[]) ws.addRow([x.planned_date? new Date(x.planned_date as string).toLocaleDateString("ar-EG"):"", x.doctor_name, x.clinic_name, x.city, x.product_name, x.priority, x.note]);
  ws.columns.forEach(c=> c.width=18);
  const buf=await wb.xlsx.writeBuffer();
  return new NextResponse(buf as unknown as BodyInit,{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":`attachment; filename="plan-${id.slice(0,8)}.xlsx"`}});
}
