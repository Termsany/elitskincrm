import { query } from "@/lib/db";

/**
 * A rep's open follow-ups in one list: the follow-up date set on a visit (open until a later completed visit
 * to that doctor or until the rep closes it) and the follow-up tasks (doctor_followups).
 */
export type OpenFollowup = { id: string; source: "visit" | "task"; doctor_id: string; doctor: string; clinic: string; city: string; cls: string | null; due: string; note: string; product_id: string | null };

export async function openFollowups(repId: string, doctorId?: string): Promise<OpenFollowup[]> {
  const vals: unknown[] = [repId]; let d = "";
  if (doctorId) { vals.push(doctorId); d = "AND x.doctor_id = $2"; }
  return (await query<OpenFollowup>(`SELECT x.*, dd.name doctor, COALESCE(dd.clinic_name,'') clinic, COALESCE(dd.city,'') city, NULLIF(upper(dd.classification),'') cls FROM (
      SELECT v.id::text id, 'visit' source, v.doctor_id, v.follow_up_at::text due, COALESCE(v.follow_up_note,'') note,
        (SELECT pp.product_id FROM visit_presented_products pp WHERE pp.visit_id=v.id ORDER BY (pp.reaction='interested') DESC LIMIT 1)::text product_id
      FROM visits v WHERE v.sales_rep_id=$1 AND v.follow_up_at IS NOT NULL AND v.follow_up_done_at IS NULL AND v.status::text<>'cancelled'
        AND NOT EXISTS (SELECT 1 FROM visits v2 WHERE v2.doctor_id=v.doctor_id AND v2.sales_rep_id=v.sales_rep_id AND v2.visited_at>v.visited_at AND v2.status::text IN ('completed','follow_up'))
      UNION ALL
      SELECT f.id::text, 'task', f.doctor_id, f.due_at::text, concat_ws(' — ', NULLIF(f.title,''), NULLIF(f.note,'')), f.product_id::text
      FROM doctor_followups f WHERE f.sales_rep_id=$1 AND f.completed_at IS NULL AND COALESCE(f.status,'open') NOT IN ('done','completed','closed','cancelled')
    ) x JOIN doctors dd ON dd.id=x.doctor_id WHERE true ${d} ORDER BY x.due, dd.name`, vals)).rows;
}

/** Close (done) or move (snooze to a date) one of the rep's follow-ups. Returns false when it isn't theirs. */
export async function updateFollowup(repId: string, source: "visit" | "task", id: string, action: "done" | "snooze", date?: string) {
  if (source === "visit") {
    const r = action === "done"
      ? await query("UPDATE visits SET follow_up_done_at=now() WHERE id=$1 AND sales_rep_id=$2 AND follow_up_at IS NOT NULL RETURNING id", [id, repId])
      : await query("UPDATE visits SET follow_up_at=$3::date WHERE id=$1 AND sales_rep_id=$2 RETURNING id", [id, repId, date]);
    return !!r.rowCount;
  }
  const r = action === "done"
    ? await query("UPDATE doctor_followups SET status='completed', completed_at=now() WHERE id=$1 AND sales_rep_id=$2 RETURNING id", [id, repId])
    : await query("UPDATE doctor_followups SET due_at=$3::date WHERE id=$1 AND sales_rep_id=$2 RETURNING id", [id, repId, date]);
  return !!r.rowCount;
}
