import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pool, query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canConfirmRepReset } from "@/lib/rep-lifecycle";

const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Counts={visits:number;visitItems:number;visitAttachments:number;plans:number;planItems:number;serviceRequests:number;doctorRequests:number;sales:number;targets:number;productAssignments:number;taskAssignments:number;tasks:number;taskComments:number;taskAttachments:number;notifications:number;sessions:number;annualSalesTarget:number};
const countsSql=`
SELECT
 (SELECT count(*)::int FROM visits WHERE sales_rep_id=$1) visits,
 (SELECT count(*)::int FROM visit_items vi JOIN visits v ON v.id=vi.visit_id WHERE v.sales_rep_id=$1) "visitItems",
 (SELECT count(*)::int FROM visit_attachments va JOIN visits v ON v.id=va.visit_id WHERE v.sales_rep_id=$1) "visitAttachments",
 (SELECT count(*)::int FROM plans WHERE user_id=$1) plans,
 (SELECT count(*)::int FROM plan_items pi JOIN plans p ON p.id=pi.plan_id WHERE p.user_id=$1) "planItems",
 (SELECT count(*)::int FROM service_requests WHERE requester_id=$1) "serviceRequests",
 (SELECT count(*)::int FROM doctor_requests WHERE requester_id=$1) "doctorRequests",
 (SELECT count(*)::int FROM rep_monthly_sales WHERE rep_id=$1) sales,
 (SELECT count(*)::int FROM targets WHERE user_id=$1) targets,
 (SELECT count(*)::int FROM rep_products WHERE rep_id=$1) "productAssignments",
 (SELECT count(*)::int FROM task_assignees WHERE user_id=$1) "taskAssignments",
 (SELECT count(*)::int FROM tasks t WHERE t.created_by=$1 AND (t.assigned_to IS NULL OR t.assigned_to=$1) AND NOT EXISTS(SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.user_id<>$1)) tasks,
 (SELECT count(*)::int FROM task_comments WHERE user_id=$1) "taskComments",
 (SELECT count(*)::int FROM task_attachments a JOIN tasks t ON t.id=a.task_id WHERE t.created_by=$1 AND (t.assigned_to IS NULL OR t.assigned_to=$1) AND NOT EXISTS(SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.user_id<>$1)) "taskAttachments",
 (SELECT count(*)::int FROM task_notifications WHERE user_id=$1) notifications,
 (SELECT count(*)::int FROM sessions WHERE user_id=$1) sessions,
 (SELECT COALESCE(annual_sales_target,0) FROM users WHERE id=$1) "annualSalesTarget"`;
async function getCounts(db:{query:(text:string,values?:unknown[])=>Promise<{rows:Record<string,number>[]}>},id:string){const r=await db.query(countsSql,[id]);return r.rows[0] as Counts;}
function isSafeUpload(filePath:string,root:string){const base=path.resolve(root)+path.sep;return path.resolve(filePath).startsWith(base);}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 const admin=await getCurrentUser();if(!admin||admin.role!=="admin")return NextResponse.json({error:"Forbidden"},{status:403});
 const {id}=await params;if(!idPattern.test(id))return NextResponse.json({error:"المعرف غير صالح"},{status:400});
 const body=await req.json().catch(()=>null) as {action?:string}|null;
 if(!body||!['deactivate','reactivate'].includes(body.action||''))return NextResponse.json({error:"الإجراء غير صالح"},{status:400});
 const client=await pool.connect();
 try{await client.query("BEGIN");const locked=await client.query("SELECT name,active FROM users WHERE id=$1 AND role='sales_rep' FOR UPDATE",[id]);if(!locked.rows[0]){await client.query("ROLLBACK");return NextResponse.json({error:"المندوب غير موجود"},{status:404});}
  const active=body.action==='reactivate';await client.query("UPDATE users SET active=$1 WHERE id=$2",[active,id]);
  if(!active)await client.query("DELETE FROM sessions WHERE user_id=$1",[id]);
  await client.query("INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,$2,'sales_rep',$3,$4)",[admin.id,active?'reactivate':'deactivate',id,JSON.stringify({name:locked.rows[0].name})]);
  await client.query("COMMIT");return NextResponse.json({ok:true,active});
 }catch{await client.query("ROLLBACK");return NextResponse.json({error:"تعذر تحديث حالة المندوب"},{status:500});}finally{client.release();}
}

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const admin=await getCurrentUser();if(!admin||admin.role!=="admin")return NextResponse.json({error:"Forbidden"},{status:403});
 const {id}=await params;if(!idPattern.test(id))return NextResponse.json({error:"المعرف غير صالح"},{status:400});
 const body=await req.json().catch(()=>null) as {action?:string;enteredName?:string;phrase?:string;expectedCounts?:Record<string,unknown>}|null;
 if(!body||!['preview','reset'].includes(body.action||''))return NextResponse.json({error:"الإجراء غير صالح"},{status:400});
 if(body.action==='preview'){
  const rep=await query("SELECT name FROM users WHERE id=$1 AND role='sales_rep'",[id]);if(!rep.rows[0])return NextResponse.json({error:"المندوب غير موجود"},{status:404});
  return NextResponse.json({name:rep.rows[0].name,counts:await getCounts(pool,id)});
 }
 const client=await pool.connect();let files:string[]=[];let committed=false;
 try{
  await client.query("BEGIN");
  const rep=await client.query("SELECT name FROM users WHERE id=$1 AND role='sales_rep' FOR UPDATE",[id]);
  if(!rep.rows[0]){await client.query("ROLLBACK");return NextResponse.json({error:"المندوب غير موجود"},{status:404});}
  const name=String(rep.rows[0].name);
  if(!canConfirmRepReset(name,body.enteredName||"",body.phrase||"")){await client.query("ROLLBACK");return NextResponse.json({error:"اكتب اسم المندوب كما هو وكلمة تصفير للتأكيد"},{status:400});}
  const counts=await getCounts(client,id);
  const expected=body.expectedCounts||{};
  if(Object.keys(counts).some(key=>Number(expected[key])!==Number(counts[key as keyof Counts]))){await client.query("ROLLBACK");return NextResponse.json({error:"تغيرت البيانات بعد المعاينة؛ حدّث المعاينة قبل التأكيد"},{status:409});}
  await client.query("UPDATE users SET active=false WHERE id=$1",[id]);
  const doomedTasks=await client.query(`SELECT t.id FROM tasks t WHERE t.created_by=$1 AND (t.assigned_to IS NULL OR t.assigned_to=$1) AND NOT EXISTS(SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.user_id<>$1)`,[id]);
  const taskIds=doomedTasks.rows.map((r:Record<string,string>)=>r.id);
  const attachments=await client.query(`SELECT file_path FROM visit_attachments va JOIN visits v ON v.id=va.visit_id WHERE v.sales_rep_id=$1 UNION ALL SELECT a.file_path FROM task_attachments a WHERE a.task_id=ANY($2::uuid[])`,[id,taskIds]);
  files=attachments.rows.map((r:Record<string,string>)=>String(r.file_path));
  await client.query("DELETE FROM task_comments WHERE user_id=$1",[id]);
  await client.query("DELETE FROM task_notifications WHERE user_id=$1",[id]);
  await client.query("DELETE FROM doctor_requests WHERE requester_id=$1",[id]);
  await client.query("DELETE FROM service_requests WHERE requester_id=$1",[id]);
  await client.query("DELETE FROM plans WHERE user_id=$1",[id]);
  await client.query(`UPDATE tasks t SET assigned_to=(SELECT ta.user_id FROM task_assignees ta WHERE ta.task_id=t.id AND ta.user_id<>$1 ORDER BY ta.user_id LIMIT 1) WHERE t.assigned_to=$1 AND NOT (t.created_by=$1 AND NOT EXISTS(SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.user_id<>$1))`,[id]);
  await client.query("DELETE FROM task_assignees WHERE user_id=$1",[id]);
  if(taskIds.length)await client.query("DELETE FROM tasks WHERE id=ANY($1::uuid[])",[taskIds]);
  await client.query("DELETE FROM visits WHERE sales_rep_id=$1",[id]);
  await client.query("DELETE FROM rep_monthly_sales WHERE rep_id=$1",[id]);
  await client.query("DELETE FROM targets WHERE user_id=$1",[id]);
  await client.query("DELETE FROM rep_products WHERE rep_id=$1",[id]);
  await client.query("DELETE FROM sessions WHERE user_id=$1",[id]);
  await client.query("UPDATE users SET assigned_product_id=NULL,annual_sales_target=0 WHERE id=$1",[id]);
  await client.query("INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'reset_data','sales_rep',$2,$3)",[admin.id,id,JSON.stringify({rep_name:name,counts})]);
  await client.query("COMMIT");committed=true;
  const root=process.env.UPLOAD_DIR||"/tmp/elite-crm-uploads";let filesDeleted=0;
  for(const file of files){if(!isSafeUpload(file,root))continue;try{await fs.unlink(file);filesDeleted++;}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")console.error("Rep reset: attachment cleanup failed");}}
  return NextResponse.json({ok:true,counts,filesDeleted});
 }catch(error){if(!committed)await client.query("ROLLBACK");console.error("Rep data reset failed");return NextResponse.json({error:"تعذر تصفير البيانات؛ لم يتم اعتماد المعاملة"},{status:500});}finally{client.release();}
}
