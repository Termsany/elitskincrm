import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE } from "@/lib/ids";

/** Daftra items → CRM product. Sales are credited to the reps who carry the product (see migration 060). CRM only. */
const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const year = Number(new URL(req.url).searchParams.get("year")) || Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date()).slice(0, 4));
  const [items, products] = await Promise.all([
    query<{ item: string; value: number; lines: number; product_id: string | null; mapped: boolean; reps: string | null }>(`
      SELECT min(v.item) item, sum(v.value)::float8 value, count(DISTINCT v.invoice_id || '-' || v.id)::int lines, (array_agg(v.product_id))[1] product_id,
        bool_or(m.item_key IS NOT NULL) mapped,
        string_agg(DISTINCT u.name, '، ') reps
      FROM daftra_sales_v v LEFT JOIN daftra_item_products m ON m.item_key = lower(btrim(v.item)) LEFT JOIN users u ON u.id = v.rep_id
      WHERE v.month >= $1::date AND v.month < $2::date GROUP BY lower(btrim(v.item)) ORDER BY (array_agg(v.product_id))[1] IS NOT NULL, 2 DESC`, [`${year}-01-01`, `${year + 1}-01-01`]),
    query<{ id: string; name: string; reps: string | null }>(`SELECT p.id, p.name, (SELECT string_agg(u.name, '، ' ORDER BY u.name) FROM users u WHERE u.role='sales_rep' AND u.active
        AND (u.assigned_product_id=p.id OR EXISTS(SELECT 1 FROM rep_products rp WHERE rp.rep_id=u.id AND rp.product_id=p.id))) reps FROM products p WHERE p.active ORDER BY p.sort_order, p.name`),
  ]);
  return NextResponse.json({ year, items: items.rows, products: products.rows, unassigned: items.rows.filter(i => !i.reps).reduce((s, i) => s + i.value, 0) });
}

/** PUT {item, product_id|null} — map a Daftra item to a CRM product (null = back to automatic name matching). */
export async function PUT(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const b = await req.json().catch(() => null) as { item?: unknown; product_id?: unknown } | null;
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
