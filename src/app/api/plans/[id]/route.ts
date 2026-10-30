import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { pool, query } from "@/lib/db";
import { canAdminReviewPlan, planDateOnly } from "@/lib/plan-review";
import { planItemsNow, planRequests, submitPlanChange } from "@/lib/plan-changes";

export async function GET(_req: Request, {params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const r=await query(`SELECT p.*, p.period_start::text AS period_start, p.period_end::text AS period_end, u.name user_name, u2.name approved_by_name FROM plans p JOIN users u ON u.id=p.user_id LEFT JOIN users u2 ON u2.id=p.approved_by WHERE p.id=$1`,[id]);
  if(!r.rows[0]) return NextResponse.json({error:"Not found"},{status:404});
  const plan=r.rows[0] as Record<string,unknown>;
  if(user.role!=="admin" && String(plan.user_id)!==user.id) return NextResponse.json({error:"Forbidden"},{status:403});
  const items=await query(`SELECT pi.*, pi.planned_date::text AS planned_date, d.name doctor_name, d.clinic_name, d.city doctor_city, p.name product_name FROM plan_items pi JOIN doctors d ON d.id=pi.doctor_id LEFT JOIN products p ON p.id=pi.product_id WHERE pi.plan_id=$1 ORDER BY pi.sort_order, pi.planned_date`,[id]);
  const revis=await query(`SELECT pr.*, u.name user_name FROM plan_revisions pr JOIN users u ON u.id=pr.requested_by WHERE pr.plan_id=$1 ORDER BY pr.created_at`,[id]);
  const comments=await query(`SELECT c.*, u.name user_name FROM task_comments c JOIN users u ON u.id=c.user_id WHERE c.plan_id=$1 ORDER BY c.created_at`,[id]);
  // Compare: which planned visits were actually executed
  const execRows=await query(`
    SELECT pi.id plan_item_id, EXISTS(
      SELECT 1 FROM visits v WHERE v.doctor_id=pi.doctor_id AND v.sales_rep_id=$2 AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=pi.planned_date
    ) as done
    FROM plan_items pi WHERE pi.plan_id=$1
  `,[id, plan.user_id]);
  const doneMap=new Map(execRows.rows.map((x:Record<string,unknown>)=> [String(x.plan_item_id), !!x.done]));
  const changes=await planRequests(id, await planItemsNow({query}, id));
  return NextResponse.json({plan, items:items.rows.map((x:Record<string,unknown>)=> ({...x, done: !!doneMap.get(String(x.id))})), revisions:revis.rows, comments: comments.rows, change_request: changes.request, change_history: changes.history});
}

export async function PATCH(req: Request, {params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const existing=await query(`SELECT p.*, p.period_start::text AS period_start, p.period_end::text AS period_end FROM plans p WHERE id=$1`,[id]);
  if(!existing.rows[0]) return NextResponse.json({error:"Not found"},{status:404});
  const plan=existing.rows[0] as Record<string,unknown>;
  const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
  if(!body) return NextResponse.json({error:"Invalid"},{status:400});

  if(user.role==="admin"){
    const newStatus=body.status as string|undefined;
    if(newStatus && ["approved","rejected","needs_revision"].includes(newStatus)){
      const client=await pool.connect();
      try{
        await client.query("BEGIN");
        const locked=await client.query(`SELECT p.*,p.period_start::text AS period_start,p.period_end::text AS period_end FROM plans p WHERE id=$1 FOR UPDATE`,[id]);
        if(!locked.rows[0]){await client.query("ROLLBACK");return NextResponse.json({error:"Not found"},{status:404});}
        const current=locked.rows[0] as Record<string,unknown>;
        if(!canAdminReviewPlan(current.status)){await client.query("ROLLBACK");return NextResponse.json({error:"تم اتخاذ قرار على هذه الخطة بالفعل. حدّث الصفحة لمشاهدة حالتها الحالية."},{status:409});}
        const reviewStart=planDateOnly(current.period_start),reviewEnd=planDateOnly(current.period_end);
        if(!reviewStart||!reviewEnd){await client.query("ROLLBACK");return NextResponse.json({error:"تواريخ الخطة غير صحيحة"},{status:400});}
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`,[current.user_id]);
        if(newStatus==="approved"){
          const overlap=await client.query(`SELECT id FROM plans WHERE user_id=$1 AND id<>$2 AND status='approved' AND period_start<=$4::date AND period_end>=$3::date LIMIT 1`,[current.user_id,id,reviewStart,reviewEnd]);
          if(overlap.rows[0]){await client.query("ROLLBACK");return NextResponse.json({error:"توجد خطة معتمدة أخرى لنفس المندوب في هذه التواريخ"},{status:409});}
        }
        const updated=await client.query(`UPDATE plans SET status=$1,admin_note=$2,approved_by=$3,approved_at=$4,updated_at=now() WHERE id=$5 AND status='pending' RETURNING id`,[newStatus,String(body.admin_note||""),user.id,newStatus==="approved"?new Date().toISOString():null,id]);
        if(!updated.rows[0]){await client.query("ROLLBACK");return NextResponse.json({error:"تمت معالجة الخطة من مستخدم آخر. حدّث الصفحة."},{status:409});}
        const periodName=current.period==="daily"?"اليومية":current.period==="monthly"?"الشهرية":"الأسبوعية";
        const msg=newStatus==="approved"?`تمت الموافقة على خطتك — ${periodName}`:newStatus==="rejected"?`تم رفض خطتك: ${body.admin_note||""}`:`مطلوب تعديل على خطتك: ${body.admin_note||""}`;
        await client.query(`INSERT INTO task_notifications(user_id,task_id,plan_id,kind,message) VALUES($1,NULL,$2,$3,$4)`,[current.user_id,id,`plan_${newStatus}`,msg]);
        await client.query(`INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,$2,'plan',$3,$4)`,[user.id,newStatus,id,JSON.stringify({from:current.status,to:newStatus,period_start:reviewStart,period_end:reviewEnd})]);
        await client.query("COMMIT"); return NextResponse.json({ok:true});
      }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
    }
    const nextStart=planDateOnly(body.period_start||plan.period_start),nextEnd=planDateOnly(body.period_end||plan.period_end);
    if(!nextStart||!nextEnd)return NextResponse.json({error:"تواريخ الخطة غير صحيحة"},{status:400});
    if(String(plan.status)==="approved"&&(body.period_start||body.period_end||body.items)){
      const overlap=await query(`SELECT id FROM plans WHERE user_id=$1 AND id<>$2 AND status='approved' AND period_start<=$4::date AND period_end>=$3::date LIMIT 1`,[plan.user_id,id,nextStart,nextEnd]);
      if(overlap.rows[0]) return NextResponse.json({error:"توجد خطة معتمدة أخرى لنفس المندوب في هذه التواريخ"},{status:409});
    }
    if(body.items && Array.isArray(body.items)){
      await query(`DELETE FROM plan_items WHERE plan_id=$1`,[id]);
      for(let idx=0; idx<(body.items as Array<Record<string,unknown>>).length; idx++){
        const it=body.items[idx] as Record<string,unknown>;
        await query(`INSERT INTO plan_items(plan_id, doctor_id, planned_date, product_id, note, priority, sort_order) VALUES($1,$2,$3,$4,$5,$6,$7)`,[id, it.doctor_id, it.planned_date, it.product_id||null, it.note||"", it.priority||"medium", idx]);
      }
      await query(`UPDATE plans SET updated_at=now() WHERE id=$1`,[id]);
    }
    // Rating
    if(body.rating!==undefined){
      await query(`UPDATE plans SET rating=$1 WHERE id=$2`,[body.rating, id]);
    }
    if(body.archived!==undefined){
      await query(`UPDATE plans SET archived=$1 WHERE id=$2`,[!!body.archived, id]);
    }
    const sets:string[]=[]; const vals:unknown[]=[]; let i=1;
    if(body.period_start) { sets.push(`period_start=$${i++}`); vals.push(String(body.period_start)); }
    if(body.period_end) { sets.push(`period_end=$${i++}`); vals.push(String(body.period_end)); }
    if(body.target_visits!==undefined) { sets.push(`target_visits=$${i++}`); vals.push(body.target_visits||null); }
    if(sets.length){ vals.push(id); await query(`UPDATE plans SET ${sets.join(",")}, updated_at=now() WHERE id=$${i}`, vals); }
    if((body.items && Array.isArray(body.items)) || sets.length){
      await query(`INSERT INTO task_notifications(user_id,task_id,plan_id,kind,message) VALUES($1,NULL,$2,'plan_updated_by_admin',$3)`,[plan.user_id,id,`قام المدير بتعديل خطتك ${plan.period==="weekly"?"الأسبوعية":"الشهرية"}`]);
      await query(`INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'update','plan',$2,$3)`,[user.id,id,`admin edit status ${plan.status}`]);
    }
    return NextResponse.json({ok:true});
  }

  // Rep: request revision
  if(String(plan.user_id)!==user.id) return NextResponse.json({error:"Forbidden"},{status:403});
  if(String(plan.status)==="approved"){
    const r=await submitPlanChange(user, id, body.items, body.note);
    const { status, ...out } = r; return NextResponse.json(out, { status });
  }
  if(body.items && Array.isArray(body.items)){
    const note=String(body.note|| body.admin_note || "طلب تعديل");
    if(note.trim().length<5) return NextResponse.json({error:"اكتب سبب التعديل (5+ أحرف)"},{status:400});
    await query(`INSERT INTO plan_revisions(plan_id, requested_by, note, changes) VALUES($1,$2,$3,$4)`,[id, user.id, note, JSON.stringify(body.items).slice(0,5000)]);
    await query(`DELETE FROM plan_items WHERE plan_id=$1`,[id]);
    for(let idx=0; idx<(body.items as Array<Record<string,unknown>>).length; idx++){
      const it=body.items[idx] as Record<string,unknown>;
      await query(`INSERT INTO plan_items(plan_id, doctor_id, planned_date, product_id, note, priority, sort_order) VALUES($1,$2,$3,$4,$5,$6,$7)`,[id, it.doctor_id, it.planned_date, it.product_id||null, it.note||"", it.priority||"medium", idx]);
    }
    await query(`UPDATE plans SET status='pending', updated_at=now() WHERE id=$1`,[id]);
    const admins=await query(`SELECT id FROM users WHERE role='admin'`);
    for(const a of admins.rows as Record<string,unknown>[]) await query(`INSERT INTO task_notifications(user_id, task_id, plan_id, kind, message) VALUES($1,NULL,$2,'plan_revision',$3)`,[a.id, id, `${user.name} طلب تعديل — ${note.slice(0,60)}`]);
    return NextResponse.json({ok:true});
  }
  return NextResponse.json({error:"أرسل items مع note"},{status:400});
}

export async function DELETE(req: Request, {params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const existing=await query(`SELECT user_id, status FROM plans WHERE id=$1`,[id]);
  if(!existing.rows[0]) return NextResponse.json({error:"Not found"},{status:404});
  if(user.role!=="admin" && String(existing.rows[0].user_id)!==user.id) return NextResponse.json({error:"Forbidden"},{status:403});
  if(user.role!=="admin" && String(existing.rows[0].status)==="approved") return NextResponse.json({error:"الخطة المعتمدة لا يمكن حذفها إلا بواسطة المدير"},{status:400});
  await query(`DELETE FROM plans WHERE id=$1`,[id]);
  return NextResponse.json({ok:true});
}
