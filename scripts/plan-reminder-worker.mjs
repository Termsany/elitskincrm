import pg from "pg";
import { pathToFileURL } from "node:url";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

function riyadhParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export function isReminderHour(now = new Date()) {
  return riyadhParts(now).hour === 8;
}

export async function sendTaskReminders({ secret = process.env.CRON_SECRET, baseUrl = process.env.APP_BASE_URL || "http://app:3100", fetchImpl = fetch } = {}) {
  const token = secret?.trim();
  if (!token) throw new Error("CRON_SECRET is not configured");
  const response = await fetchImpl(new URL("/api/tasks/reminders", baseUrl), {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`task reminder endpoint returned HTTP ${response.status}`);
  const payload = await response.json();
  return Number(payload.created) || 0;
}

function reminderMessage(names) {
  if (names.length === 1) return `لديك اليوم زيارة واحدة: ${names[0]}`;
  return `لديك اليوم ${names.length === 2 ? "زيارتان" : `${names.length} زيارات`}: ${names.join("، ")}`;
}

async function sendDailyPlanReminders(now = new Date()) {
  const { date, hour } = riyadhParts(now);
  if (hour !== 8) return 0;
  const rows = await pool.query(`
    SELECT p.id plan_id, p.user_id, d.name doctor_name
    FROM plans p
    JOIN plan_items pi ON pi.plan_id=p.id
    JOIN doctors d ON d.id=pi.doctor_id
    WHERE p.status='approved' AND pi.planned_date=$1
    ORDER BY p.user_id, p.id, d.name
  `, [date]);
  const groups = new Map();
  for (const row of rows.rows) {
    const key = `${row.user_id}:${row.plan_id}`;
    if (!groups.has(key)) groups.set(key, { userId: row.user_id, planId: row.plan_id, names: [] });
    groups.get(key).names.push(row.doctor_name);
  }
  let inserted = 0;
  for (const group of groups.values()) {
    const result = await pool.query(`
      INSERT INTO task_notifications(user_id, task_id, plan_id, kind, message, notification_date)
      VALUES($1,NULL,$2,'daily_plan',$3,$4)
      ON CONFLICT (user_id, plan_id, notification_date, kind)
      WHERE plan_id IS NOT NULL AND notification_date IS NOT NULL
      DO NOTHING RETURNING id
    `, [group.userId, group.planId, reminderMessage(group.names), date]);
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

async function sendCalendarReminders({ secret = process.env.CRON_SECRET, baseUrl = process.env.APP_BASE_URL || "http://app:3100", fetchImpl = fetch } = {}) {
  const token = secret?.trim();
  if (!token) throw new Error("CRON_SECRET is not configured");
  const response = await fetchImpl(new URL("/api/calendar/reminders", baseUrl), { method: "GET", headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`calendar reminder endpoint returned HTTP ${response.status}`);
  const payload = await response.json();
  return Number(payload.created) || 0;
}

async function runWorker() {
  console.log("plan and task reminder worker started — Asia/Riyadh 08:00");
  while (true) {
    try {
      const now = new Date();
      const insertedPlans = await sendDailyPlanReminders(now);
      if (insertedPlans) console.log(`inserted ${insertedPlans} daily plan reminders`);
      const insertedCalendar = await sendCalendarReminders();
      if (insertedCalendar) console.log(`inserted ${insertedCalendar} calendar reminders`);
      if (isReminderHour(now)) {
        const insertedTasks = await sendTaskReminders();
        if (insertedTasks) console.log(`inserted ${insertedTasks} task reminders`);
      }
    } catch (error) {
      console.error("reminder worker error", error);
    }
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await runWorker();
}
