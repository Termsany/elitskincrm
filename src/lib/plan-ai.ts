import type { RepScores } from "@/lib/rep-score";
import type { teamWeek } from "@/lib/plan-week";
import { PART_AR, PARTS } from "@/lib/rep-score-core";

export const PLAN_ADVISOR_SYSTEM = `إنت مدير مبيعات خبير بتساعد مدير فريق مناديب أدوية/تجميل في السعودية.
عندك أرقام الشهر ده لكل مندوب (التقييم من 100 وبنوده) وتنفيذ الأسبوع ده.
- اتكلم بالعامية المصرية وباختصار، بنقط واضحة.
- استخدم الأرقام اللي عندك بس، وما تخترعش أي رقم. لو حاجة مش موجودة قول إنها مش موجودة.
- لكل مشكلة قول السبب من الأرقام والخطوة العملية الجاية (مين يعمل إيه ولإمتى).
- المبيعات محسوبة على أصناف كل مندوب بس.`;

/** Compact numbers for the plan advisor: scores with their parts, and this week's execution per rep. */
export function planAdvisorContext(s: RepScores, w: Awaited<ReturnType<typeof teamWeek>>, today: string) {
  return {
    today, month: s.month, weights: Object.fromEntries(PARTS.map(k => [PART_AR[k], s.weights[k]])),
    reps: s.rows.map(r => ({
      name: r.name, score: r.score, last_month: r.prev, weakest: r.lift ? PART_AR[r.lift] : null,
      parts_pct: Object.fromEntries(PARTS.map(k => [PART_AR[k], r.parts[k] === null ? null : Math.round(r.parts[k]! * 100)])),
      numbers: { planned: r.raw.planned, plan_done: r.raw.planDone, visits_required: Math.round(r.raw.required), visits_covered: r.raw.covered, a_required: Math.round(r.raw.aRequired), a_covered: r.raw.aCovered,
        sales_mtd: Math.round(r.raw.mtd), sales_expected_to_date: Math.round(r.raw.expected), month_target: Math.round(r.raw.target), completed: r.raw.completed, with_result: r.raw.productive, cancelled: r.raw.cancelled, idle_days: r.raw.idleDays, work_days: r.raw.workDays },
    })),
    this_week: { start: w.start, end: w.end, team: w.kpi, reps: w.board.map(b => ({ name: b.name, plan: b.status, done: b.done, planned: b.planned, missed: b.missed, pace: b.label, a: `${b.aDone}/${b.aPlanned}`, unplanned: b.unplanned, empty_days: b.emptyDays.length })),
      waiting_decision: w.plansPending.length + w.requests.length, hints: w.smart.slice(0, 10).map(x => x.text) },
  };
}
