import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { visitSchema } from "@/lib/validation";
import { notifyAdminNewVisit } from "@/lib/notify";
import { canCreateVisit } from "@/lib/permissions";
import { validateVisitProducts } from "@/lib/visit-entry";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "30", 10) || 30, 100);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);
  const doctorId = searchParams.get("doctorId");
  const status = searchParams.get("status");
  const repId = searchParams.get("repId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const q = (searchParams.get("q")||"").trim();

  const conds: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;
  // reps see only own visits
  if (user.role !== "admin") { conds.push(`v.sales_rep_id = $${idx}`); vals.push(user.id); idx++; }
  if (doctorId) { conds.push(`v.doctor_id = $${idx}`); vals.push(doctorId); idx++; }
  if (status) { conds.push(`v.status = $${idx}`); vals.push(status); idx++; }
  if (repId) { conds.push(`v.sales_rep_id = $${idx}`); vals.push(repId); idx++; }
  if (from) { conds.push(`v.visited_at >= $${idx}`); vals.push(new Date(from)); idx++; }
  if (to) { conds.push(`v.visited_at <= $${idx}`); vals.push(new Date(to)); idx++; }
  if (q) { conds.push(`(d.name ILIKE $${idx} OR d.clinic_name ILIKE $${idx} OR v.notes ILIKE $${idx})`); vals.push(`%${q}%`); idx++; }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await query(
    `SELECT v.id, v.visited_at, v.notes, v.status, v.sales_rep_id, u.name rep_name, d.name doctor_name, d.clinic_name, d.city,
            COALESCE(json_agg(json_build_object('id', vi.id, 'product_id', vi.product_id, 'product_name', p.name, 'kind', vi.kind, 'quantity', vi.quantity, 'approval_status', vi.approval_status, 'approval_note', vi.approval_note, 'sample_purpose', vi.sample_purpose) ORDER BY vi.kind) FILTER (WHERE vi.id IS NOT NULL), '[]'::json) items,
            COALESCE((SELECT json_agg(json_build_object('product_id',pp.product_id,'product_name',pr.name,'reaction',pp.reaction) ORDER BY pr.name) FROM visit_presented_products pp JOIN products pr ON pr.id=pp.product_id WHERE pp.visit_id=v.id),'[]'::json) presented,
            COALESCE((SELECT json_agg(json_build_object('id',va.id,'file_name',va.file_name,'mime_type',va.mime_type,'size_bytes',va.size_bytes) ORDER BY va.created_at DESC) FROM visit_attachments va WHERE va.visit_id=v.id),'[]'::json) attachments
     FROM visits v
     JOIN users u ON u.id=v.sales_rep_id
     JOIN doctors d ON d.id=v.doctor_id
     LEFT JOIN visit_items vi ON vi.visit_id=v.id
     LEFT JOIN products p ON p.id=vi.product_id
     ${where}
     GROUP BY v.id, u.name, d.name, d.clinic_name, d.city
     ORDER BY v.visited_at DESC
     LIMIT $${idx} OFFSET $${idx+1}`,
    [...vals, limit, offset]
  );
  return NextResponse.json({ visits: rows.rows });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreateVisit(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(()=>null);
  const parsed = visitSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { doctorId, notes, status, sampleItems, orderItems, visitedAt, presentedProducts, idempotencyKey } = parsed.data;

  if (presentedProducts !== undefined) {
    const rule = validateVisitProducts(presentedProducts.map((x) => x.productId), sampleItems.map((x) => x.productId));
    if (rule) return NextResponse.json({ error: rule }, { status: 400 });
    const ids = [...new Set([...presentedProducts.map((x) => x.productId), ...sampleItems.map((x) => x.productId)])];
    if (ids.length) {
      const active = await query("SELECT count(*)::int n FROM products WHERE id = ANY($1::uuid[]) AND active=true", [ids]);
      if ((active.rows[0]?.n ?? 0) !== ids.length) return NextResponse.json({ error: "منتج غير متاح أو غير نشط" }, { status: 400 });
    }
  }
  const filteredSamples = sampleItems;
  const filteredOrders = orderItems;

  const client = await (await import("@/lib/db")).pool.connect();
  try {
    await client.query("BEGIN");
    const { lat, lng, accuracy_m, follow_up_at, follow_up_note } = parsed.data as Record<string,unknown>;
    const key = idempotencyKey || null;
    const v = await client.query("INSERT INTO visits(doctor_id, sales_rep_id, visited_at, notes, status, lat, lng, accuracy_m, follow_up_at, follow_up_note, idempotency_key) VALUES($1,$2,COALESCE($3, now()),$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (sales_rep_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING id",
      [doctorId, user.id, visitedAt ? new Date(visitedAt as unknown as string) : null, notes, status,
       (lat as number) ?? null, (lng as number) ?? null, (accuracy_m as number) ?? null,
       follow_up_at ? String(follow_up_at) || null : null, String(follow_up_note||""), key]);
    if (!v.rows[0] && key) {
      const existing = await client.query("SELECT id FROM visits WHERE sales_rep_id=$1 AND idempotency_key=$2", [user.id, key]);
      if (existing.rows[0]) { await client.query("COMMIT"); return NextResponse.json({ id: existing.rows[0].id, duplicate: true }, { status: 200 }); }
    }
    const visitId = v.rows[0]?.id as string;
    if (!visitId) throw new Error("تعذر إنشاء الزيارة");
    for (const it of presentedProducts ?? []) await client.query("INSERT INTO visit_presented_products(visit_id, product_id, reaction) VALUES($1,$2,$3)", [visitId, it.productId, it.reaction]);
    for (const it of filteredSamples) await client.query("INSERT INTO visit_items(visit_id, product_id, kind, quantity, sample_purpose) VALUES($1,$2,'sample',$3,$4)", [visitId, it.productId, it.quantity, it.purpose]);
    for (const it of filteredOrders) {
      const order = await client.query("INSERT INTO visit_items(visit_id, product_id, kind, quantity, approval_status) VALUES($1,$2,'order',$3,'pending') RETURNING id", [visitId, it.productId, it.quantity]);
      const admins = await client.query("SELECT id FROM users WHERE role='admin' AND active=true");
      for (const admin of admins.rows) await client.query("INSERT INTO task_notifications(user_id, task_id, order_item_id, kind, message) VALUES($1,NULL,$2,'order_pending',$3)", [admin.id, order.rows[0].id, `${user.name} أرسل طلب أوردر جديد يحتاج موافقة`]);
    }
    await client.query("COMMIT");
        // fire-and-forget notify (outside tx)
        notifyAdminNewVisit(visitId).catch(()=>{});
    return NextResponse.json({ id: visitId }, { status: 201 });
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}