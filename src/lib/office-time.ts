import { query } from "@/lib/db";

export { OFFICE_KINDS, DAY_MIN } from "@/lib/office-kinds";

/** Minutes of office time per day for one rep in [from, to]. */
export async function officeByDay(userId: string, from: string, to: string): Promise<Record<string, number>> {
  const r = await query<{ day: string; m: number }>(`SELECT day::text AS day, sum(minutes)::int m FROM office_time WHERE user_id=$1 AND day BETWEEN $2::date AND $3::date GROUP BY 1`, [userId, from, to]).catch(() => ({ rows: [] as Array<{ day: string; m: number }> }));
  return Object.fromEntries(r.rows.map(x => [x.day, x.m]));
}
