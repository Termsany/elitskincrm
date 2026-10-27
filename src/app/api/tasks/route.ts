import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

export async function GET(req: Request){
  const user = await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const showArchived = searchParams.get("archived")==="true";
  const isAdmin = user.role==="admin";
  const conds:string[]=[]; const vals:unknown[]=[]; let i=1;
  if(!isAdmin){ conds.push(`EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.user_id=$${i++})`); vals.push(user.id); }
  else if(searchParams.get("repId")){ conds.push(`EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.user_id=$${i++})`); vals.push(searchParams.get("repId")); }
  if(!showArchived) conds.push(`t.archived=false`);
  if(status){
    if(isAdmin) conds.push(`t.status = $${i++}`); else conds.push(`EXISTS (SELECT 1 FROM task_assignees ta2 WHERE ta2.task_id=t.id AND ta2.user_id=$${i++} AND ta2.status=$${i++})`), vals.push(user.id, status);
    if(isAdmin) vals.push(status);
  }
  // Search
  const q=(searchParams.get("q")||"").trim();
  if(q){ conds.push(`(t.title ILIKE $${i} OR t.description ILIKE $${i})`); vals.push(`%${q}%`); i++; }
  const where = conds.length? `WHERE ${conds.join(" AND ")}`:"";
  const r = await query(`
    SELECT t.*, u2.name creator_name, d.name doctor_name, d.clinic_name,
      (SELECT json_agg(json_build_object('user_id', ta.user_id, 'name', u.name, 'status', ta.status) ORDER BY u.name) FROM task_assignees ta JOIN users u ON u.id=ta.user_id WHERE ta.task_id=t.id) assignees,
      (SELECT count(*)::int FROM task_checklist c WHERE c.task_id=t.id) checklist_total,
      (SELECT count(*)::int FROM task_checklist c WHERE c.task_id=t.id AND c.is_done=true) checklist_done,
      (SELECT count(*)::int FROM task_comments c WHERE c.task_id=t.id) comments_count,
      (SELECT count(*)::int FROM task_attachments a WHERE a.task_id=t.id) attachments_count
    FROM tasks t JOIN users u2 ON u2.id=t.created_by LEFT JOIN doctors d ON d.id=t.doctor_id
    ${where} ORDER BY t.created_at DESC LIMIT 100
  `, vals);
  return NextResponse.json({ tasks: r.rows });
}

export async function POST(req: Request){
  const user = await getCurrentUser();
  if(!user || user.role!=="admin") return NextResponse.json({error:"Forbidden"},{status:403});
  const body = await req.json().catch(()=>null) as Record<string,unknown>|null;
  if(!body) return NextResponse.json({error:"Invalid"},{status:400});
  const title=String(body.title||"").trim();
  if(title.length<3) return NextResponse.json({error:"العنوان 3+ أحرف"},{status:400});
  const idsRaw = (body.assigned_ids as string[]) || (body.assigned_to ? (Array.isArray(body.assigned_to)? body.assigned_to: [body.assigned_to]) : []);
  const assignedIds=[...new Set(idsRaw.filter(Boolean).map(String))];
  if(!assignedIds.length) return NextResponse.json({error:"اختر مندوب واحد على الأقل"},{status:400});
  const due = body.due_date && String(body.due_date).trim() ? String(body.due_date) : null;
  const doctorId = body.doctor_id && String(body.doctor_id).trim() ? String(body.doctor_id) : null;
  const priority=String(body.priority||"medium");
  const repeat=String(body.repeat_interval||"none");
  // Keep assigned_to as first for backward compat
  const r = await query(
    `INSERT INTO tasks(title, description, assigned_to, created_by, priority, due_date, doctor_id, repeat_interval) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [title, String(body.description||""), assignedIds[0], user.id, priority, due, doctorId, repeat]
  );
  const taskId=r.rows[0].id as string;
  for(const uid of assignedIds){
    await query(`INSERT INTO task_assignees(task_id, user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [taskId, uid]);
    await query(`INSERT INTO task_notifications(user_id, task_id, kind, message) VALUES($1,$2,'assigned',$3)`, [uid, taskId, `مهمة جديدة: ${title}`]);
  }
  // Handle checklist if provided
  const checklist = body.checklist as string[]|undefined;
  if(Array.isArray(checklist)){
    for(const item of checklist.slice(0,20)){
      if(String(item).trim()) await query(`INSERT INTO task_checklist(task_id, title) VALUES($1,$2)`, [taskId, String(item).trim()]);
    }
  }
  await query(`INSERT INTO audit_logs(actor_id, action, entity, entity_id, details) VALUES($1,'create','task',$2,$3)`, [user.id, taskId, title]);
  // Schedule reminder: create notification for due-1 day (cron will send)
  return NextResponse.json({id:taskId},{status:201});
}
