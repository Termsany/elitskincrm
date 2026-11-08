import { query } from "@/lib/db";
import type { HubDoctor } from "@/lib/doctors-hub";
import { rankedDoctors } from "@/lib/doctor-suggest";
import { clinicBalances, type ClinicBalance } from "@/lib/clinic-balances";
import type { Prio } from "@/lib/doctor-priority";
import { addDays, itemState, pace, planChecks, suggestDay, weekDays, type DayLoad, type ItemState } from "@/lib/plan-week-core";
import { diffSummaryText } from "@/lib/plan-diff";
import { opsCounts } from "@/lib/plan-changes";

/**
 * Weekly plan data: one rep's week (items with done/missed, reasons, pace, smart suggestions, next week),
 * and the admin's team board built from the same numbers.
 */
export type WeekItem = { id: string; date: string; plan_id: string; plan_status: string; doctor_id: string; doctor: string; clinic: string; city: string; cls: string | null; phone: string;
  product_id: string | null; product: string | null; done_at: string | null; done_on: string | null; pending_change: boolean; state: ItemState; reason: string; icon: string; tone: string };
export type Suggest = { doctor_id: string; name: string; clinic: string; city: string; cls: string | null; reason: string; icon: string; tone: string; day: string | null; score: number };

type Ctx = { hub: Map<string, HubDoctor>; prio: Map<string, Prio> };
async function context(repId: string, today: string, balances?: ClinicBalance[]): Promise<Ctx> {
  const rows = await rankedDoctors(repId, today, balances);
  return { hub: new Map(rows.map(d => [d.id, d])), prio: new Map(rows.map(d => [d.id, d.prio])) };
}

export async function repWeek(repId: string, start: string, today: string, opts: { balances?: ClinicBalance[]; ctx?: Ctx } = {}) {
  const days = weekDays(start), end = days[4], nStart = addDays(start, 7), nEnd = addDays(start, 11);
  const [plans, items, visits, next, ctx] = await Promise.all([
    query<{ id: string; status: string; period: string; ps: string; pe: string; admin_note: string | null }>(`SELECT id, status::text status, period::text period, period_start::text ps, period_end::text pe, admin_note
      FROM plans WHERE user_id=$1 AND status::text<>'rejected' AND period_start<=$3::date AND period_end>=$2::date ORDER BY period_start`, [repId, start, end]),
    query<Omit<WeekItem, "state" | "reason" | "icon" | "tone">>(`SELECT pi.id, pi.planned_date::text date, pi.plan_id, p.status::text plan_status, d.id doctor_id, d.name doctor, COALESCE(d.clinic_name,'') clinic, COALESCE(d.city,'') city,
        NULLIF(upper(d.classification),'') cls, COALESCE(d.phone,'') phone, pr.id product_id, pr.name product,
        (SELECT to_char(min(v.visited_at) AT TIME ZONE 'Asia/Riyadh', 'HH24:MI') FROM visits v WHERE v.doctor_id=pi.doctor_id AND v.sales_rep_id=p.user_id AND v.status::text IN ('completed','follow_up')
          AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=pi.planned_date) done_at,
        (SELECT max((v.visited_at AT TIME ZONE 'Asia/Riyadh')::date)::text FROM visits v WHERE v.doctor_id=pi.doctor_id AND v.sales_rep_id=p.user_id AND v.status::text IN ('completed','follow_up')
          AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $2::date AND $3::date) done_on,
        EXISTS (SELECT 1 FROM plan_edit_requests r WHERE r.plan_id=p.id AND r.status='pending' AND (r.proposed_items @> jsonb_build_array(jsonb_build_object('item_id', pi.id::text)) OR r.proposed_items @> '[{"op":"replace"}]'::jsonb)) pending_change
      FROM plan_items pi JOIN plans p ON p.id=pi.plan_id JOIN doctors d ON d.id=pi.doctor_id LEFT JOIN products pr ON pr.id=pi.product_id
      WHERE p.user_id=$1 AND p.status::text<>'rejected' AND pi.planned_date BETWEEN $2::date AND $3::date
      ORDER BY pi.planned_date, COALESCE(d.city,''), COALESCE(d.clinic_name,''), pi.sort_order`, [repId, start, end]),
    query<{ doctor_id: string; day: string; status: string }>(`SELECT v.doctor_id, (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date::text AS day, v.status::text status FROM visits v
      WHERE v.sales_rep_id=$1 AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $2::date AND $3::date`, [repId, start, end]),
    query<{ id: string; status: string; n: number; a: number; c: number }>(`SELECT p.id, p.status::text status, count(pi.id)::int n, count(pi.id) FILTER (WHERE upper(d.classification)='A')::int a, count(pi.id) FILTER (WHERE upper(d.classification)='C')::int c
      FROM plans p LEFT JOIN plan_items pi ON pi.plan_id=p.id AND pi.planned_date BETWEEN $2::date AND $3::date LEFT JOIN doctors d ON d.id=pi.doctor_id
      WHERE p.user_id=$1 AND p.status::text<>'rejected' AND p.period_start<=$3::date AND p.period_end>=$2::date GROUP BY p.id ORDER BY p.created_at DESC LIMIT 1`, [repId, nStart, nEnd]),
    opts.ctx ? Promise.resolve(opts.ctx) : context(repId, today, opts.balances),
  ]);
  const list: WeekItem[] = items.rows.map(i => {
    const done = !!i.done_at || !!i.done_on;
    const p = ctx.prio.get(i.doctor_id);
    return { ...i, state: itemState(i.date, today, done), reason: p?.reason || "", icon: p?.icon || "", tone: p?.tone || "slate" };
  });
  const planned = new Set(list.map(i => `${i.doctor_id}:${i.date}`)), inWeek = new Set(list.map(i => i.doctor_id));
  const completed = visits.rows.filter(v => v.status === "completed" || v.status === "follow_up");
  const unplanned = completed.filter(v => !planned.has(`${v.doctor_id}:${v.day}`) && !inWeek.has(v.doctor_id)).length;
  const cancelled = visits.rows.filter(v => v.status === "cancelled").length;
  const sp = pace(list.map(i => ({ date: i.date, done: i.state === "done" })), today);
  const aItems = list.filter(i => i.cls === "A"), aDocs = new Set(aItems.map(i => i.doctor_id));
  const aDone = new Set(aItems.filter(i => i.state === "done").map(i => i.doctor_id));
  const loads: DayLoad[] = days.map(d => ({ date: d, count: list.filter(i => i.date === d).length, cities: [...new Set(list.filter(i => i.date === d).map(i => i.city).filter(Boolean))] }));
  const sugg: Suggest[] = [...ctx.hub.values()].filter(d => !d.paused && !inWeek.has(d.id) && (ctx.prio.get(d.id)?.score ?? 0) >= 20)
    .sort((a, b) => (ctx.prio.get(b.id)!.score - ctx.prio.get(a.id)!.score)).slice(0, 6)
    .map(d => { const p = ctx.prio.get(d.id)!; return { doctor_id: d.id, name: d.name, clinic: d.clinic_name || "", city: d.city || "", cls: d.classification, reason: p.reason, icon: p.icon, tone: p.tone, score: p.score, day: suggestDay(d.city, loads, today) }; });
  // a light remaining day → offer to fill it with suggestions from its city (or the top city)
  const light = loads.filter(l => l.date >= today && l.count < 4 && list.length > 0).sort((a, b) => a.count - b.count)[0] || null;
  const fill = light ? (() => {
    const city = light.cities[0] || sugg[0]?.city || "";
    const pick = sugg.filter(s => !city || s.city === city).slice(0, Math.max(0, 6 - light.count));
    return pick.length ? { date: light.date, count: light.count, city, doctors: pick.map(s => s.doctor_id) } : null;
  })() : null;
  const allDoctors = [...ctx.hub.values()];
  const aDue = allDoctors.filter(d => d.classification === "A" && !d.paused && (ctx.prio.get(d.id)?.tags.includes("late") || d.days_since === null)).length;
  return {
    start, end, today, days: loads.map(l => ({ ...l, done: list.filter(i => i.date === l.date && i.state === "done").length })),
    plans: plans.rows, items: list, suggestions: sugg, fill,
    kpi: { ...sp, aPlanned: aDocs.size, aDone: aDone.size, aDue, unplanned, cancelled, cancelRate: visits.rows.length ? Math.round(cancelled / visits.rows.length * 100) : 0 },
    next: next.rows[0] ? { ...next.rows[0], start: nStart, diffA: next.rows[0].a - aItems.length, diffC: next.rows[0].c - list.filter(i => i.cls === "C").length } : { id: null, status: "none", n: 0, a: 0, c: 0, start: nStart, diffA: 0, diffC: 0 },
  };
}
export type RepWeek = Awaited<ReturnType<typeof repWeek>>;

/** Admin board: every active rep's week, what needs a decision, smart suggestions, and the last 7 working days. */
export async function teamWeek(start: string, today: string) {
  const days = weekDays(start), end = days[4];
  const [reps, balances] = await Promise.all([
    query<{ id: string; name: string; last: string | null }>(`SELECT u.id, u.name, (SELECT max(v.visited_at) FROM visits v WHERE v.sales_rep_id=u.id)::text last FROM users u WHERE u.role='sales_rep' AND u.active ORDER BY u.name`),
    clinicBalances(today).catch(() => []),
  ]);
  const weeks = await Promise.all(reps.rows.map(r => repWeek(r.id, start, today, { balances }).then(w => ({ rep: r, w }))));
  const board = weeks.map(({ rep, w }) => {
    const status = w.plans.length ? (w.plans.some(p => p.status === "pending") ? "pending" : w.plans.some(p => p.status === "needs_revision") ? "needs_revision" : w.plans.some(p => p.status === "draft") ? "draft" : "approved") : "none";
    return { id: rep.id, name: rep.name, last: rep.last, status, ...w.kpi, heat: w.days.map(d => ({ date: d.date, planned: d.count, done: d.done, past: d.date < today })), emptyDays: w.days.filter(d => d.date >= today && d.count === 0).map(d => d.date) };
  });
  // pending plans with review checks
  const pend = (await query<{ id: string; user_id: string; name: string; ps: string; pe: string; period: string; created_at: string }>(`SELECT p.id, p.user_id, u.name, p.period_start::text ps, p.period_end::text pe, p.period::text period, p.created_at
    FROM plans p JOIN users u ON u.id=p.user_id WHERE p.status='pending' ORDER BY p.created_at`)).rows;
  const pendItems = pend.length ? (await query<{ plan_id: string; doctor_id: string; date: string; cls: string | null }>(`SELECT pi.plan_id, pi.doctor_id, pi.planned_date::text date, NULLIF(upper(d.classification),'') cls
    FROM plan_items pi JOIN doctors d ON d.id=pi.doctor_id WHERE pi.plan_id = ANY($1::uuid[])`, [pend.map(p => p.id)])).rows : [];
  const plansPending = pend.map(p => {
    const its = pendItems.filter(i => i.plan_id === p.id);
    const wk = weeks.find(x => x.rep.id === p.user_id)?.w;
    const pDays = p.period === "daily" ? [p.ps] : weekDays(p.ps).filter(d => d <= p.pe);
    return { ...p, visits: its.length, checks: planChecks(its, pDays, p.period === "daily" ? 0 : wk?.kpi.aDue ?? 0) };
  });
  const reqs = (await query<{ id: string; plan_id: string; note: string; proposed_items: Array<Record<string, unknown>>; created_at: string; name: string }>(`SELECT r.id, r.plan_id, r.note, r.proposed_items, r.created_at, u.name
    FROM plan_edit_requests r JOIN users u ON u.id=r.requested_by WHERE r.status='pending' ORDER BY r.created_at`)).rows.map(r => {
    const ops = r.proposed_items || [];
    const what = ops.some(o => o.op === "replace") ? `تعديل الخطة (${diffSummaryText(opsCounts(ops))})`
      : ops.map(o => o.op === "move" ? `نقل ${o.doctor_name} من ${o.from} لـ ${o.to}` : o.op === "add" ? `إضافة ${o.doctor_name} يوم ${o.to}` : o.op === "remove" ? `شيل ${o.doctor_name || "زيارة"}${o.date ? ` (${o.date})` : ""}` : "").filter(Boolean).join("، ");
    return { id: r.id, plan_id: r.plan_id, name: r.name, note: r.note, created_at: r.created_at, what };
  });
  // smart suggestions
  const smart: Array<{ kind: string; rep_id: string; rep: string; text: string; sub: string; action: string | null; doctors?: string[]; days?: string[]; date?: string }> = [];
  for (const { rep, w } of weeks) {
    const lateA = w.suggestions.filter(s => s.cls === "A" && /متأخر|ما اتزارش/.test(s.reason));
    if (lateA.length) smart.push({ kind: "late_a", rep_id: rep.id, rep: rep.name, text: `${rep.name}: ${lateA.length} دكاترة A محتاجين زيارة ومش في خطته`, sub: lateA.slice(0, 3).map(s => s.name).join("، "), action: "ضيفهم لخطته", doctors: lateA.map(s => s.doctor_id), days: lateA.map(s => s.day || addDays(start, 7)) });
    const empty = w.days.filter(d => d.date >= today && d.count === 0);
    if (empty.length && w.items.length) { const pick = w.suggestions.slice(0, 4); smart.push({ kind: "empty_day", rep_id: rep.id, rep: rep.name, text: `يوم ${new Intl.DateTimeFormat("ar-EG", { weekday: "long", timeZone: "UTC" }).format(new Date(`${empty[0].date}T12:00:00Z`))} فاضي عند ${rep.name}`, sub: pick.length ? `ممكن يتملى بـ ${pick.length} من المقترحين` : "مفيش مقترحين", action: pick.length ? "املاه" : null, doctors: pick.map(s => s.doctor_id), date: empty[0].date }); }
    if (!w.plans.length) smart.push({ kind: "no_plan", rep_id: rep.id, rep: rep.name, text: `${rep.name} مالوش خطة الأسبوع ده`, sub: "اعمله مسودة من الدكاترة المحتاجين زيارة", action: null });
    if (w.kpi.cancelRate >= 25 && w.kpi.cancelled >= 2) smart.push({ kind: "cancel", rep_id: rep.id, rep: rep.name, text: `${rep.name}: نسبة الإلغاء ${w.kpi.cancelRate}% الأسبوع ده`, sub: `${w.kpi.cancelled} زيارات اتلغت — راجع الأسباب`, action: null });
    if (w.kpi.unplanned >= 3) smart.push({ kind: "unplanned", rep_id: rep.id, rep: rep.name, text: `${rep.name}: ${w.kpi.unplanned} زيارات من برّه الخطة`, sub: "يمكن الخطة محتاجة تتعدل على الواقع", action: null });
  }
  const reorder = new Set<string>();
  for (const { w } of weeks) for (const s of w.suggestions) if (s.reason.includes("ميعاد طلبها")) reorder.add(s.clinic);
  if (reorder.size) smart.push({ kind: "reorder", rep_id: "", rep: "", text: `${reorder.size} عيادات جه ميعاد طلبها ومش في خطة حد`, sub: [...reorder].slice(0, 3).join("، "), action: null });
  // last 7 working days for the whole team
  const trend = (await query<{ day: string; planned: number; done: number }>(`SELECT pi.planned_date::text AS day, count(*)::int planned,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM visits v WHERE v.doctor_id=pi.doctor_id AND v.sales_rep_id=p.user_id AND v.status::text IN ('completed','follow_up') AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=pi.planned_date))::int done
    FROM plan_items pi JOIN plans p ON p.id=pi.plan_id JOIN users u ON u.id=p.user_id AND u.active
    WHERE p.status::text='approved' AND pi.planned_date BETWEEN $1::date - 13 AND $1::date AND extract(dow FROM pi.planned_date) NOT IN (5,6) GROUP BY 1 ORDER BY 1 DESC LIMIT 7`, [today])).rows.reverse();
  const tot = board.reduce((a, b) => ({ planned: a.planned + b.planned, done: a.done + b.done, aPlanned: a.aPlanned + b.aPlanned, aDone: a.aDone + b.aDone, unplanned: a.unplanned + b.unplanned }), { planned: 0, done: 0, aPlanned: 0, aDone: 0, unplanned: 0 });
  return { start, end, today, board, plansPending, requests: reqs, smart, trend,
    kpi: { reps: board.length, approved: board.filter(b => b.status === "approved").length, pending: plansPending.length + reqs.length, exec: tot.planned ? Math.round(tot.done / tot.planned * 100) : 0, ...tot } };
}
