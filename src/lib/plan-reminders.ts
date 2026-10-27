export type PlanItemForGrouping = {
  planned_date: string | Date;
  doctor_name: string;
  clinic_name?: string | null;
  [key: string]: unknown;
};

export function riyadhDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export function taskReminderDateWindow(now = new Date()) {
  const { date: today } = riyadhDateParts(now);
  const next = new Date(`${today}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { today, tomorrow: next.toISOString().slice(0, 10) };
}

export function isRiyadhReminderHour(now = new Date()) {
  return riyadhDateParts(now).hour === 8;
}

export function groupPlanItemsByDate<T extends PlanItemForGrouping>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const date = typeof item.planned_date === "string" ? item.planned_date.slice(0, 10) : item.planned_date.toISOString().slice(0, 10);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(item);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, groupedItems]) => ({ date, items: groupedItems }));
}

export function buildDailyReminderMessage(doctorNames: string[]) {
  if (doctorNames.length === 1) return `لديك اليوم زيارة واحدة: ${doctorNames[0]}`;
  return `لديك اليوم ${doctorNames.length === 2 ? "زيارتان" : `${doctorNames.length} زيارات`}: ${doctorNames.join("، ")}`;
}
