import { query } from "@/lib/db";
import { salesPace } from "@/lib/smart";
import { addDays } from "@/lib/fmt";
import { cityKey, coverageRows, frequencies, monthDays, monthFrac, need, repCities } from "@/lib/territory";

import { DEFAULT_WEIGHTS, parts, score, type Raw, type Weights } from "@/lib/rep-score-core";

/** Loads the numbers behind the monthly rep score (see rep-score-core for the formula). */
export * from "@/lib/rep-score-core";

export async function loadWeights(): Promise<Weights> {
  const r = await query<Weights>("SELECT plan, coverage, sales, quality, discipline FROM rep_score_weights WHERE id=1").catch(() => ({ rows: [] as Weights[] }));
  return r.rows[0] ? { ...DEFAULT_WEIGHTS, ...r.rows[0] } : { ...DEFAULT_WEIGHTS };
}

const lastDay = (m: string) => `${m}-${String(monthDays(m)).padStart(2, "0")}`;
export const prevMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

/** Raw numbers for every active rep (or one) for a month, up to today when it is the current month. */
export async function rawScores(month: string, today: string, repId?: string): Promise<Array<{ rep_id: string; name: string; raw: Raw }>> {
  if (month > today.slice(0, 7)) return [];
  const m1 = `${month}-01`, end = month === today.slice(0, 7) ? today : lastDay(month);
  // a planned visit only counts once its day has passed (or it was already done)
  const cut = month === today.slice(0, 7) ? addDays(today, -1) : end;
  const reps = (await query<{ id: string; name: string }>(`SELECT id, name FROM users WHERE role='sales_rep' AND active ${repId ? "AND id=$1" : ""} ORDER BY name`, repId ? [repId] : [])).rows;
  if (!reps.length) return [];
  const ids = reps.map(r => r.id);
  const [plan, vis, days, pace, cities, cov, freq] = await Promise.all([
    query<{ rep_id: string; planned: number; done: number }>(`SELECT p.user_id rep_id, count(*)::int planned,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM visits v WHERE v.doctor_id=pi.doctor_id AND v.sales_rep_id=p.user_id AND v.status::text IN ('completed','follow_up')
          AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN pi.planned_date - extract(dow FROM pi.planned_date)::int AND pi.planned_date - extract(dow FROM pi.planned_date)::int + 6))::int done
      FROM plan_items pi JOIN plans p ON p.id=pi.plan_id
      WHERE p.user_id = ANY($1::uuid[]) AND p.status::text IN ('approved','pending') AND pi.planned_date BETWEEN $2::date AND $3::date GROUP BY 1`, [ids, m1, cut]),
    query<{ rep_id: string; total: number; cancelled: number; completed: number; productive: number }>(`SELECT v.sales_rep_id rep_id, count(*)::int total,
        count(*) FILTER (WHERE v.status::text='cancelled')::int cancelled,
        count(*) FILTER (WHERE v.status::text IN ('completed','follow_up'))::int completed,
        count(*) FILTER (WHERE v.status::text IN ('completed','follow_up') AND (v.follow_up_at IS NOT NULL OR length(btrim(COALESCE(v.notes,''))) >= 20
          OR EXISTS (SELECT 1 FROM visit_items i WHERE i.visit_id=v.id) OR EXISTS (SELECT 1 FROM visit_presented_products pp WHERE pp.visit_id=v.id)))::int productive
      FROM visits v WHERE v.sales_rep_id = ANY($1::uuid[]) AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $2::date AND $3::date GROUP BY 1`, [ids, m1, end]),
    // work days (Sun–Thu, not on leave) up to yesterday, and those with no visit and no office time
    query<{ rep_id: string; work: number; idle: number }>(`SELECT u.id rep_id, count(*)::int work,
        count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM visits v WHERE v.sales_rep_id=u.id AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=g.d)
          AND NOT EXISTS (SELECT 1 FROM office_time o WHERE o.user_id=u.id AND o.day=g.d))::int idle
      FROM unnest($1::uuid[]) u(id) CROSS JOIN generate_series($2::date, $3::date, interval '1 day') g(d)
      WHERE extract(dow FROM g.d) NOT IN (5, 6)
        AND NOT EXISTS (SELECT 1 FROM service_requests r WHERE r.requester_id=u.id AND r.kind='leave' AND r.status IN ('approved','completed','closed') AND g.d BETWEEN r.start_date AND r.end_date)
      GROUP BY 1`, [ids, m1, cut]).catch(() => ({ rows: [] as Array<{ rep_id: string; work: number; idle: number }> })),
    salesPace(end, repId).catch(() => []),
    repCities(ids),
    coverageRows(ids, month, end),
    frequencies(),
  ]);
  const frac = monthFrac(end, month);
  return reps.map(r => {
    const p = plan.rows.find(x => x.rep_id === r.id), v = vis.rows.find(x => x.rep_id === r.id), d = days.rows.find(x => x.rep_id === r.id), s = pace.find(x => x.rep_id === r.id);
    const keys = new Set((cities.get(r.id)?.cities || []).map(cityKey));
    let required = 0, covered = 0, aRequired = 0, aCovered = 0;
    for (const c of cov) {
      if (c.rep_id !== r.id || (keys.size && !keys.has(cityKey(c.city)))) continue;
      const n = need(c.cls, freq), req = n * frac, got = Math.min(c.n, Math.ceil(req));
      required += req; covered += got; if (c.cls === "A") { aRequired += req; aCovered += got; }
    }
    const day = Number(end.slice(8, 10)), target = s?.target || 0;
    return { rep_id: r.id, name: r.name, raw: {
      planned: p?.planned || 0, planDone: p?.done || 0, required: Math.round(required * 10) / 10, covered, aRequired: Math.round(aRequired * 10) / 10, aCovered,
      target, expected: target * day / monthDays(month), mtd: s?.mtd || 0,
      completed: v?.completed || 0, productive: v?.productive || 0, total: v?.total || 0, cancelled: v?.cancelled || 0, workDays: d?.work || 0, idleDays: d?.idle || 0,
    } };
  });
}

/** Scores for a month with last month's score next to each rep (for the trend). */
export async function repScores(month: string, today: string, repId?: string) {
  const [w, now, prev] = await Promise.all([loadWeights(), rawScores(month, today, repId), rawScores(prevMonth(month), today, repId)]);
  const rows = now.map(x => {
    const p = parts(x.raw), s = score(p, w), pr = prev.find(y => y.rep_id === x.rep_id);
    return { rep_id: x.rep_id, name: x.name, raw: x.raw, parts: p, ...s, prev: pr ? score(parts(pr.raw), w).score : null };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return { month, weights: w, rows };
}
export type RepScores = Awaited<ReturnType<typeof repScores>>;
