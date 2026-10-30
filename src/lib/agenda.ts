import { query, pool } from "@/lib/db";
import { applyReplace, mergeIntoPending } from "@/lib/plan-changes";
import { diffSummaryText } from "@/lib/plan-diff";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DAY_RE = /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const riyadhToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
type Who = { id: string; role: string; name: string };

/** Everything that happens in a rep's (or the team's) days: plan, done visits, events, follow-ups, tasks. */
export async function agenda(u: Who, from: string, to: string, repId: string | null) {
  const owner = u.role === "admin" ? repId : u.id;
  const ownerSql = (col: string, vals: unknown[]) => { if (!owner) return ""; vals.push(owner); return ` AND ${col}=$${vals.length}`; };

  const v1: unknown[] = [from, to];
  const plan = await query(`SELECT pi.id, pi.planned_date::text AS date, pi.priority, COALESCE(pi.note,'') note, p.id plan_id, p.status::text plan_status,
      p.period::text period, p.period_start::text period_start, p.period_end::text period_end, p.user_id rep_id, u.name rep_name,
      d.id doctor_id, d.name doctor_name, d.clinic_name, d.city, d.classification, d.phone, pr.id product_id, pr.name product_name,
      (SELECT v.id FROM visits v WHERE v.doctor_id=pi.doctor_id AND v.sales_rep_id=p.user_id AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=pi.planned_date
        AND v.status IN ('completed','follow_up') ORDER BY v.visited_at LIMIT 1) visit_id,
      EXISTS(SELECT 1 FROM plan_edit_requests r WHERE r.plan_id=p.id AND r.status='pending' AND (r.proposed_items @> jsonb_build_array(jsonb_build_object('item_id', pi.id::text)) OR r.proposed_items @> '[{"op":"replace"}]'::jsonb)) change_pending
    FROM plan_items pi JOIN plans p ON p.id=pi.plan_id JOIN users u ON u.id=p.user_id JOIN doctors d ON d.id=pi.doctor_id LEFT JOIN products pr ON pr.id=pi.product_id
    WHERE p.status::text NOT IN ('rejected') AND pi.planned_date BETWEEN $1::date AND $2::date ${ownerSql("p.user_id", v1)}
    ORDER BY pi.planned_date, CASE pi.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, pi.sort_order`, v1);

  const v2: unknown[] = [from, to];
  const visits = await query(`SELECT v.id, (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date::text date, v.visited_at, v.status::text status, v.sales_rep_id rep_id, u.name rep_name,
      d.id doctor_id, d.name doctor_name, d.clinic_name, d.city, d.classification
    FROM visits v JOIN doctors d ON d.id=v.doctor_id JOIN users u ON u.id=v.sales_rep_id
    WHERE v.visited_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Riyadh') AND v.visited_at < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Riyadh') ${ownerSql("v.sales_rep_id", v2)}
    ORDER BY v.visited_at`, v2);

  const v3: unknown[] = [from, to];
  let evWhere = "";
  if (u.role !== "admin") { v3.push(u.id); evWhere = ` AND (e.owner_id=$3 OR EXISTS (SELECT 1 FROM collaboration_requests cr WHERE cr.id=e.collaboration_request_id AND (cr.requester_id=$3 OR cr.target_user_id=$3)))`; }
  else if (owner) { v3.push(owner); evWhere = ` AND e.owner_id=$3`; }
  const events = await query(`SELECT e.id, e.title, COALESCE(e.description,'') description, e.event_type, e.status, e.starts_at, e.ends_at, e.owner_id rep_id, u.name rep_name,
      e.doctor_id, d.name doctor_name, e.task_id, e.visit_id, e.service_request_id, e.collaboration_request_id, (e.starts_at AT TIME ZONE 'Asia/Riyadh')::date::text date
    FROM calendar_events e JOIN users u ON u.id=e.owner_id LEFT JOIN doctors d ON d.id=e.doctor_id
    WHERE e.starts_at < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Riyadh') AND e.ends_at > ($1::date::timestamp AT TIME ZONE 'Asia/Riyadh') ${evWhere}
    ORDER BY e.starts_at`, v3);

  const v4: unknown[] = [from, to];
  const fo = ownerSql("x.rep_id", v4);
  const followups = await query(`SELECT * FROM (
      SELECT 'visit:'||v.id id, v.follow_up_at::text date, COALESCE(v.follow_up_note,'') note, v.sales_rep_id rep_id, u.name rep_name, d.id doctor_id, d.name doctor_name, d.clinic_name,
        EXISTS(SELECT 1 FROM visits v2 WHERE v2.doctor_id=v.doctor_id AND v2.sales_rep_id=v.sales_rep_id AND v2.visited_at>v.visited_at AND v2.status='completed') done
      FROM visits v JOIN doctors d ON d.id=v.doctor_id JOIN users u ON u.id=v.sales_rep_id WHERE v.follow_up_at IS NOT NULL
      UNION ALL
      SELECT 'doctor:'||f.id, f.due_at::text, concat_ws(' — ', NULLIF(f.title,''), NULLIF(f.note,'')), f.sales_rep_id, u.name, d.id, d.name, d.clinic_name,
        (f.completed_at IS NOT NULL OR f.status IN ('done','completed','closed'))
      FROM doctor_followups f JOIN doctors d ON d.id=f.doctor_id JOIN users u ON u.id=f.sales_rep_id WHERE f.due_at IS NOT NULL
    ) x WHERE x.date BETWEEN $1 AND $2 ${fo} ORDER BY x.date`, v4);

  const v5: unknown[] = [from, to];
  let tw = "";
  if (owner) { v5.push(owner); tw = ` AND (t.assigned_to=$3 OR EXISTS(SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.user_id=$3))`; }
  const tasks = await query(`SELECT t.id, t.title, t.due_date::text date, t.status::text status, t.priority::text priority, t.doctor_id
    FROM tasks t WHERE t.archived=false AND t.status::text NOT IN ('completed','failed') AND t.due_date BETWEEN $1::date AND $2::date ${tw} ORDER BY t.due_date`, v5);

  return { from, to, today: riyadhToday(), plan: plan.rows, visits: visits.rows, events: events.rows, followups: followups.rows, tasks: tasks.rows };
}

// ───────────── plan changes ─────────────
async function notify(userIds: string[], planId: string | null, kind: string, message: string) {
  for (const id of userIds) await query("INSERT INTO task_notifications(user_id,task_id,plan_id,kind,message) VALUES($1,NULL,$2,$3,$4)", [id, planId, kind, message]);
}
async function adminIds() { return (await query<{ id: string }>("SELECT id FROM users WHERE role='admin' AND active")).rows.map(r => r.id); }
const EDITABLE = new Set(["draft", "pending", "needs_revision"]);

/** Move one planned visit to another day. Admin: direct. Rep: direct on unapproved plans, otherwise a change request. */
export async function movePlanItem(u: Who, itemId: string, date: string, note: string) {
  const r = await query(`SELECT pi.id, pi.planned_date::text date, pi.doctor_id, p.id plan_id, p.user_id, p.status::text status, p.period_start::text ps, p.period_end::text pe, d.name doctor_name
    FROM plan_items pi JOIN plans p ON p.id=pi.plan_id JOIN doctors d ON d.id=pi.doctor_id WHERE pi.id=$1`, [itemId]);
  const it = r.rows[0] as Record<string, string> | undefined;
  if (!it) return { status: 404, error: "الزيارة غير موجودة" };
  if (u.role !== "admin" && it.user_id !== u.id) return { status: 403, error: "Forbidden" };
  if (it.date === date) return { status: 200, ok: true };
  if (date < it.ps || date > it.pe) return { status: 400, error: `اليوم الجديد خارج فترة الخطة (${it.ps} → ${it.pe})` };
  if (u.role !== "admin" && date < riyadhToday()) return { status: 400, error: "لا يمكن النقل ليوم فات" };
  if (u.role === "admin" || EDITABLE.has(it.status)) {
    await query("UPDATE plan_items SET planned_date=$2 WHERE id=$1", [itemId, date]);
    await query("UPDATE plans SET updated_at=now() WHERE id=$1", [it.plan_id]);
    await query("INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'move','plan_item',$2,$3)", [u.id, itemId, JSON.stringify({ from: it.date, to: date })]);
    if (u.role === "admin" && it.user_id !== u.id) await notify([it.user_id], it.plan_id, "plan_updated_by_admin", `المدير نقل زيارة ${it.doctor_name} من ${it.date} إلى ${date}`);
    return { status: 200, ok: true };
  }
  const dup = await query("SELECT 1 FROM plan_edit_requests WHERE plan_id=$1 AND status='pending' AND proposed_items @> $2::jsonb", [it.plan_id, JSON.stringify([{ item_id: itemId }])]);
  if (dup.rowCount) return { status: 409, error: "فيه طلب تعديل لسه مستني رد المدير على الزيارة دي" };
  const ops = [{ op: "move", item_id: itemId, doctor_id: it.doctor_id, doctor_name: it.doctor_name, from: it.date, to: date }];
  if (await mergeIntoPending(it.plan_id, ops[0], { item_id: itemId, date: it.date }, note || "")) {
    await notify(await adminIds(), it.plan_id, "plan_change_request", `${u.name} طلب نقل زيارة ${it.doctor_name} من ${it.date} إلى ${date}`);
    return { status: 202, requested: true };
  }
  await query("INSERT INTO plan_edit_requests(plan_id, requested_by, note, proposed_items, original_items, status) VALUES($1,$2,$3,$4,$5,'pending')",
    [it.plan_id, u.id, note || "نقل زيارة", JSON.stringify(ops), JSON.stringify([{ item_id: itemId, date: it.date }])]);
  await notify(await adminIds(), it.plan_id, "plan_change_request", `${u.name} طلب نقل زيارة ${it.doctor_name} من ${it.date} إلى ${date}`);
  return { status: 202, requested: true };
}

/** Add a doctor visit on a day to the owner's plan (creating a daily plan if none covers that day). */
export async function addPlanItem(u: Who, ownerId: string, date: string, doctorId: string, productId: string | null, note: string) {
  if (u.role !== "admin" && date < riyadhToday()) return { status: 400, error: "لا يمكن الإضافة ليوم فات" };
  const doc = (await query<{ name: string }>("SELECT name FROM doctors WHERE id=$1 AND status='active'", [doctorId])).rows[0];
  if (!doc) return { status: 400, error: "الطبيب غير موجود" };
  if (u.role === "admin") {
    const rep = await query("SELECT 1 FROM users WHERE id=$1 AND role='sales_rep' AND active", [ownerId]);
    if (!rep.rowCount) return { status: 400, error: "اختر المندوب" };
  }
  const plans = (await query<{ id: string; status: string }>(`SELECT id, status::text status FROM plans WHERE user_id=$1 AND status::text<>'rejected'
      AND period_start<=$2::date AND period_end>=$2::date ORDER BY CASE status::text WHEN 'approved' THEN 0 ELSE 1 END, period_start DESC`, [ownerId, date])).rows;
  const target = u.role === "admin" ? plans[0] : (plans.find(p => EDITABLE.has(p.status)) || plans[0]);
  const insert = async (planId: string) => {
    await query(`INSERT INTO plan_items(plan_id, doctor_id, planned_date, product_id, note, priority, sort_order)
      VALUES($1,$2,$3,$4,$5,'medium',COALESCE((SELECT max(sort_order)+1 FROM plan_items WHERE plan_id=$1),0))`, [planId, doctorId, date, productId, note]);
    await query("UPDATE plans SET updated_at=now() WHERE id=$1", [planId]);
  };
  if (target && (u.role === "admin" || EDITABLE.has(target.status))) {
    await insert(target.id);
    if (u.role === "admin" && ownerId !== u.id) await notify([ownerId], target.id, "plan_updated_by_admin", `المدير أضاف زيارة ${doc.name} لخطتك يوم ${date}`);
    return { status: 201, ok: true, planId: target.id };
  }
  if (target) { // approved plan → change request
    const ops = [{ op: "add", doctor_id: doctorId, doctor_name: doc.name, product_id: productId, to: date, note }];
    if (await mergeIntoPending(target.id, ops[0], null, note || "")) {
      await notify(await adminIds(), target.id, "plan_change_request", `${u.name} طلب إضافة زيارة ${doc.name} يوم ${date}`);
      return { status: 202, requested: true };
    }
    await query("INSERT INTO plan_edit_requests(plan_id, requested_by, note, proposed_items, original_items, status) VALUES($1,$2,$3,$4,'[]','pending')", [target.id, u.id, note || "إضافة زيارة", JSON.stringify(ops)]);
    await notify(await adminIds(), target.id, "plan_change_request", `${u.name} طلب إضافة زيارة ${doc.name} يوم ${date}`);
    return { status: 202, requested: true };
  }
  // no plan covers the day → new daily plan
  const status = u.role === "admin" ? "approved" : "pending";
  const p = await query<{ id: string }>(`INSERT INTO plans(user_id, period, period_start, period_end, status, approved_by, approved_at) VALUES($1,'daily',$2,$2,$3,$4,$5) RETURNING id`,
    [ownerId, date, status, u.role === "admin" ? u.id : null, u.role === "admin" ? new Date() : null]);
  await insert(p.rows[0].id);
  if (u.role !== "admin") await notify(await adminIds(), p.rows[0].id, "plan_submitted", `${u.name} أضاف خطة يومية ${date} — بانتظار الموافقة`);
  return { status: 201, ok: true, planId: p.rows[0].id, newPlan: true, pending: status === "pending" };
}

export async function listChangeRequests(u: Who) {
  const r = await query(`SELECT r.id, r.plan_id, r.note, r.proposed_items, r.status, r.created_at, u.name requested_by_name, u.id requested_by, p.period_start::text ps, p.period_end::text pe
    FROM plan_edit_requests r JOIN users u ON u.id=r.requested_by JOIN plans p ON p.id=r.plan_id
    WHERE r.status='pending' ${u.role === "admin" ? "" : "AND r.requested_by=$1"} ORDER BY r.created_at`, u.role === "admin" ? [] : [u.id]);
  return r.rows;
}

export async function reviewChangeRequest(u: Who, id: string, approve: boolean, adminNote: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query("SELECT * FROM plan_edit_requests WHERE id=$1 FOR UPDATE", [id]);
    const req = r.rows[0];
    if (!req) { await client.query("ROLLBACK"); return { status: 404, error: "الطلب غير موجود" }; }
    if (req.status !== "pending") { await client.query("ROLLBACK"); return { status: 409, error: "اتخذ قرار على الطلب ده بالفعل" }; }
    if (approve) {
      for (const op of req.proposed_items as Array<Record<string, string>>) {
        if (op.op === "move") await client.query("UPDATE plan_items SET planned_date=$2 WHERE id=$1 AND plan_id=$3", [op.item_id, op.to, req.plan_id]);
        if (op.op === "add") await client.query(`INSERT INTO plan_items(plan_id, doctor_id, planned_date, product_id, note, priority, sort_order)
          VALUES($1,$2,$3,$4,$5,'medium',COALESCE((SELECT max(sort_order)+1 FROM plan_items WHERE plan_id=$1),0))`, [req.plan_id, op.doctor_id, op.to, op.product_id || null, op.note || ""]);
        if (op.op === "remove") await client.query("DELETE FROM plan_items WHERE id=$1 AND plan_id=$2", [op.item_id, req.plan_id]);
        if (op.op === "replace") await applyReplace(client, req.plan_id, (op as unknown as { items: never[] }).items);
      }
      await client.query("UPDATE plans SET updated_at=now() WHERE id=$1", [req.plan_id]);
    }
    await client.query("UPDATE plan_edit_requests SET status=$2, admin_note=$3, reviewed_by=$4, reviewed_at=now() WHERE id=$1", [id, approve ? "approved" : "rejected", adminNote, u.id]);
    const ops = req.proposed_items as Array<Record<string, string>>;
    const isReplace = ops.some(o => o.op === "replace");
    const what = ops.map(o => o.op === "replace" ? `تعديل الخطة المعتمدة (${diffSummaryText((o as unknown as { summary: { added: number; removed: number; moved: number; changed: number } }).summary || { added: 0, removed: 0, moved: 0, changed: 0 })})` : o.op === "move" ? `نقل ${o.doctor_name} إلى ${o.to}` : o.op === "add" ? `إضافة ${o.doctor_name} يوم ${o.to}` : "حذف زيارة").join("، ");
    await client.query("INSERT INTO task_notifications(user_id,task_id,plan_id,kind,message,action_url) VALUES($1,NULL,$2,$3,$4,$5)",
      [req.requested_by, req.plan_id, approve ? "plan_change_approved" : "plan_change_rejected", `${approve ? "تمت الموافقة على" : "تم رفض"} طلبك: ${what}${adminNote ? ` — ${adminNote}` : ""}`, isReplace ? `/plans?planId=${req.plan_id}` : null]);
    await client.query("INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,$2,'plan_edit_request',$3,$4)", [u.id, approve ? "approve" : "reject", id, what]);
    await client.query("COMMIT");
    return { status: 200, ok: true };
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}
