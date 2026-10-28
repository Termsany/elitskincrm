import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { resolvePlanCreation } from "@/lib/plan-permissions";
import { findFiveDayDuplicate } from "@/lib/plan-workflow";
import { riyadhDateParts } from "@/lib/plan-reminders";

export async function GET(req: Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const { searchParams }=new URL(req.url);
  const isAdmin=user.role==="admin";
  const conds:string[]=[]; const vals:unknown[]=[]; let i=1;
  if(!isAdmin){ conds.push(`p.user_id=$${i++}`); vals.push(user.id); }
  else if(searchParams.get("repId")){ conds.push(`p.user_id=$${i++}`); vals.push(searchParams.get("repId")); }
  if(searchParams.get("status")){ conds.push(`p.status=$${i++}`); vals.push(searchParams.get("status")); }
  if(searchParams.get("period")){ conds.push(`p.period=$${i++}`); vals.push(searchParams.get("period")); }
  const where=conds.length? `WHERE ${conds.join(" AND ")}`:"";
  const r=await query(`
    SELECT p.*, u.name user_name, u2.name approved_by_name,
      (SELECT count(*)::int FROM plan_items pi WHERE pi.plan_id=p.id) items_count,
      (SELECT count(*)::int FROM plan_edit_requests pe WHERE pe.plan_id=p.id AND pe.status='pending') pending_edits
    FROM plans p JOIN users u ON u.id=p.user_id LEFT JOIN users u2 ON u2.id=p.approved_by
    ${where} ORDER BY p.created_at DESC LIMIT 100
  `, vals);
  const summaryWhere=isAdmin?"":`WHERE user_id=$1`;
  const summaryValues=isAdmin?[]:[user.id];
  const summaryResult=await query(`SELECT count(*)::int total,count(*) FILTER(WHERE status='pending')::int pending,count(*) FILTER(WHERE status='approved')::int approved,count(*) FILTER(WHERE status='needs_revision')::int needs_revision,count(*) FILTER(WHERE status='rejected')::int rejected,COALESCE(sum((SELECT count(*) FROM plan_items pi WHERE pi.plan_id=plans.id)),0)::int planned_visits FROM plans ${summaryWhere}`,summaryValues);
  const repSummary=isAdmin?await query(`SELECT u.id,u.name,u.active,count(p.id)::int total,count(p.id) FILTER(WHERE p.status='pending')::int pending,count(p.id) FILTER(WHERE p.status='approved')::int approved,COALESCE(sum((SELECT count(*) FROM plan_items pi WHERE pi.plan_id=p.id)),0)::int planned_visits FROM users u LEFT JOIN plans p ON p.user_id=u.id WHERE u.role='sales_rep' GROUP BY u.id,u.name,u.active ORDER BY u.active DESC,u.name`):{rows:[]};
  // Return the latest saved plan for each reusable template.
  const templates=await query(`
    SELECT DISTINCT ON (template_name) template_name name, id, period_start, period_end, target_visits
    FROM plans WHERE template_name<>'' AND user_id=$1
    ORDER BY template_name, created_at DESC
  `,[user.id]);
  return NextResponse.json({plans:r.rows,templates:templates.rows,summary:summaryResult.rows[0],repSummary:repSummary.rows});
}

export async function POST(req: Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
  if(!body) return NextResponse.json({error:"Invalid"},{status:400});
  const period=String(body.period||"");
  if(!["daily","weekly","monthly"].includes(period)) return NextResponse.json({error:"الفترة مطلوبة"},{status:400});
  const items=body.items as Array<{doctor_id:string; planned_date:string; product_id?:string; note?:string; priority?:string}>|undefined;
  if(!items || !items.length) return NextResponse.json({error:"أضف زيارة واحدة على الأقل"},{status:400});
  if(items.length>50) return NextResponse.json({error:"الحد 50 زيارة"},{status:400});
  const period_start=String(body.period_start||"");
  const period_end=String(body.period_end||"");
  if(period==="daily" && period_start!==period_end) return NextResponse.json({error:"الخطة اليومية يجب أن تكون في يوم واحد"},{status:400});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(period_start)||!/^\d{4}-\d{2}-\d{2}$/.test(period_end)||period_start>period_end) return NextResponse.json({error:"تواريخ الخطة غير صحيحة"},{status:400});
  const todayRiyadh=riyadhDateParts().date;
  if(user.role!=="admin" && period_start<todayRiyadh) return NextResponse.json({error:`لا يمكن إنشاء خطة تبدأ قبل تاريخ اليوم (${todayRiyadh})`},{status:400});
  if(user.role!=="admin" && items.some(it=>String(it.planned_date)<todayRiyadh)) return NextResponse.json({error:`لا يمكن إضافة زيارة بتاريخ سابق لليوم (${todayRiyadh})`},{status:400});
  let creation:{ownerId:string;status:"approved"|"pending"};
  try{ creation=resolvePlanCreation({actorId:user.id,role:user.role,requestedUserId:String(body.user_id||"")}); }
  catch(e){ return NextResponse.json({error:e instanceof Error?e.message:"اختر المندوب"},{status:400}); }
  if(user.role==="admin"){
    const rep=await query(`SELECT id FROM users WHERE id=$1 AND role='sales_rep' AND active=true`,[creation.ownerId]);
    if(!rep.rows[0]) return NextResponse.json({error:"المندوب غير موجود أو غير فعال"},{status:400});
  }
  const overlap=await query(`SELECT id FROM plans WHERE user_id=$1 AND status='approved' AND period_start<=$3::date AND period_end>=$2::date LIMIT 1`,[creation.ownerId,period_start,period_end]);
  if(overlap.rows[0]) return NextResponse.json({error:"توجد خطة معتمدة لنفس المندوب في هذه التواريخ"},{status:409});
  const warnings:string[]=[];
  for(const it of items){
    if(String(it.planned_date)<period_start||String(it.planned_date)>period_end) return NextResponse.json({error:"كل زيارة يجب أن تكون داخل تواريخ الخطة"},{status:400});
    const within=findFiveDayDuplicate(it.doctor_id,String(it.planned_date),items.filter(x=>x!==it));
    if(within) warnings.push(`تنبيه: الطبيب مكرر داخل الخطة خلال 5 أيام (${within})`);
    const previous=await query(`SELECT pi.planned_date,d.name FROM plan_items pi JOIN plans p ON p.id=pi.plan_id JOIN doctors d ON d.id=pi.doctor_id WHERE p.user_id=$1 AND pi.doctor_id=$2 AND abs(pi.planned_date-$3::date)<=5 AND p.status<>'rejected' ORDER BY abs(pi.planned_date-$3::date) LIMIT 1`,[creation.ownerId,it.doctor_id,it.planned_date]);
    if(previous.rows[0]) warnings.push(`تنبيه: ${previous.rows[0].name} موجود في خطة أخرى بتاريخ ${String(previous.rows[0].planned_date).slice(0,10)} خلال 5 أيام`);
  }
  const status=creation.status;
  const r=await query(`INSERT INTO plans(user_id, period, period_start, period_end, status, target_visits, template_name, approved_by, approved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [creation.ownerId, period, period_start, period_end, status, user.role==="admin" ? body.target_visits||null : null, String(body.template_name||""), user.role==="admin"?user.id:null, user.role==="admin"?new Date():null]);
  const planId=r.rows[0].id as string;
  for(let idx=0; idx<items.length; idx++){
    const it=items[idx];
    await query(`INSERT INTO plan_items(plan_id, doctor_id, planned_date, product_id, note, priority, sort_order) VALUES($1,$2,$3,$4,$5,$6,$7)`, [planId, it.doctor_id, it.planned_date, it.product_id||null, it.note||"", it.priority||"medium", idx]);
  }
  if(status==="pending"){
    const admins=await query(`SELECT id FROM users WHERE role='admin'`);
    for(const a of admins.rows as Record<string,unknown>[]) await query(`INSERT INTO task_notifications(user_id, task_id, plan_id, kind, message) VALUES($1,NULL,$2,'plan_pending',$3)`, [a.id, planId, `${user.name} أرسل خطة أسبوعية للموافقة`]);
  }
  if(user.role==="admin") await query(`INSERT INTO task_notifications(user_id, task_id, plan_id, kind, message) VALUES($1,NULL,$2,'plan_created_by_admin',$3)`,[creation.ownerId,planId,`أنشأ المدير خطة أسبوعية لك تبدأ ${period_start}`]);
  await query(`INSERT INTO audit_logs(actor_id, action, entity, entity_id, details) VALUES($1,'create','plan',$2,$3)`,[user.id, planId, `${period} ${period_start} owner ${creation.ownerId}`]);
  return NextResponse.json({id:planId,warnings:[...new Set(warnings)]},{status:201});
}
