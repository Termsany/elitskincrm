/** Admin sales console: Daftra customers as clinics, product list prices, and per-product targets (amount ⇄ units). */
import { query } from "@/lib/db";
import { setAnnual, setOverride, adminTargetView } from "@/lib/target-planning";
import { adminView } from "@/lib/forecast";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Upsert one clinic per Daftra customer seen in synced invoices (CRM only). */
export async function syncDaftraClinics() {
  const r = await query(`INSERT INTO clinics(name, city, daftra_client_id, source_key)
    SELECT DISTINCT ON (client_id) btrim(client_name), COALESCE(client_city, ''), client_id, 'daftra:' || client_id
    FROM daftra_invoices WHERE client_id IS NOT NULL AND length(btrim(client_name)) > 0 ORDER BY client_id, invoice_date DESC
    ON CONFLICT (source_key) DO UPDATE SET name = EXCLUDED.name, daftra_client_id = EXCLUDED.daftra_client_id, active = true RETURNING id`);
  // keep the collections link pointing at the Daftra clinic
  await query(`UPDATE daftra_client_links l SET clinic_id = c.id FROM clinics c WHERE c.daftra_client_id = l.client_id AND l.clinic_id IS DISTINCT FROM c.id`);
  return r.rowCount ?? 0;
}

export type TargetLineIn = { product_id: string; mode: "amount" | "units"; value: number };
/** amount mode: units = floor(amount ÷ price); units mode: amount = units × price. */
export function priceTarget(lines: TargetLineIn[], prices: Map<string, number>) {
  return lines.filter(l => Number(l.value) > 0).map(l => {
    const price = prices.get(l.product_id); if (!price || price <= 0) throw new Error("حدد سعر المنتج الأول");
    if (l.mode === "units") { const q = Math.round(Number(l.value)); return { ...l, quantity: q, unit_price: price, amount: r2(q * price) }; }
    const amt = r2(Number(l.value)); return { ...l, quantity: Math.floor(amt / price + 1e-9), unit_price: price, amount: amt };
  });
}

const ERR: Record<string, string> = {
  "Distribution already submitted; annual target locked": "المندوب بعت توزيع الهدف السنوي — اعتمده أو ارفضه الأول عشان تقدر تغيّر الهدف",
  "Annual target required": "حدد الهدف السنوي للمندوب الأول",
  "Overrides exceed annual target": "أهداف الشهور اللي حددتها أكبر من الهدف السنوي",
};
export const arabicError = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); const k = Object.keys(ERR).find(x => m.startsWith(x.split(";")[0])); return k ? ERR[k] : m; };

export async function setProductTarget(actor: string, b: { rep_id: string; period: string; lines: TargetLineIn[] }) {
  if (!/^20\d\d(-(0[1-9]|1[0-2]))?$/.test(b.period)) throw new Error("فترة غير صحيحة");
  if (!Array.isArray(b.lines) || b.lines.length > 50) throw new Error("بيانات غير صحيحة");
  const pr = await query<{ id: string; unit_price: number | null }>("SELECT id, unit_price::float8 unit_price FROM products WHERE active");
  const priced = priceTarget(b.lines.map(l => ({ product_id: String(l.product_id), mode: l.mode === "units" ? "units" : "amount", value: Number(l.value) })), new Map(pr.rows.map(p => [p.id, Number(p.unit_price || 0)])));
  const total = r2(priced.reduce((s, l) => s + l.amount, 0));
  if (b.period.length === 4) await setAnnual(actor, { rep_id: b.rep_id, year: Number(b.period), amount: total });
  else await setOverride(actor, { rep_id: b.rep_id, month: b.period, amount: total });
  await query("DELETE FROM rep_target_products WHERE rep_id=$1 AND period=$2", [b.rep_id, b.period]);
  for (const l of priced) await query(`INSERT INTO rep_target_products(rep_id, period, product_id, mode, quantity, unit_price, amount, set_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [b.rep_id, b.period, l.product_id, l.mode, l.quantity, l.unit_price, l.amount, actor]);
  return { total, lines: priced };
}

export async function targetProducts(year: number, repId?: string) {
  const r = await query<{ rep_id: string; period: string; product_id: string; product: string; mode: string; quantity: number; unit_price: number; amount: number }>(`
    SELECT t.rep_id, t.period, t.product_id, p.name product, t.mode, t.quantity, t.unit_price::float8, t.amount::float8 FROM rep_target_products t JOIN products p ON p.id=t.product_id
    WHERE left(t.period, 4) = $1 ${repId ? "AND t.rep_id=$2" : ""} ORDER BY t.period, p.name`, repId ? [String(year), repId] : [String(year)]);
  return r.rows;
}

/** Everything the admin console needs in one call. */
export async function adminSalesView(year: number, month: string) {
  const [plan, mv, products, clinics, tp, prices] = await Promise.all([
    adminTargetView(year), adminView(month),
    query<{ id: string; name: string; unit_price: number | null; active: boolean }>("SELECT id, name, unit_price::float8, active FROM products WHERE active ORDER BY name"),
    query(`SELECT c.id, c.name, c.city, c.daftra_client_id, l.rep_id, u.name rep_name,
      (SELECT COALESCE(sum(unpaid),0)::float8 FROM daftra_invoices i WHERE i.client_id=c.daftra_client_id AND i.payment_status<>3) unpaid
      FROM clinics c LEFT JOIN daftra_client_links l ON l.client_id=c.daftra_client_id LEFT JOIN users u ON u.id=l.rep_id
      WHERE c.active AND c.daftra_client_id IS NOT NULL ORDER BY c.name`),
    targetProducts(year),
    query(`SELECT DISTINCT ON (clinic_id, product_id) clinic_id, product_id, price::float8, month::text AS month FROM forecast_prices WHERE month <= $1::date ORDER BY clinic_id, product_id, month DESC`, [`${month}-01`]),
  ]);
  return { year, month, plan, monthView: mv, products: products.rows, clinics: clinics.rows, targetProducts: tp, specialPrices: prices.rows };
}
