import { query } from "@/lib/db";
import { planOf } from "@/lib/fin-goals";
import { loadGoals } from "@/lib/fin-cfo";
import type { CatalogRow, PlanCost, PlanData } from "@/lib/plan";

/** What the annual goals expect from one month (null when no goals are saved for that year). */
export async function goalForMonth(month: string) {
  const g = await loadGoals(Number(month.slice(0, 4))).catch(() => null);
  if (!g) return null;
  const m = planOf(g).months[Number(month.slice(5, 7)) - 1];
  return m ? { sales: m.sales, gross: m.gross, opex: m.opex, net: m.net } : null;
}

/**
 * Keeps a saved month plan in step with the rest of the system:
 * - costs that came from the fixed-costs list (ids "f…") follow that list for the current and future months
 * - quantities and prices sold come straight from Daftra for the current and past months
 */
export function syncPlan(p: PlanData, catalog: CatalogRow[], fixed: PlanCost[], month: string, cur: string): PlanData {
  let costs = p.costs, items = p.items;
  if (month >= cur && fixed.length) {
    const fx = new Map(fixed.map(f => [f.id, f]));
    costs = [...p.costs.filter(c => !c.id.startsWith("f") || fx.has(c.id)).map(c => fx.has(c.id) ? { ...c, name: fx.get(c.id)!.name, kind: fx.get(c.id)!.kind, planned: fx.get(c.id)!.planned } : c),
      ...fixed.filter(f => !p.costs.some(c => c.id === f.id))];
  }
  if (month <= cur) {
    const cat = new Map(catalog.map(c => [c.key, c])), have = new Set(p.items.map(i => i.key));
    items = p.items.map(i => { const c = cat.get(i.key); return c ? { ...i, actual_qty: c.d_qty || 0, actual_price: c.d_price ?? null } : i; });
    for (const c of catalog) if (c.d_qty > 0 && !have.has(c.key))
      items.push({ key: c.key, name: c.name, include: false, cost: c.avg_cost ?? c.last_cost ?? 0, price: c.d_price ?? c.price ?? 0, mix: 0, qty: null, actual_qty: c.d_qty, actual_price: c.d_price });
  }
  return { ...p, costs, items };
}

export type RepShare = { rep_id: string | null; rep_name: string; target: number; actual: number; items: Array<{ item: string; qty: number; revenue: number }> };

/**
 * Splits the month plan between reps the same way Daftra sales are credited to them
 * (each item → its CRM product → the active reps carrying that product, shared equally), with each rep's actual sales this month.
 */
export async function repShares(month: string, rows: Array<{ name: string; plan_qty: number; plan_revenue: number }>, withActual = true): Promise<RepShare[]> {
  const its = rows.filter(r => r.plan_qty > 0 && r.plan_revenue > 0);
  const [split, actual] = await Promise.all([
    its.length ? query<{ rep_id: string | null; rep_name: string | null; target: number; items: RepShare["items"] }>(String.raw`
      WITH it AS (SELECT * FROM unnest($1::text[], $2::float8[], $3::float8[]) AS t(item, qty, rev)),
      pr AS (SELECT it.*, COALESCE(m.product_id, pm.product_id, (SELECT p.id FROM products p WHERE upper(p.name)='PETITRA' LIMIT 1)) product_id
        FROM it LEFT JOIN daftra_item_products m ON m.item_key = lower(btrim(it.item))
        LEFT JOIN LATERAL (SELECT p.id product_id FROM products p
          WHERE it.item ~* ('(^|[^[:alnum:]])' || regexp_replace(p.name, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '([^[:alnum:]]|$)')
          ORDER BY length(p.name) DESC LIMIT 1) pm ON true),
      rp AS (SELECT pr.item, pr.qty, pr.rev, u.id rep_id, u.name rep_name, count(u.id) OVER (PARTITION BY pr.item) n FROM pr
        LEFT JOIN users u ON u.role='sales_rep' AND u.active AND (u.assigned_product_id = pr.product_id OR EXISTS (SELECT 1 FROM rep_products x WHERE x.rep_id=u.id AND x.product_id=pr.product_id)))
      SELECT rep_id, rep_name, sum(rev / GREATEST(n,1))::float8 target,
        json_agg(json_build_object('item', item, 'qty', round((qty / GREATEST(n,1))::numeric, 1), 'revenue', round((rev / GREATEST(n,1))::numeric)) ORDER BY rev DESC) items
      FROM rp GROUP BY rep_id, rep_name ORDER BY target DESC`, [its.map(r => r.name), its.map(r => r.plan_qty), its.map(r => r.plan_revenue)]) : Promise.resolve({ rows: [] }),
    withActual ? query<{ rep_id: string; v: number }>("SELECT rep_id, COALESCE(sum(value),0)::float8 v FROM daftra_sales_v WHERE month=$1::date AND rep_id IS NOT NULL GROUP BY rep_id", [`${month}-01`]).catch(() => ({ rows: [] as Array<{ rep_id: string; v: number }> })) : Promise.resolve({ rows: [] as Array<{ rep_id: string; v: number }> }),
  ]);
  const act = new Map(actual.rows.map(r => [r.rep_id, r.v]));
  return split.rows.map(r => ({ rep_id: r.rep_id, rep_name: r.rep_name || "بدون مندوب", target: Math.round(r.target), actual: Math.round(r.rep_id ? act.get(r.rep_id) || 0 : 0), items: r.items }));
}

/** One rep's part of this month's saved plan (null when there is no plan or nothing in it is theirs). */
export async function repPlanShare(repId: string, month: string) {
  const { cleanPlan, computePlan } = await import("@/lib/plan");
  const saved = (await query<{ data: unknown }>("SELECT data FROM fin_plans WHERE month=$1", [month]).catch(() => ({ rows: [] as Array<{ data: unknown }> }))).rows[0];
  if (!saved) return null;
  const shares = await repShares(month, computePlan(cleanPlan(saved.data)).rows).catch(() => []);
  const mine = shares.find(s => s.rep_id === repId);
  return mine && mine.target > 0 ? { target: mine.target, actual: mine.actual, items: mine.items.slice(0, 6) } : null;
}

/**
 * Reps' monthly targets that come from the month plan: month → rep → amount, for the months that have a saved plan.
 * THE monthly-target rule everywhere: an admin's month override → the rep's share of the month plan → the approved annual distribution → annual ÷ 12.
 */
export async function planTargets(months: string[]): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (!months.length) return out;
  const { cleanPlan, computePlan } = await import("@/lib/plan");
  const saved = (await query<{ month: string; data: unknown }>("SELECT month, data FROM fin_plans WHERE month = ANY($1::text[])", [months]).catch(() => ({ rows: [] as Array<{ month: string; data: unknown }> }))).rows;
  for (const p of saved) {
    const shares = await repShares(p.month, computePlan(cleanPlan(p.data)).rows, false).catch(() => []);
    out.set(p.month, new Map(shares.filter(x => x.rep_id).map(x => [x.rep_id!, x.target])));
  }
  return out;
}

/**
 * The reps' approved forecasts for a month, spread over the plan's Daftra items:
 * each forecast product's quantity goes to the items that belong to it, in proportion to what each item usually sells.
 */
export async function forecastForPlan(month: string, catalog: CatalogRow[]) {
  const fc = (await query<{ product_id: string; qty: number; value: number; reps: number }>(`
    SELECT l.product_id, sum(l.quantity)::float8 qty,
      sum(l.quantity * COALESCE(l.unit_price, (SELECT p.price FROM forecast_prices p WHERE p.clinic_id=l.clinic_id AND p.product_id=l.product_id AND p.month<=v.month ORDER BY p.month DESC LIMIT 1), 0))::float8 value,
      count(DISTINCT v.rep_id)::int reps
    FROM forecast_versions v JOIN forecast_lines l ON l.version_id=v.id
    WHERE v.status='approved' AND v.month=$1::date
      AND v.version=(SELECT max(version) FROM forecast_versions x WHERE x.rep_id=v.rep_id AND x.month=v.month AND x.status='approved')
    GROUP BY l.product_id`, [`${month}-01`]).catch(() => ({ rows: [] as Array<{ product_id: string; qty: number; value: number; reps: number }> }))).rows;
  if (!fc.length || !catalog.length) return { total: fc.reduce((s, r) => s + r.value, 0), reps: Math.max(0, ...fc.map(r => r.reps)), byItem: {} as Record<string, number> };
  const map = (await query<{ item: string; product_id: string }>(String.raw`
    SELECT it.item, COALESCE(m.product_id, pm.product_id, (SELECT p.id FROM products p WHERE upper(p.name)='PETITRA' LIMIT 1))::text product_id
    FROM unnest($1::text[]) AS it(item)
    LEFT JOIN daftra_item_products m ON m.item_key = lower(btrim(it.item))
    LEFT JOIN LATERAL (SELECT p.id product_id FROM products p
      WHERE it.item ~* ('(^|[^[:alnum:]])' || regexp_replace(p.name, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '([^[:alnum:]]|$)')
      ORDER BY length(p.name) DESC LIMIT 1) pm ON true`, [catalog.map(c => c.name)])).rows;
  const prodOf = new Map(map.map(m => [m.item, m.product_id]));
  const byItem: Record<string, number> = {};
  for (const f of fc) {
    const items = catalog.filter(c => prodOf.get(c.name) === f.product_id);
    if (!items.length) continue;
    const w = items.reduce((s, c) => s + Math.max(c.hist_qty, 0), 0);
    for (const c of items) byItem[c.key] = Math.round(f.qty * (w > 0 ? Math.max(c.hist_qty, 0) / w : 1 / items.length));
  }
  return { total: Math.round(fc.reduce((s, r) => s + r.value, 0)), reps: Math.max(0, ...fc.map(r => r.reps)), byItem };
}
