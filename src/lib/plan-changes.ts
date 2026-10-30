import { pool, query } from "@/lib/db";
import { applyRequestOps, dayKeys, diffCounts, diffPlanItems, diffSummaryText, type PlanItemLike } from "@/lib/plan-diff";

type Who = { id: string; role: string; name: string };
type Q = { query: (sql: string, vals?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());

export async function planItemsNow(db: Q, planId: string): Promise<PlanItemLike[]> {
  const r = await db.query(`SELECT pi.id, pi.doctor_id::text doctor_id, pi.planned_date::text planned_date, pi.product_id::text product_id, pi.priority::text priority, COALESCE(pi.note,'') note,
      d.name doctor_name, d.clinic_name, d.city, pr.name product_name
    FROM plan_items pi JOIN doctors d ON d.id=pi.doctor_id LEFT JOIN products pr ON pr.id=pi.product_id WHERE pi.plan_id=$1 ORDER BY pi.planned_date, pi.sort_order`, [planId]);
  return r.rows as PlanItemLike[];
}

async function enrich(items: PlanItemLike[]) {
  const dIds = [...new Set(items.map(x => x.doctor_id).filter(x => UUID.test(x)))];
  const pIds = [...new Set(items.map(x => String(x.product_id || "")).filter(x => UUID.test(x)))];
  const ds = dIds.length ? (await query(`SELECT id::text id, name, clinic_name, city FROM doctors WHERE id = ANY($1::uuid[])`, [dIds])).rows as Array<Record<string, string>> : [];
  const ps = pIds.length ? (await query(`SELECT id::text id, name FROM products WHERE id = ANY($1::uuid[])`, [pIds])).rows as Array<Record<string, string>> : [];
  const dm = new Map(ds.map(d => [d.id, d])), pm = new Map(ps.map(p => [p.id, p.name]));
  return { items: items.map(x => ({ ...x, doctor_name: dm.get(x.doctor_id)?.name || x.doctor_name || "", clinic_name: dm.get(x.doctor_id)?.clinic_name || x.clinic_name || "", city: dm.get(x.doctor_id)?.city || x.city || "", product_name: x.product_id ? pm.get(String(x.product_id)) || x.product_name || "" : "" })), missingDoctor: dIds.length !== ds.length };
}

async function notifyAdmins(planId: string, kind: string, message: string) {
  const admins = (await query(`SELECT id FROM users WHERE role='admin' AND active`)).rows as Array<{ id: string }>;
  for (const a of admins) await query(`INSERT INTO task_notifications(user_id,task_id,plan_id,kind,message,action_url) VALUES($1,NULL,$2,$3,$4,$5)`, [a.id, planId, kind, message, `/plans?planId=${planId}`]);
}

export function opsCounts(ops: Array<Record<string, unknown>>) {
  const rep = ops.find(o => o.op === "replace");
  if (rep?.summary) return rep.summary as { added: number; removed: number; moved: number; changed: number };
  return { added: ops.filter(o => o.op === "add").length, removed: ops.filter(o => o.op === "remove").length, moved: ops.filter(o => o.op === "move").length, changed: 0 };
}

/** Rep edits an APPROVED plan → stored as one pending request; the approved version stays active until the manager decides. */
export async function submitPlanChange(u: Who, planId: string, raw: unknown, noteRaw: unknown) {
  const p = (await query(`SELECT id, user_id::text user_id, status::text status, period_start::text ps, period_end::text pe FROM plans WHERE id=$1`, [planId])).rows[0] as Record<string, string> | undefined;
  if (!p) return { status: 404, error: "الخطة غير موجودة" };
  if (p.user_id !== u.id) return { status: 403, error: "Forbidden" };
  if (p.status !== "approved") return { status: 400, error: "الخطة مش معتمدة — عدّلها مباشرة" };
  const note = String(noteRaw || "").trim();
  if (note.length < 5) return { status: 400, error: "اكتب سبب التعديل عشان المدير يفهم (5 أحرف على الأقل)" };
  if (!Array.isArray(raw) || !raw.length) return { status: 400, error: "الخطة لازم يكون فيها زيارة واحدة على الأقل" };
  if (raw.length > 50) return { status: 400, error: "الحد 50 زيارة" };
  const items: PlanItemLike[] = [];
  for (const r of raw as Array<Record<string, unknown>>) {
    const it = { doctor_id: String(r.doctor_id || ""), planned_date: String(r.planned_date || "").slice(0, 10), product_id: UUID.test(String(r.product_id || "")) ? String(r.product_id) : null, priority: PRIORITIES.has(String(r.priority)) ? String(r.priority) : "medium", note: String(r.note || "").slice(0, 300) };
    if (!UUID.test(it.doctor_id) || !DAY.test(it.planned_date)) return { status: 400, error: "بيانات زيارة غير صحيحة" };
    if (it.planned_date < p.ps || it.planned_date > p.pe) return { status: 400, error: `كل الزيارات لازم تكون داخل فترة الخطة (${p.ps} → ${p.pe})` };
    items.push(it);
  }
  const { items: named, missingDoctor } = await enrich(items);
  if (missingDoctor) return { status: 400, error: "فيه طبيب غير موجود" };
  const cur = await planItemsNow({ query }, planId);
  const t = today();
  if (dayKeys(cur, t) !== dayKeys(named, t)) return { status: 400, error: "الأيام اللي فاتت مينفعش تتعدل — التعديل من النهارده وطالع" };
  const counts = diffCounts(diffPlanItems(cur, named));
  if (!counts.total) return { status: 400, error: "مفيش أي تغيير عن الخطة المعتمدة" };
  const ops = [{ op: "replace", items: named, summary: { added: counts.added, removed: counts.removed, moved: counts.moved, changed: counts.changed } }];
  const original = cur.map(x => ({ item_id: x.id, doctor_id: x.doctor_id, doctor_name: x.doctor_name, planned_date: x.planned_date, product_id: x.product_id, priority: x.priority, note: x.note }));
  const client = await pool.connect();
  let replaced = false;
  try {
    await client.query("BEGIN");
    const ex = await client.query(`SELECT id FROM plan_edit_requests WHERE plan_id=$1 AND status='pending' FOR UPDATE`, [planId]);
    if (ex.rows[0]) { replaced = true; await client.query(`UPDATE plan_edit_requests SET proposed_items=$2, original_items=$3, note=$4, requested_by=$5, created_at=now() WHERE id=$1`, [ex.rows[0].id, JSON.stringify(ops), JSON.stringify(original), note, u.id]); }
    else await client.query(`INSERT INTO plan_edit_requests(plan_id, requested_by, note, proposed_items, original_items, status) VALUES($1,$2,$3,$4,$5,'pending')`, [planId, u.id, note, JSON.stringify(ops), JSON.stringify(original)]);
    await client.query(`INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'change_request','plan',$2,$3)`, [u.id, planId, JSON.stringify(counts)]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  await notifyAdmins(planId, "plan_edit_request", `${u.name} طلب تعديل خطته المعتمدة (${diffSummaryText(counts)}) — ${note.slice(0, 60)}`);
  return { status: 202, requested: true, counts, replaced };
}

/** Called by the agenda (drag/move/add) when a request for the plan is already pending: fold the new op into it. */
export async function mergeIntoPending(planId: string, op: Record<string, unknown>, original: Record<string, unknown> | null, note: string) {
  const ex = (await query(`SELECT id, proposed_items, original_items FROM plan_edit_requests WHERE plan_id=$1 AND status='pending'`, [planId])).rows[0] as { id: string; proposed_items: Array<Record<string, unknown>>; original_items: Array<Record<string, unknown>> } | undefined;
  if (!ex) return false;
  const rep = ex.proposed_items.find(o => o.op === "replace");
  let ops: Array<Record<string, unknown>>;
  if (rep) {
    const items = [...(rep.items as PlanItemLike[])];
    if (op.op === "move") { const i = items.findIndex(x => x.item_id === op.item_id || (x.doctor_id === op.doctor_id && x.planned_date === op.from)); if (i >= 0) items[i] = { ...items[i], planned_date: String(op.to) }; }
    if (op.op === "add") items.push({ doctor_id: String(op.doctor_id), doctor_name: String(op.doctor_name || ""), planned_date: String(op.to), product_id: (op.product_id as string) || null, priority: "medium", note: String(op.note || "") });
    const cur = await planItemsNow({ query }, planId);
    const c = diffCounts(diffPlanItems(cur, items));
    ops = [{ op: "replace", items, summary: { added: c.added, removed: c.removed, moved: c.moved, changed: c.changed } }];
  } else ops = [...ex.proposed_items, op];
  await query(`UPDATE plan_edit_requests SET proposed_items=$2, original_items=$3, note=CASE WHEN $4<>'' AND position($4 in note)=0 THEN note||' · '||$4 ELSE note END, created_at=now() WHERE id=$1`,
    [ex.id, JSON.stringify(ops), JSON.stringify(original ? [...ex.original_items, original] : ex.original_items), note]);
  return true;
}

/** Inside the approval transaction: turn the plan into the proposed version, keeping row ids of visits that stayed. */
export async function applyReplace(db: Q, planId: string, items: PlanItemLike[]) {
  const cur = (await db.query(`SELECT id, doctor_id::text doctor_id, planned_date::text planned_date, product_id::text product_id, priority::text priority, COALESCE(note,'') note FROM plan_items WHERE plan_id=$1`, [planId])).rows as PlanItemLike[];
  const d = diffPlanItems(cur, items);
  for (const p of [...d.moved, ...d.changed]) await db.query(`UPDATE plan_items SET planned_date=$2, product_id=$3, priority=$4, note=$5 WHERE id=$1`, [p.from.id, p.to.planned_date, p.to.product_id || null, p.to.priority || "medium", p.to.note || ""]);
  for (const r of d.removed) await db.query(`DELETE FROM plan_items WHERE id=$1`, [r.id]);
  for (const a of d.added) await db.query(`INSERT INTO plan_items(plan_id, doctor_id, planned_date, product_id, note, priority, sort_order) VALUES($1,$2,$3,$4,$5,$6,0)`, [planId, a.doctor_id, a.planned_date, a.product_id || null, a.note || "", a.priority || "medium"]);
  await db.query(`UPDATE plan_items pi SET sort_order=s.rn FROM (SELECT id, (row_number() OVER (ORDER BY planned_date, sort_order, id))::int-1 rn FROM plan_items WHERE plan_id=$1) s WHERE s.id=pi.id`, [planId]);
  return diffCounts(d);
}

/** Pending request (as a visual diff against the live plan) + decision history, for the plan detail view. */
export async function planRequests(planId: string, current: PlanItemLike[]) {
  const rows = (await query(`SELECT r.id, r.status, r.note, r.admin_note, r.created_at, r.reviewed_at, r.proposed_items, u.name requested_by_name, rv.name reviewed_by_name
    FROM plan_edit_requests r JOIN users u ON u.id=r.requested_by LEFT JOIN users rv ON rv.id=r.reviewed_by WHERE r.plan_id=$1 ORDER BY r.created_at DESC LIMIT 15`, [planId])).rows as Array<Record<string, any>>;
  const pending = rows.find(r => r.status === "pending");
  let request = null;
  if (pending) {
    const { items: proposed } = await enrich(applyRequestOps(current, pending.proposed_items));
    const diff = diffPlanItems(current, proposed);
    request = { id: pending.id, note: pending.note, created_at: pending.created_at, requested_by_name: pending.requested_by_name, proposed, diff, counts: diffCounts(diff) };
  }
  const history = rows.filter(r => r.status !== "pending").map(r => ({ id: r.id, status: r.status, note: r.note, admin_note: r.admin_note, created_at: r.created_at, reviewed_at: r.reviewed_at, requested_by_name: r.requested_by_name, reviewed_by_name: r.reviewed_by_name, summary: diffSummaryText(opsCounts(r.proposed_items || [])) }));
  return { request, history };
}

export async function cancelRequest(u: Who, id: string) {
  const r = await query(`UPDATE plan_edit_requests SET status='cancelled', reviewed_at=now(), admin_note='سحبه المندوب' WHERE id=$1 AND requested_by=$2 AND status='pending' RETURNING plan_id`, [id, u.id]);
  if (!r.rowCount) return { status: 404, error: "الطلب غير موجود أو اتخذ فيه قرار" };
  return { status: 200, ok: true };
}
