export const PLAN_PERIODS = ["daily", "weekly", "monthly"] as const;
export type PlanPeriod = typeof PLAN_PERIODS[number];
export const PLAN_CREATOR_PERIOD = "weekly" as const;

export function planPeriodLabel(period: PlanPeriod | string) {
  return period === "daily" ? "يومية" : period === "weekly" ? "أسبوعية" : "شهرية";
}
