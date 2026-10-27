import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getDetailedReportData } from "@/lib/report-data";
import { normalizeReportType,reportDefinition,reportTitle } from "@/lib/reporting";
function csv(v:unknown){return `"${String(v??"").replace(/"/g,'""')}"`}
function display(key:string,value:unknown){if(value===null||value===undefined)return "";if(["visited_at","last_visit","last_activity","last_sample"].includes(key))return new Date(String(value)).toLocaleString("ar-EG");const labels:Record<string,string>={completed:"مكتملة",planned:"مخططة",cancelled:"ملغاة"};return labels[String(value)]||String(value)}
export async function GET(req:Request){
 const user=await getCurrentUser();if(!user||user.role!=="admin")return NextResponse.json({error:"Forbidden"},{status:403});
 const {searchParams}=new URL(req.url),format=searchParams.get("format")||"csv",type=normalizeReportType(searchParams.get("reportType"));
 const data=await getDetailedReportData(searchParams),def=reportDefinition(type),rows=data[def.source] as Array<Record<string,unknown>>,title=reportTitle(type),stamp=new Date().toISOString().slice(0,10);
 if(format==="json")return NextResponse.json({title,rows});
 if(format==="csv"){const text="\uFEFF"+[def.columns.map(c=>csv(c.label)).join(","),...rows.map(r=>def.columns.map(c=>csv(display(c.key,r[c.key]))).join(","))].join("\n");return new NextResponse(text,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="elite-crm-${type}-${stamp}.csv"`}})}
 if(format==="xlsx"){
  const ExcelJS=await import("exceljs"),wb=new ExcelJS.Workbook(),ws=wb.addWorksheet(title.slice(0,31));wb.creator="Elite Skin CRM";ws.views=[{state:"frozen",ySplit:1,rightToLeft:true}];
  const header=ws.addRow(def.columns.map(c=>c.label));header.height=26;header.eachCell(c=>{c.font={bold:true,color:{argb:"FFFFFFFF"}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF0E1C34"}};c.alignment={horizontal:"center",vertical:"middle"}});
  rows.forEach(r=>ws.addRow(def.columns.map(c=>display(c.key,r[c.key]))));ws.columns.forEach((c,i)=>{c.width=Math.max(14,Math.min(35,def.columns[i].label.length+12))});ws.autoFilter={from:{row:1,column:1},to:{row:1,column:def.columns.length}};ws.eachRow(row=>row.eachCell(c=>{c.alignment={vertical:"middle",horizontal:"right",wrapText:true};c.border={top:{style:"thin",color:{argb:"FFDDE3EC"}},left:{style:"thin",color:{argb:"FFDDE3EC"}},bottom:{style:"thin",color:{argb:"FFDDE3EC"}},right:{style:"thin",color:{argb:"FFDDE3EC"}}}}));
  const buf=await wb.xlsx.writeBuffer();return new NextResponse(buf as unknown as BodyInit,{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":`attachment; filename="elite-crm-${type}-${stamp}.xlsx"`}})
 }
 if(format==="pdf"){
  const PDFDocument=(await import("pdfkit")).default,chunks:Buffer[]=[];const doc=new PDFDocument({size:"A4",layout:"landscape",margin:28});doc.on("data",(c:Buffer)=>chunks.push(c));
  doc.fontSize(16).text(`Elite Skin CRM - ${type}`,{align:"center"});doc.fontSize(9).text(`${stamp} | Rows: ${rows.length}`,{align:"center"}).moveDown();
  const cols=def.columns.slice(0,8),usable=785,colW=usable/cols.length;let y=doc.y;
  const drawHeader=()=>{let x=28;cols.forEach(c=>{doc.rect(x,y,colW,20).fillAndStroke("#0E1C34","#DDE3EC");doc.fillColor("#FFFFFF").fontSize(7).text(c.label,x+3,y+6,{width:colW-6,ellipsis:true});x+=colW});doc.fillColor("#000000");y+=20};drawHeader();
  for(const row of rows.slice(0,500)){if(y>545){doc.addPage({size:"A4",layout:"landscape",margin:28});y=28;drawHeader()}let x=28;cols.forEach(c=>{doc.rect(x,y,colW,18).stroke("#DDE3EC");doc.fontSize(6.5).text(display(c.key,row[c.key]),x+3,y+5,{width:colW-6,height:10,ellipsis:true});x+=colW});y+=18}doc.end();
  const buf:Buffer=await new Promise((resolve,reject)=>{doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject)});return new NextResponse(buf as unknown as BodyInit,{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="elite-crm-${type}-${stamp}.pdf"`}})
 }
 return NextResponse.json({error:"format must be csv|xlsx|pdf|json"},{status:400});
}
