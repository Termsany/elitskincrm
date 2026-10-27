import type { ProfilePlan, ProfileTask, ProfileVisit } from "@/components/DoctorProfile";

export type Followup = {
  id: string; title: string; note: string; due_at: string;
  status: "open" | "completed" | "cancelled";
  product_name: string | null; rep_name: string | null;
};

export type DoctorTimelineEvent =
  | { type: "visit"; date: string; data: ProfileVisit }
  | { type: "followup"; date: string; data: Followup }
  | { type: "task"; date: string; data: ProfileTask }
  | { type: "planned_visit"; date: string; data: ProfilePlan };

/**
 * Merges every kind of doctor interaction (past visits, follow-ups, related
 * tasks with a due date, and upcoming approved plan visits) into one
 * chronological log, newest/soonest first. Pure — no fetching here.
 */
export function buildDoctorTimeline(input: {
  visits: ProfileVisit[];
  followups: Followup[];
  tasks: ProfileTask[];
  plans: ProfilePlan[];
}): DoctorTimelineEvent[] {
  const events: DoctorTimelineEvent[] = [];
  for (const v of input.visits) events.push({ type: "visit", date: String(v.visited_at), data: v });
  for (const f of input.followups) events.push({ type: "followup", date: f.due_at, data: f });
  for (const t of input.tasks) if (t.due_date) events.push({ type: "task", date: t.due_date, data: t });
  for (const p of input.plans) events.push({ type: "planned_visit", date: p.planned_date, data: p });
  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
