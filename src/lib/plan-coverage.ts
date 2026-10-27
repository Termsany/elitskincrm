import { riyadhDateParts } from "@/lib/plan-reminders";

type CoverageActor = { id: string; role: "admin" | "sales_rep" };

export function resolveCoverageUserId(actor: CoverageActor, requestedUserId?: string | null) {
  return actor.role === "admin" && requestedUserId ? requestedUserId : actor.id;
}

export function coverageMonthStart(now = new Date()) {
  const { date } = riyadhDateParts(now);
  return `${date.slice(0, 7)}-01`;
}
