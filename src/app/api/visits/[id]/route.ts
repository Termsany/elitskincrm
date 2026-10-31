import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query, pool } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Item = { productId: string; quantity: number; purpose?: string };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/** Validates an optional items array; returns null when malformed. */
function items(value: unknown): Item[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 50) return null;
  const out: Item[] = [];
  for (const it of value) {
    if (!it || typeof it !== "object") return null;
    const { productId, quantity, purpose } = it as Record<string, unknown>;
    if (typeof productId !== "string" || !UUID.test(productId)) return null;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000) return null;
    if (purpose !== undefined && purpose !== null && typeof purpose !== "string") return null;
    out.push({ productId, quantity, purpose: typeof purpose === "string" ? purpose.slice(0, 200) : undefined });
  }
  return out;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const { id } = await params;
  if (!UUID.test(id)) return json({ error: "معرّف غير صحيح" }, 400);
  // Only admin can edit, or owner can edit own visit within 24h
  const existing = await query("SELECT sales_rep_id, visited_at FROM visits WHERE id=$1", [id]);
  if (!existing.rows[0]) return json({ error: "Not found" }, 404);
  const owner = existing.rows[0] as { sales_rep_id: string; visited_at: string };
  const isAdmin = user.role === "admin";
  const isOwner = owner.sales_rep_id === user.id;
  const within24h = (Date.now() - new Date(owner.visited_at).getTime()) < 24 * 60 * 60 * 1000;
  if (!isAdmin && !(isOwner && within24h)) return json({ error: "غير مسموح" }, 403);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return json({ error: "Invalid" }, 400);

  // ── validate everything before touching the database ──
  const sets: string[] = []; const vals: unknown[] = []; let idx = 1;
  if (body.notes !== undefined) {
    const n = String(body.notes).trim();
    if (n.length < 10) return json({ error: "الملاحظات 10 أحرف على الأقل" }, 400);
    sets.push(`notes=$${idx++}`); vals.push(n);
  }
  if (body.status !== undefined) {
    if (!["planned", "completed", "cancelled"].includes(String(body.status))) return json({ error: "حالة غير صحيحة" }, 400);
    sets.push(`status=$${idx++}`); vals.push(body.status);
  }
  if (body.follow_up_at !== undefined) { sets.push(`follow_up_at=$${idx++}`); vals.push(String(body.follow_up_at) || null); }
  if (body.follow_up_note !== undefined) { sets.push(`follow_up_note=$${idx++}`); vals.push(String(body.follow_up_note)); }
  // Doctor and GPS location are part of the visit's evidence: only an admin may correct them.
  if (body.doctorId !== undefined || body.lat !== undefined || body.lng !== undefined) {
    if (!isAdmin) return json({ error: "تعديل الطبيب أو الموقع للمدير فقط" }, 403);
    if (body.doctorId !== undefined) { if (typeof body.doctorId !== "string" || !UUID.test(body.doctorId)) return json({ error: "طبيب غير صحيح" }, 400); sets.push(`doctor_id=$${idx++}`); vals.push(body.doctorId); }
    for (const k of ["lat", "lng"] as const) if (body[k] !== undefined) {
      const v = body[k] === null ? null : Number(body[k]);
      if (v !== null && (!Number.isFinite(v) || Math.abs(v) > (k === "lat" ? 90 : 180))) return json({ error: "موقع غير صحيح" }, 400);
      sets.push(`${k}=$${idx++}`); vals.push(v);
    }
  }
  const samples = items(body.sampleItems), orders = items(body.orderItems);
  if (samples === null || orders === null) return json({ error: "عناصر غير صحيحة" }, 400);
  if (!sets.length && samples === undefined && orders === undefined) return json({ ok: true });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query("SELECT id FROM visits WHERE id=$1 FOR UPDATE", [id]);
    if (!locked.rows[0]) { await client.query("ROLLBACK"); return json({ error: "Not found" }, 404); }
    // Orders already approved/rejected by an admin are final — never delete or reset them.
    if (orders !== undefined) {
      const current = await client.query("SELECT id, approval_status FROM visit_items WHERE visit_id=$1 AND kind='order' FOR UPDATE", [id]);
      if ((current.rows as Array<{ approval_status: string }>).some(o => o.approval_status !== "pending")) {
        await client.query("ROLLBACK");
        return json({ error: "لا يمكن تعديل الطلبات بعد اعتمادها أو رفضها" }, 409);
      }
    }
    if (sets.length) {
      await client.query(`UPDATE visits SET ${sets.join(", ")} WHERE id=$${idx}`, [...vals, id]);
      await client.query("INSERT INTO audit_logs(actor_id, action, entity, entity_id, details) VALUES($1,'update','visit',$2,$3)", [user.id, id, JSON.stringify(body).slice(0, 2000)]);
    }
    if (samples !== undefined) {
      await client.query("DELETE FROM visit_items WHERE visit_id=$1 AND kind='sample'", [id]);
      for (const it of samples) await client.query("INSERT INTO visit_items(visit_id, product_id, kind, quantity, sample_purpose) VALUES($1,$2,'sample',$3,$4)", [id, it.productId, it.quantity, it.purpose || null]);
    }
    if (orders !== undefined) {
      await client.query("DELETE FROM visit_items WHERE visit_id=$1 AND kind='order' AND approval_status='pending'", [id]);
      const admins = isAdmin ? { rows: [] as Array<{ id: string }> } : await client.query("SELECT id FROM users WHERE role='admin' AND active=true");
      for (const it of orders) {
        const status = isAdmin ? "approved" : "pending";
        const order = await client.query("INSERT INTO visit_items(visit_id, product_id, kind, quantity, approval_status, approved_by, approved_at) VALUES($1,$2,'order',$3,$4,$5,$6) RETURNING id", [id, it.productId, it.quantity, status, isAdmin ? user.id : null, isAdmin ? new Date() : null]);
        for (const admin of admins.rows) await client.query("INSERT INTO task_notifications(user_id,task_id,order_item_id,kind,message) VALUES($1,NULL,$2,'order_pending',$3)", [admin.id, order.rows[0].id, `${user.name} حدّث طلب أوردر ويحتاج موافقة`]);
      }
    }
    await client.query("COMMIT");
    return json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("visit update failed", e);
    return json({ error: "تعذر حفظ التعديل" }, 500);
  } finally { client.release(); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return json({ error: "Forbidden" }, 403);
  const { id } = await params;
  if (!UUID.test(id)) return json({ error: "معرّف غير صحيح" }, 400);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const visit = await client.query("SELECT id FROM visits WHERE id=$1 FOR UPDATE", [id]);
    if (!visit.rows[0]) { await client.query("ROLLBACK"); return json({ error: "Not found" }, 404); }
    // Deleting a visit cascades to its items: refuse when an order was already decided.
    const orders = await client.query("SELECT id, approval_status FROM visit_items WHERE visit_id=$1 AND kind='order' FOR UPDATE", [id]);
    if ((orders.rows as Array<{ approval_status: string }>).some(o => o.approval_status !== "pending")) {
      await client.query("ROLLBACK");
      return json({ error: "لا يمكن حذف زيارة فيها طلب تم اعتماده أو رفضه" }, 409);
    }
    await client.query("DELETE FROM visits WHERE id=$1", [id]);
    await client.query("INSERT INTO audit_logs(actor_id, action, entity, entity_id) VALUES($1,'delete','visit',$2)", [user.id, id]);
    await client.query("COMMIT");
    return json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("visit delete failed", e);
    return json({ error: "تعذر حذف الزيارة" }, 500);
  } finally { client.release(); }
}
