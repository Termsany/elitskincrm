import { query } from "@/lib/db";
import { rankedDoctors } from "@/lib/doctor-suggest";
import { clinicBalances } from "@/lib/clinic-balances";
import { pausedSql } from "@/lib/doctor-pauses";

/**
 * A rep's area: the cities the admin gave them (rep_cities), or — when none were set — the cities
 * they actually worked in the last 90 days. Everything here counts only that rep's visits and own-product sales.
 */
export const cityKey = (c: string | null | undefined) => (c || "").trim().toLowerCase();
export const monthDays = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
/** Share of the month already behind us (counts today), for prorating the visits a doctor needs. */
export const monthFrac = (today: string, month = today.slice(0, 7)) => month < today.slice(0, 7) ? 1 : month > today.slice(0, 7) ? 0 : Number(today.slice(8, 10)) / monthDays(month);

export async function repCities(repIds: string[]): Promise<Map<string, { cities: string[]; assigned: boolean }>> {
  const out = new Map<string, { cities: string[]; assigned: boolean }>();
  if (!repIds.length) return out;
  const [set, worked] = await Promise.all([
    query<{ rep_id: string; city: string }>("SELECT rep_id, city FROM rep_cities WHERE rep_id = ANY($1::uuid[]) ORDER BY city", [repIds]),
    query<{ rep_id: string; city: string }>(`SELECT DISTINCT x.rep_id, btrim(d.city) city FROM (
        SELECT v.sales_rep_id rep_id, v.doctor_id FROM visits v WHERE v.sales_rep_id = ANY($1::uuid[]) AND v.visited_at > now() - interval '90 days'
        UNION SELECT p.user_id, pi.doctor_id FROM plan_items pi JOIN plans p ON p.id=pi.plan_id WHERE p.user_id = ANY($1::uuid[]) AND pi.planned_date > now()::date - 90) x
      JOIN doctors d ON d.id=x.doctor_id WHERE btrim(COALESCE(d.city,'')) <> '' ORDER BY 2`, [repIds]),
  ]);
  for (const id of repIds) {
    const own = set.rows.filter(r => r.rep_id === id).map(r => r.city);
    out.set(id, own.length ? { cities: own, assigned: true } : { cities: worked.rows.filter(r => r.rep_id === id).map(r => r.city), assigned: false });
  }
  return out;
}

export const FREQ_DEFAULT: Record<string, number> = { A: 4, B: 2, C: 1 };
export async function frequencies(): Promise<Record<string, number>> {
  const r = await query<{ classification: string; visits_per_month: number }>("SELECT classification, visits_per_month FROM plan_frequencies").catch(() => ({ rows: [] }));
  const f = { ...FREQ_DEFAULT }; for (const x of r.rows) f[String(x.classification).toUpperCase()] = Number(x.visits_per_month);
  return f;
}
export const need = (cls: string | null, f: Record<string, number>) => f[(cls || "").toUpperCase()] ?? f.C ?? 1;

export type TDoctor = { id: string; name: string; clinic: string; clinic_id: string | null; city: string; cls: string | null; phone: string; reason: string; icon: string; tone: string; score: number; late: boolean;
  month_visits: number; required: number; in_plan: string | null; sales: number; overdue: number };
export type TCity = { city: string; doctors: number; a: number; required: number; done: number; late: number; planned: number; sales: number; overdue: number };

/** Pure: roll the area's doctors up per city (required visits are prorated to today). */
export function rollCities(docs: TDoctor[], frac: number): TCity[] {
  const m = new Map<string, TCity>();
  const clinicSeen = new Set<string>();
  for (const d of docs) {
    const c = m.get(d.city) || { city: d.city, doctors: 0, a: 0, required: 0, done: 0, late: 0, planned: 0, sales: 0, overdue: 0 };
    c.doctors++; if (d.cls === "A") c.a++;
    c.required += d.required * frac; c.done += Math.min(d.month_visits, d.required);
    if (d.late) c.late++; if (d.in_plan) c.planned++;
    // money is per clinic, not per doctor
    const ck = d.clinic_id || `n:${cityKey(d.clinic)}`;
    if (d.clinic && !clinicSeen.has(ck)) { clinicSeen.add(ck); c.sales += d.sales; c.overdue += d.overdue; }
    m.set(d.city, c);
  }
  return [...m.values()].map(c => ({ ...c, required: Math.round(c.required) })).sort((a, b) => (b.required - b.done) - (a.required - a.done) || b.doctors - a.doctors);
}

/** The rep's area: doctors (ranked, with this month's visits and their clinic's own-product sales) and the per-city roll-up. */
export async function territory(repId: string, today: string) {
  const month = today.slice(0, 7), m1 = `${month}-01`;
  const [cityInfo, ranked, freq, visits, sales, bals, all] = await Promise.all([
    repCities([repId]).then(m => m.get(repId)!),
    rankedDoctors(repId, today),
    frequencies(),
    query<{ doctor_id: string; n: number }>(`SELECT doctor_id, count(*)::int n FROM visits WHERE sales_rep_id=$1 AND status::text IN ('completed','follow_up')
      AND (visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $2::date AND $3::date GROUP BY 1`, [repId, m1, today]),
    query<{ clinic_id: string; v: number }>(`SELECT clinic_id, sum(value)::float8 v FROM daftra_sales_v WHERE rep_id=$1 AND clinic_id IS NOT NULL AND invoice_date BETWEEN $2::date AND $3::date GROUP BY 1`, [repId, m1, today]).catch(() => ({ rows: [] })),
    clinicBalances(today, repId).catch(() => []),
    query<{ city: string }>("SELECT DISTINCT btrim(city) city FROM doctors WHERE status='active' AND btrim(COALESCE(city,'')) <> '' ORDER BY 1"),
  ]);
  const keys = new Set(cityInfo.cities.map(cityKey));
  const vm = new Map(visits.rows.map(v => [v.doctor_id, v.n])), sm = new Map(sales.rows.map(s => [s.clinic_id, s.v]));
  const bm = new Map(bals.map(b => [b.id, b])), bn = new Map(bals.map(b => [cityKey(b.name), b]));
  const docs: TDoctor[] = ranked.filter(d => !d.paused && (!keys.size || keys.has(cityKey(d.city)))).map(d => {
    const b = (d.clinic_id && bm.get(d.clinic_id)) || bn.get(cityKey(d.clinic_name)) || null;
    return { id: d.id, name: d.name, clinic: d.clinic_name || "", clinic_id: d.clinic_id, city: (d.city || "").trim() || "بدون مدينة", cls: d.classification ? d.classification.toUpperCase() : null, phone: d.phone || "",
      reason: d.prio.reason, icon: d.prio.icon, tone: d.prio.tone, score: d.prio.score, late: d.prio.tags.includes("late") || d.prio.tags.includes("a_late"),
      month_visits: vm.get(d.id) || 0, required: need(d.classification, freq), in_plan: d.in_plan_next, sales: Math.round((d.clinic_id && sm.get(d.clinic_id)) || 0), overdue: b?.overdue || 0 };
  });
  const frac = monthFrac(today);
  return { month, today, frac, assigned: cityInfo.assigned, cities: cityInfo.cities, allCities: all.rows.map(r => r.city), byCity: rollCities(docs, frac), doctors: docs };
}
export type Territory = Awaited<ReturnType<typeof territory>>;

/** Light coverage numbers for many reps at once (for the score and the admin matrix): per rep and city, required vs. done this month. */
export async function coverageRows(repIds: string[], month: string, end: string) {
  if (!repIds.length) return [];
  const m1 = `${month}-01`;
  return (await query<{ rep_id: string; city: string; doctor_id: string; cls: string | null; n: number }>(`
    WITH v AS (SELECT sales_rep_id rep_id, doctor_id, count(*)::int n FROM visits WHERE sales_rep_id = ANY($1::uuid[]) AND status::text IN ('completed','follow_up')
      AND (visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $2::date AND $3::date GROUP BY 1, 2)
    SELECT u.id rep_id, btrim(COALESCE(d.city,'')) city, d.id doctor_id, NULLIF(upper(d.classification),'') cls, COALESCE(v.n, 0) n
    FROM unnest($1::uuid[]) u(id) JOIN doctors d ON d.status='active' AND NOT ${pausedSql("u.id", "d.id", "$2::date")}
    LEFT JOIN v ON v.rep_id=u.id AND v.doctor_id=d.id`, [repIds, m1, end])).rows;
}
