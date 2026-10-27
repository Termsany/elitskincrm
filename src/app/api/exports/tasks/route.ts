import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
function esc(v:unknown){ return `"${String(v??"").replace(/"/g,'""')}"`; }
export async function GET(req: Request){
  const user=await getCurrentUser(); if(!user || user.role!=="admin") return NextResponse.json({error:"Forbidden"},{status:403});
  const { searchParams }=new URL(req.url);
  const format=searchParams.get("format")||"csv";
  const r=await query(`
    SELECT t.title, t.description, t.status, t.priority, t.due_date, t.progress, t.rating,
           (SELECT string_agg(u.name, ', ' ORDER BY u.name) FROM task_assignees ta JOIN users u ON u.id=ta.user_id WHERE ta.task_id=t.id) assignees,
           u2.name creator, d.name doctor_name
    FROM tasks t JOIN users u2 ON u2.id=t.created_by LEFT JOIN doctors d ON d.id=t.doctor_id ORDER BY t.created_at DESC
  `);
  if(format==="json") return NextResponse.json({tasks:r.rows});
  const header=["العنوان","الوصف","الحالة","الأولوية","الاستحقاق","التقدم%","التقييم","المسؤولون","المنشئ","الطبيب"].map(esc).join(",");
  const lines=r.rows.map((x:Record<string,unknown>)=> [x.title,x.description,x.status,x.priority,x.due_date,x.progress,x.rating,x.assignees,x.creator,x.doctor_name].map(esc).join(","));
  const csv="\uFEFF"+[header,...lines].join("\n");
  if(format==="xlsx"){
    const ExcelJS=await import("exceljs");
    const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet("المهام");
    const hr=ws.addRow(["العنوان","الوصف","الحالة","الأولوية","الاستحقاق","التقدم%","التقييم","المسؤولون","المنشئ","الطبيب"]);
    hr.eachCell(c=>{ c.font={bold:true, color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern", pattern:"solid", fgColor:{argb:"FF091424"}}; });
    for(const x of r.rows as Record<string,unknown>[]) ws.addRow([x.title,x.description,x.status,x.priority,x.due_date,x.progress,x.rating,x.assignees,x.creator,x.doctor_name]);
    ws.columns.forEach(c=> c.width=18);
    const buf=await wb.xlsx.writeBuffer();
    return new NextResponse(buf as unknown as BodyInit,{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":`attachment; filename="tasks-${new Date().toISOString().slice(0,10)}.xlsx"`}});
  }
  return new NextResponse(csv,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="tasks-${new Date().toISOString().slice(0,10)}.csv"`}});
}
