import { query } from "@/lib/db";

const SIGN = "(CASE WHEN fs.kind='return' THEN -1 ELSE fs.direction END)";
export type RepRow = { rep_id: string; rep_name: string; annual: number; ytd: number; month_target: number; month_actual: number; month_forecast: number; pending: number };

/** Read-only sales picture for one year: targets (approved distribution + overrides), approved sales, approved forecasts. */
export async function salesHub(u: { id: string; role: string }, year: number, repId: string | null) {
  const scope = u.role === "admin" ? repId : u.id;
  const reps = (await query<{ id: string; name: string }>(`SELECT id, name FROM users WHERE role='sales_rep' AND active ${scope ? "AND id=$1" : ""} ORDER BY name`, scope ? [scope] : [])).rows;
  const ids = reps.map(r => r.id);
  const y0 = `${year}-01-01`, y1 = `${year + 1}-01-01`;
  const [annual, dist, ovr, sales, fc, pend, byProduct, byClinic] = await Promise.all([
    query<{ rep_id: string; amount: string }>("SELECT rep_id, annual_amount amount FROM rep_target_years WHERE year=$1 AND rep_id = ANY($2::uuid[])", [year, ids]),
    query<{ rep_id: string; month: string; amount: string }>(`SELECT v.rep_id, to_char(m.month,'YYYY-MM') AS month, m.amount FROM rep_target_versions v JOIN rep_target_months m ON m.version_id=v.id
      WHERE v.year=$1 AND v.level='annual' AND v.status='approved' AND v.rep_id = ANY($2::uuid[])
        AND v.version=(SELECT max(version) FROM rep_target_versions x WHERE x.rep_id=v.rep_id AND x.year=$1 AND x.level='annual' AND x.status='approved')`, [year, ids]),
    query<{ rep_id: string; month: string; amount: string }>("SELECT rep_id, to_char(month,'YYYY-MM') AS month, amount FROM rep_target_overrides WHERE year=$1 AND rep_id = ANY($2::uuid[])", [year, ids]),
    query<{ rep_id: string; month: string; value: string; qty: string }>(`SELECT fs.rep_id, to_char(fs.month,'YYYY-MM') AS month, sum(${SIGN}*fs.quantity*fs.unit_price) value, sum(${SIGN}*fs.quantity) qty
      FROM forecast_sales fs WHERE fs.status='approved' AND fs.month >= $1::date AND fs.month < $2::date AND fs.rep_id = ANY($3::uuid[]) GROUP BY 1,2`, [y0, y1, ids]),
    query<{ rep_id: string; month: string; value: string; qty: string }>(`SELECT v.rep_id, to_char(v.month,'YYYY-MM') AS month,
        sum(l.quantity * COALESCE(l.unit_price, (SELECT p.price FROM forecast_prices p WHERE p.clinic_id=l.clinic_id AND p.product_id=l.product_id AND p.month<=v.month ORDER BY p.month DESC LIMIT 1), 0)) value, sum(l.quantity) qty
      FROM forecast_versions v JOIN forecast_lines l ON l.version_id=v.id
      WHERE v.status='approved' AND v.month >= $1::date AND v.month < $2::date AND v.rep_id = ANY($3::uuid[])
        AND v.version=(SELECT max(version) FROM forecast_versions x WHERE x.rep_id=v.rep_id AND x.month=v.month AND x.status='approved') GROUP BY 1,2`, [y0, y1, ids]),
    query<{ rep_id: string; forecasts: number; sales: number; targets: number }>(`SELECT r.id rep_id,
        (SELECT count(*) FROM forecast_versions v WHERE v.rep_id=r.id AND v.status IN ('pending','submitted'))::int forecasts,
        (SELECT count(*) FROM forecast_sales s WHERE s.rep_id=r.id AND s.status='pending')::int sales,
        (SELECT count(*) FROM rep_target_versions t WHERE t.rep_id=r.id AND t.status='pending')::int targets
      FROM unnest($1::uuid[]) r(id)`, [ids]),
    query<{ product: string; value: string; qty: string }>(`SELECT p.name product, sum(${SIGN}*fs.quantity*fs.unit_price) value, sum(${SIGN}*fs.quantity) qty FROM forecast_sales fs JOIN products p ON p.id=fs.product_id
      WHERE fs.status='approved' AND fs.month >= $1::date AND fs.month < $2::date AND fs.rep_id = ANY($3::uuid[]) GROUP BY 1 ORDER BY 2 DESC`, [y0, y1, ids]),
    query<{ clinic: string; city: string | null; value: string; qty: string }>(`SELECT c.name clinic, c.city, sum(${SIGN}*fs.quantity*fs.unit_price) value, sum(${SIGN}*fs.quantity) qty FROM forecast_sales fs JOIN clinics c ON c.id=fs.clinic_id
      WHERE fs.status='approved' AND fs.month >= $1::date AND fs.month < $2::date AND fs.rep_id = ANY($3::uuid[]) GROUP BY 1,2 ORDER BY 3 DESC LIMIT 12`, [y0, y1, ids]),
  ]);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const target: Record<string, Record<string, number>> = {};
  for (const r of dist.rows) (target[r.rep_id] ||= {})[r.month] = Number(r.amount);
  for (const r of ovr.rows) (target[r.rep_id] ||= {})[r.month] = Number(r.amount);
  const sum = (rows: Array<{ rep_id: string; month: string; value: string; qty: string }>) => { const m: Record<string, Record<string, { value: number; qty: number }>> = {}; for (const r of rows) (m[r.rep_id] ||= {})[r.month] = { value: Number(r.value), qty: Number(r.qty) }; return m; };
  const act = sum(sales.rows), fct = sum(fc.rows);
  const nowMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date()).slice(0, 7);
  const monthly = months.map(m => ({
    month: m,
    target: ids.reduce((a, id) => a + (target[id]?.[m] || 0), 0),
    actual: ids.reduce((a, id) => a + (act[id]?.[m]?.value || 0), 0),
    actual_qty: ids.reduce((a, id) => a + (act[id]?.[m]?.qty || 0), 0),
    forecast: ids.reduce((a, id) => a + (fct[id]?.[m]?.value || 0), 0),
    allocated: ids.some(id => target[id]?.[m] !== undefined),
  }));
  const team: RepRow[] = reps.map(r => ({
    rep_id: r.id, rep_name: r.name,
    annual: Number(annual.rows.find(a => a.rep_id === r.id)?.amount || 0),
    ytd: months.filter(m => m <= nowMonth).reduce((a, m) => a + (act[r.id]?.[m]?.value || 0), 0),
    month_target: target[r.id]?.[nowMonth] || 0, month_actual: act[r.id]?.[nowMonth]?.value || 0, month_forecast: fct[r.id]?.[nowMonth]?.value || 0,
    pending: (() => { const p = pend.rows.find(x => x.rep_id === r.id); return p ? p.forecasts + p.sales + p.targets : 0; })(),
  }));
  const pending = pend.rows.reduce((a, p) => ({ forecasts: a.forecasts + p.forecasts, sales: a.sales + p.sales, targets: a.targets + p.targets }), { forecasts: 0, sales: 0, targets: 0 });
  return {
    year, nowMonth, annual: team.reduce((a, r) => a + r.annual, 0), monthly, team: u.role === "admin" ? team : [], pending,
    byProduct: byProduct.rows.map(r => ({ name: r.product, value: Number(r.value), qty: Number(r.qty) })),
    byClinic: byClinic.rows.map(r => ({ name: r.clinic, city: r.city, value: Number(r.value), qty: Number(r.qty) })),
  };
}
