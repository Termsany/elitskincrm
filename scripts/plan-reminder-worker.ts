import { query } from "../src/lib/db";
import { buildDailyReminderMessage, isRiyadhReminderHour, riyadhDateParts } from "../src/lib/plan-reminders";

async function sendDailyPlanReminders(now = new Date()) {
  if (!isRiyadhReminderHour(now)) return 0;
  const { date } = riyadhDateParts(now);
  const rows = await query(`
    SELECT p.id plan_id, p.user_id, d.name doctor_name
    FROM plans p
    JOIN plan_items pi ON pi.plan_id=p.id
    JOIN doctors d ON d.id=pi.doctor_id
    WHERE p.status='approved' AND pi.planned_date=$1
    ORDER BY p.user_id, p.id, d.name
  `, [date]);
  const groups = new Map<string, { userId: string; planId: string; names: string[] }>();
  for (const row of rows.rows as Record<string, unknown>[]) {
    const userId = String(row.user_id);
    const planId = String(row.plan_id);
    const key = `${userId}:${planId}`;
    if (!groups.has(key)) groups.set(key, { userId, planId, names: [] });
    groups.get(key)!.names.push(String(row.doctor_name));
  }
  let inserted = 0;
  for (const group of groups.values()) {
    const result = await query(`
      INSERT INTO task_notifications(user_id, task_id, plan_id, kind, message, notification_date)
      VALUES($1,NULL,$2,'daily_plan',$3,$4)
      ON CONFLICT (user_id, plan_id, notification_date, kind)
      WHERE plan_id IS NOT NULL AND notification_date IS NOT NULL
      DO NOTHING
      RETURNING id
    `, [group.userId, group.planId, buildDailyReminderMessage(group.names), date]);
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

async function main() {
  console.log("plan reminder worker started — Asia/Riyadh 08:00");
  while (true) {
    try {
      const inserted = await sendDailyPlanReminders();
      if (inserted) console.log(`inserted ${inserted} daily plan reminders`);
    } catch (error) {
      console.error("plan reminder worker error", error);
    }
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
