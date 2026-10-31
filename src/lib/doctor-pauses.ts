/** "Inactive this month": a rep excludes a doctor from their coverage for one calendar month (Riyadh). */
export const riyadhMonthStart = (d = new Date()) => `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(d).slice(0, 7)}-01`;
export const nextMonthStart = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10); };

/** SQL predicate: doctor `doc` is paused by rep `rep` for the month containing `month` (all SQL expressions). */
export const pausedSql = (rep: string, doc: string, month: string) =>
  `EXISTS (SELECT 1 FROM doctor_month_pauses dmp WHERE dmp.rep_id=${rep} AND dmp.doctor_id=${doc} AND dmp.month=date_trunc('month', (${month})::date)::date)`;

/** Team-level: paused by every active rep (nobody is expected to visit) — only then it leaves team coverage. */
export const pausedByTeamSql = (doc: string, month: string) =>
  `(EXISTS (SELECT 1 FROM users ux WHERE ux.role='sales_rep' AND ux.active) AND NOT EXISTS (SELECT 1 FROM users ux WHERE ux.role='sales_rep' AND ux.active AND NOT ${pausedSql("ux.id", doc, month)}))`;

/** Reps may pause for the current month and the next one (planning ahead at month start). */
export function allowedMonth(m: string, today = new Date()) {
  const cur = riyadhMonthStart(today);
  return m === cur || m === nextMonthStart(cur);
}
