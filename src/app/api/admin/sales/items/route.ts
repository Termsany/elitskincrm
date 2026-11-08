import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE } from "@/lib/ids";
import { riyadhToday } from "@/lib/fmt";

/** Daftra items → CRM product. Sales are credited to the reps who carry the product (see migration 060). CRM only. */
const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const year = Number(new URL(req.url).searchParams.get("year")) || Number(riyadhToday().slice(0, 4));
  const [items, products, reps] = await Promise.all([
    query<{ item: string; value: number; lines: number; product_id: string | null; mapped: boolean; reps: string | null }>(`
      SELECT min(v.item) item, sum(v.value)::float8 value, count(DISTINCT v.invoice_id || '-' || v.id)::int lines, (array_agg(v.product_id))[1] product_id,
        bool_or(m.item_key IS NOT NULL) mapped,
        string_agg(DISTINCT u.name, '، ') reps
      FROM daftra_sales_v v LEFT JOIN daftra_item_products m ON m.item_key = lower(btrim(v.item)) LEFT JOIN users u ON u.id = v.rep_id
      WHERE v.month >= $1::date AND v.month < $2::date GROUP BY lower(btrim(v.item)) ORDER BY (array_agg(v.product_id))[1] IS NOT NULL, 2 DESC`, [`${year}-01-01`, `${year + 1}-01-01`]),
    query<{ id: string; name: string; reps: string | null }>(`SELECT p.id, p.name, (SELECT string_agg(u.name, '، ' ORDER BY u.name) FROM users u WHERE u.role='sales_rep' AND u.active
        AND (u.assigned_product_id=p.id OR EXISTS(SELECT 1 FROM rep_products rp WHERE rp.rep_id=u.id AND rp.product_id=p.id))) reps FROM products p WHERE p.active ORDER BY p.sort_order, p.name`),
    query<{ id: string; name: string; assigned_product_id: string | null; products: string[] }>(`SELECT u.id, u.name, u.assigned_product_id,
        COALESCE((SELECT array_agg(rp.product_id::text) FROM rep_products rp WHERE rp.rep_id=u.id), '{}') products
      FROM users u WHERE u.role='sales_rep' AND u.active ORDER BY u.name`),
  ]);
  return NextResponse.json({ year, items: items.rows, products: products.rows, reps: reps.rows, unassigned: items.rows.filter(i => !i.reps).reduce((s, i) => s + i.value, 0) });
}

/** PUT {item, product_id|null} — map a Daftra item to a CRM product (null = back to automatic matching).
 *  PUT {action:"rep_product", rep_id, product_id, on} — put a rep on / take a rep off a product. */
export async function PUT(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const b = await req.json().catch(() => null) as { item?: unknown; product_id?: unknown; action?: unknown; rep_id?: unknown; on?: unknown } | null;
  if (b?.action === "rep_product") return repProduct(u.id, String(b.rep_id || ""), String(b.product_id || ""), b.on === true);
  const key = String(b?.item || "").trim().toLowerCase().slice(0, 300), pid = b?.product_id ? String(b.product_id) : null;
  if (!key || (pid && !UUID_RE.test(pid))) return NextResponse.json({ error: "طلب غير صحيح" }, { status: 400 });
  if (!pid) await query("DELETE FROM daftra_item_products WHERE item_key=$1", [key]);
  else {
    if (!(await query("SELECT 1 FROM products WHERE id=$1", [pid])).rows[0]) return NextResponse.json({ error: "المنتج غير موجود" }, { status: 400 });
    await query(`INSERT INTO daftra_item_products(item_key, product_id, updated_by) VALUES($1,$2,$3) ON CONFLICT (item_key) DO UPDATE SET product_id=EXCLUDED.product_id, updated_by=EXCLUDED.updated_by, updated_at=now()`, [key, pid, u.id]);
  }
  await query("INSERT INTO audit_logs(actor_id, action, entity, entity_id, details) VALUES($1,'map','daftra_item',$2,$3)", [u.id, key.slice(0, 120), JSON.stringify({ product_id: pid })]).catch(() => undefined);
  return NextResponse.json({ ok: true });
}

async function repProduct(actor: string, rep: string, pid: string, on: boolean) {
  if (!UUID_RE.test(rep) || !UUID_RE.test(pid)) return NextResponse.json({ error: "طلب غير صحيح" }, { status: 400 });
  const r = (await query<{ assigned_product_id: string | null }>("SELECT assigned_product_id FROM users WHERE id=$1 AND role='sales_rep' AND active", [rep])).rows[0];
  if (!r) return NextResponse.json({ error: "المندوب غير موجود" }, { status: 404 });
  if (!(await query("SELECT 1 FROM products WHERE id=$1", [pid])).rows[0]) return NextResponse.json({ error: "المنتج غير موجود" }, { status: 404 });
  if (on) await query("INSERT INTO rep_products(rep_id, product_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [rep, pid]);
  else {
    await query("DELETE FROM rep_products WHERE rep_id=$1 AND product_id=$2", [rep, pid]);
    // taking a rep off their main product: another of their products becomes the main one (a rep always keeps one)
    if (r.assigned_product_id === pid) {
      const next = (await query<{ product_id: string }>("SELECT product_id FROM rep_products WHERE rep_id=$1 ORDER BY product_id LIMIT 1", [rep])).rows[0];
      if (!next) { await query("INSERT INTO rep_products(rep_id, product_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [rep, pid]); return NextResponse.json({ error: "ده المنتج الوحيد للمندوب — ضيفله منتج تاني الأول" }, { status: 409 }); }
      await query("UPDATE users SET assigned_product_id=$2 WHERE id=$1", [rep, next.product_id]);
    }
  }
  // the main product also counts as one of the rep's products
  if (on && !r.assigned_product_id) await query("UPDATE users SET assigned_product_id=$2 WHERE id=$1", [rep, pid]);
  await query("INSERT INTO audit_logs(actor_id, action, entity, entity_id, details) VALUES($1,$2,'rep_product',$3,$4)", [actor, on ? "assign" : "unassign", rep, JSON.stringify({ product_id: pid })]).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
