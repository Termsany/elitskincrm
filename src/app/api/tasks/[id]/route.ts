import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { taskReminderDateWindow } from "@/lib/plan-reminders";

function isAdmin(user:{role:string}){ return user.role==="admin"; }

export async function GET(_req: Request, { params }: { params: Promise<{id:string}> }){
  const user = await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const r=await query(`
    SELECT t.*, u2.name creator_name, d.name doctor_name, d.clinic_name, d.city doctor_city,
      (SELECT json_agg(json_build_object('user_id', ta.user_id, 'name', u.name, 'status', ta.status, 'failure_note', ta.failure_note) ORDER BY u.name) FROM task_assignees ta JOIN users u ON u.id=ta.user_id WHERE ta.task_id=t.id) assignees
    FROM tasks t JOIN users u2 ON u2.id=t.created_by LEFT JOIN doctors d ON d.id=t.doctor_id WHERE t.id=$1
  `,[id]);
  if(!r.rows[0]) return NextResponse.json({error:"Not found"},{status:404});
  const task=r.rows[0] as Record<string,unknown>;
  // Check access
  const assignees=task.assignees as Array<{user_id:string}>|null;
  const isAssignee = assignees?.some(a=> a.user_id===user.id);
  if(!isAdmin(user) && !isAssignee && String(task.created_by)!==user.id) return NextResponse.json({error:"Forbidden"},{status:403});
  const checklist=await query(`SELECT * FROM task_checklist WHERE task_id=$1 ORDER BY created_at`,[id]);
  const comments=await query(`SELECT c.*, u.name user_name FROM task_comments c JOIN users u ON u.id=c.user_id WHERE c.task_id=$1 ORDER BY c.created_at`,[id]);
  const atts=await query(`SELECT id,file_name,mime_type,size_bytes,created_at FROM task_attachments WHERE task_id=$1 ORDER BY created_at`,[id]);
  return NextResponse.json({ task, checklist: checklist.rows, comments: comments.rows, attachments: atts.rows });
}

export async function PATCH(req: Request, { params }: { params: Promise<{id:string}> }){
  const user = await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const existing = await query(`SELECT * FROM tasks WHERE id=$1`, [id]);
  if(!existing.rows[0]) return NextResponse.json({error:"Not found"},{status:404});
  const task = existing.rows[0] as Record<string,unknown>;
  const body = await req.json().catch(()=>null) as Record<string,unknown>|null;
  if(!body) return NextResponse.json({error:"Invalid"},{status:400});
  const assigneeRows = await query(`SELECT user_id,status FROM task_assignees WHERE task_id=$1`,[id]);
  const assigneeIds=new Set(assigneeRows.rows.map((r:Record<string,unknown>)=> String(r.user_id)));
  const isAssignee=assigneeIds.has(user.id);
  const admin=isAdmin(user);

  // Status update: per-assignee if not admin
  const priorStatuses=new Map(assigneeRows.rows.map((r:Record<string,unknown>)=>[String(r.user_id),String(r.status)]));
  let statusChanged=false;
  const newStatus = body.status as string|undefined;
  if(newStatus){
    if(!["pending","in_progress","completed","failed"].includes(newStatus)) return NextResponse.json({error:"حالة غير صحيحة"},{status:400});
    const failureNote = body.failure_note as string|undefined;
    if(newStatus==="failed" && (!failureNote || String(failureNote).trim().length<5)) return NextResponse.json({error:"اكتب سبب عدم الاكتمال (5 أحرف على الأقل)"},{status:400});
    if(!admin && !isAssignee) return NextResponse.json({error:"غير مسموح"},{status:403});
    if(admin && body.assigned_to){
      // Admin updating global status — update all assignees
      const ids = Array.isArray(body.assigned_to)? body.assigned_to: [body.assigned_to];
      statusChanged=ids.some((uid)=>priorStatuses.get(String(uid))!==newStatus);
      for(const uid of ids) await query(`UPDATE task_assignees SET status=$1, failure_note=$2, completed_at=$3 WHERE task_id=$4 AND user_id=$5`, [newStatus, newStatus==="failed"? String(failureNote||""):"", newStatus==="completed"||newStatus==="failed"? new Date().toISOString():null, id, String(uid)]);
    } else if(isAssignee){
      statusChanged=priorStatuses.get(user.id)!==newStatus;
      await query(`UPDATE task_assignees SET status=$1, failure_note=$2, completed_at=$3, updated_at=now() WHERE task_id=$4 AND user_id=$5`, [newStatus, newStatus==="failed"? String(failureNote||""):"", newStatus==="completed"||newStatus==="failed"? new Date().toISOString():null, id, user.id]);
    } else if(admin){
      statusChanged=task.status!==newStatus||[...priorStatuses.values()].some((status)=>status!==newStatus);
      // Admin without specific assignee: update task global + all assignees
      await query(`UPDATE tasks SET status=$1 WHERE id=$2`, [newStatus, id]);
      await query(`UPDATE task_assignees SET status=$1 WHERE task_id=$2`, [newStatus, id]);
    }
    // Update global progress
    const prog=await query(`SELECT count(*)::int total, count(*) FILTER (WHERE status='completed')::int done FROM task_assignees WHERE task_id=$1`,[id]);
    const pct = prog.rows[0].total? Math.round(prog.rows[0].done/prog.rows[0].total*100):0;
    await query(`UPDATE tasks SET progress=$1, status=CASE WHEN $1=100 THEN 'completed' WHEN $1>0 THEN 'in_progress' ELSE status END WHERE id=$2`,[pct,id]);
    // Notify only on a real per-assignee/global status transition.
    if(statusChanged&&(newStatus==="completed"||newStatus==="failed")){
      const creatorId=String(task.created_by);
      const msg=newStatus==="completed"? `أكمل ${user.name} مهمة: ${task.title}`: `${user.name} لم يكمل: ${task.title} — ${failureNote}`;
      const kind=newStatus==="completed"?"completed":"failed";
      if(creatorId!==user.id) await query(`INSERT INTO task_notifications(user_id, task_id, kind, message) VALUES($1,$2,$3,$4)`,[creatorId,id,kind,msg]);
      // Also notify other assignees
      for(const uid of assigneeIds) if(uid!==user.id) await query(`INSERT INTO task_notifications(user_id, task_id, kind, message) VALUES($1,$2,'update',$3)`,[uid,id,msg]);
    }
    const allAssigneesCompleted=Number(prog.rows[0].total)>0&&Number(prog.rows[0].done)===Number(prog.rows[0].total);
    if(newStatus==="completed"&&allAssigneesCompleted&&task.repeat_interval&&String(task.repeat_interval)!=="none"){
      const days=String(task.repeat_interval)==="weekly"?7:30;
      const {today}=taskReminderDateWindow();
      const nextDue=new Date(`${today}T00:00:00.000Z`);nextDue.setUTCDate(nextDue.getUTCDate()+days);
      const nr=await query(`INSERT INTO tasks(title,description,assigned_to,created_by,priority,due_date,doctor_id,repeat_interval,recurrence_parent_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (recurrence_parent_id) WHERE recurrence_parent_id IS NOT NULL DO NOTHING RETURNING id`,[task.title,task.description,task.assigned_to,task.created_by,task.priority,nextDue.toISOString().slice(0,10),task.doctor_id,task.repeat_interval,id]);
      if(nr.rows[0]){const nid=nr.rows[0].id as string;for(const uid of assigneeIds)await query(`INSERT INTO task_assignees(task_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[nid,uid]);}
    }
  }

  // Admin-only fields
  if(admin){
    const sets:string[]=[]; const vals:unknown[]=[]; let i=1;
    if(body.title!==undefined){ sets.push(`title=$${i++}`); vals.push(String(body.title).trim()); }
    if(body.description!==undefined){ sets.push(`description=$${i++}`); vals.push(String(body.description)); }
    if(body.priority!==undefined){ sets.push(`priority=$${i++}`); vals.push(body.priority); }
    if(body.due_date!==undefined){ sets.push(`due_date=$${i++}`); vals.push(String(body.due_date)||null); }
    if(body.doctor_id!==undefined){ sets.push(`doctor_id=$${i++}`); vals.push(String(body.doctor_id)||null); }
    if(body.repeat_interval!==undefined){ sets.push(`repeat_interval=$${i++}`); vals.push(body.repeat_interval); }
    if(body.archived!==undefined){ sets.push(`archived=$${i++}`); vals.push(!!body.archived); }
    if(body.rating!==undefined){ sets.push(`rating=$${i++}`); vals.push(body.rating); }
    // Reassign
    if(body.assigned_ids!==undefined && Array.isArray(body.assigned_ids)){
      const newIds=[...new Set((body.assigned_ids as string[]).map(String))];
      await query(`DELETE FROM task_assignees WHERE task_id=$1`,[id]);
      for(const uid of newIds) await query(`INSERT INTO task_assignees(task_id, user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[id, uid]);
      if(newIds.length) await query(`UPDATE tasks SET assigned_to=$1 WHERE id=$2`,[newIds[0], id]);
    }
    if(sets.length){
      sets.push(`updated_at=$${i++}`); vals.push(new Date().toISOString());
      vals.push(id);
      await query(`UPDATE tasks SET ${sets.join(", ")} WHERE id=$${i}`, vals);
    }
  }

  await query(`INSERT INTO audit_logs(actor_id, action, entity, entity_id, details) VALUES($1,'update','task',$2,$3)`, [user.id, id, JSON.stringify(body).slice(0,1000)]);
  return NextResponse.json({ok:true});
}

export async function DELETE(req: Request, { params }: { params: Promise<{id:string}> }){
  const user = await getCurrentUser();
  if(!user || !isAdmin(user)) return NextResponse.json({error:"Forbidden"},{status:403});
  const {id}=await params;
  await query(`DELETE FROM tasks WHERE id=$1`, [id]);
  return NextResponse.json({ok:true});
}
