import { query } from "@/lib/db";
import { enrichedVisits, type EVisit } from "@/lib/visit-intel";
import { addDays } from "@/lib/fmt";

export type Rules = { min_notes: number; far_m: number; days: number };
export type ReviewIssue = "gps" | "notes" | "far" | "burst";
export const ISSUE_LABEL: Record<ReviewIssue, string> = { gps: "من غير موقع", notes: "ملاحظات قصيرة", far: "بعيدة عن العيادة", burst: "مسجلة مع زيارات تانية من نفس المكان" };
export const DEFAULT_RULES: Rules = { min_notes: 15, far_m: 300, days: 14 };

/** Why a visit needs a manager's eye, by the configurable rules (cancelled visits never do). */
export function reviewIssues(v: Pick<EVisit, "status" | "lat" | "notes" | "distance_m" | "flags">, r: Rules): ReviewIssue[] {
  if (v.status === "cancelled") return [];
  const out: ReviewIssue[] = [];
  if (v.lat === null) out.push("gps");
  if ((v.notes || "").trim().length < r.min_notes) out.push("notes");
  if (v.distance_m !== null && v.distance_m > r.far_m) out.push("far");
  if (v.flags.some(f => f.code === "burst")) out.push("burst");
  return out;
}

export async function getRules(): Promise<Rules> {
  const r = await query<Rules>("SELECT min_notes, far_m, days FROM review_rules WHERE id=1").catch(() => ({ rows: [] as Rules[] }));
  return r.rows[0] || DEFAULT_RULES;
}

export type ReviewRow = { id: string; doctor_id: string; doctor: string; clinic: string; city: string; rep_id: string; rep: string; day: string; hm: string; notes: string;
  products: string[]; attachments: number; issues: ReviewIssue[]; status: "review" | "fix" | "ok"; reason: string; distance_m: number | null };

/** Flagged visits in the rules' window with their review status: review (untouched), fix (sent back, not fixed yet), ok (approved). */
export async function reviewRows(today: string, rules: Rules, days?: number): Promise<ReviewRow[]> {
  const from = addDays(today, -Math.max(1, Math.min(60, days || rules.days)) + 1);
  const [vs, checks] = await Promise.all([
    enrichedVisits({ from, to: today }),
    query<{ visit_id: string; status: string; reason: string; resolved: boolean }>(`SELECT visit_id::text visit_id, status, reason, resolved_at IS NOT NULL resolved FROM visit_checks WHERE checked_at > now() - interval '90 days'`),
  ]);
  const ck = new Map(checks.rows.map(c => [c.visit_id, c]));
  const out: ReviewRow[] = [];
  for (const v of vs) {
    const issues = reviewIssues(v, rules), c = ck.get(v.id);
    if (!issues.length && !c) continue;
    const status: ReviewRow["status"] = !c ? "review" : c.status === "approved" ? "ok" : c.resolved ? "review" : "fix";
    out.push({ id: v.id, doctor_id: v.doctor_id, doctor: v.doctor_name, clinic: v.clinic_name, city: v.city, rep_id: v.rep_id, rep: v.rep_name, day: v.day, hm: v.hm, notes: v.notes,
      products: v.presented.map(p => p.name), attachments: v.attachments, issues, status, reason: c?.reason || "", distance_m: v.distance_m });
  }
  return out.sort((a, b) => b.issues.length - a.issues.length || (b.day + b.hm).localeCompare(a.day + a.hm));
}
