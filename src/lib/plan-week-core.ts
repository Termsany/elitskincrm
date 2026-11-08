/** Pure helpers for the weekly plan screens (rep "my week" and the admin team board). Saudi week: Sun–Thu. */
const DAY = 864e5;
const t = (d: string) => Date.parse(`${d.slice(0, 10)}T12:00:00Z`);
export const addDays = (d: string, n: number) => new Date(t(d) + n * DAY).toISOString().slice(0, 10);
export const weekday = (d: string) => new Date(t(d)).getUTCDay();

/** The week to show: this week's Sunday; on Fri/Sat the coming week. */
export function currentWeekStart(today: string) { const wd = weekday(today); return wd >= 5 ? addDays(today, 7 - wd) : addDays(today, -wd); }
export const weekDays = (sunday: string) => [0, 1, 2, 3, 4].map(i => addDays(sunday, i));
export const DAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export type ItemState = "done" | "missed" | "today" | "upcoming";
export function itemState(date: string, today: string, done: boolean): ItemState { return done ? "done" : date < today ? "missed" : date === today ? "today" : "upcoming"; }

export type DayLoad = { date: string; count: number; cities: string[] };
/** Best day for a suggested doctor: a remaining day already in the same city (lightest first), else the lightest remaining day. */
export function suggestDay(city: string | null, days: DayLoad[], today: string): string | null {
  const left = days.filter(d => d.date >= today && weekday(d.date) <= 4);
  if (!left.length) return null;
  const light = (a: DayLoad, b: DayLoad) => a.count - b.count || a.date.localeCompare(b.date);
  const same = city ? left.filter(d => d.cities.includes(city)).sort(light) : [];
  return (same[0] || [...left].sort(light)[0]).date;
}

/** Rep's pace: share of the visits due so far that got done, and where the week lands at that rate. */
export function pace(items: Array<{ date: string; done: boolean }>, today: string) {
  const dueSoFar = items.filter(i => i.date < today || (i.date === today && i.done));
  const done = items.filter(i => i.done).length, missed = items.filter(i => !i.done && i.date < today).length;
  const rate = dueSoFar.length ? dueSoFar.filter(i => i.done).length / dueSoFar.length : 1;
  const remaining = items.filter(i => !i.done && i.date >= today).length;
  const projected = Math.min(items.length, done + Math.round(remaining * rate));
  const label = !items.length ? "none" : missed === 0 ? "ok" : missed / Math.max(1, dueSoFar.length) > 0.4 ? "risk" : "behind";
  return { done, missed, planned: items.length, projected, rate: Math.round(rate * 100), label: label as "ok" | "behind" | "risk" | "none" };
}

export type CheckItem = { doctor_id: string; date: string; cls: string | null };
export type Check = { ok: boolean; text: string };
/** Quick review chips for a plan waiting for approval. */
export function planChecks(items: CheckItem[], days: string[], aDue: number): Check[] {
  const out: Check[] = [];
  const aIn = new Set(items.filter(i => i.cls === "A").map(i => i.doctor_id)).size;
  if (aDue > 0) out.push({ ok: aIn >= aDue, text: `دكاترة A ${aIn}/${aDue}` });
  else out.push({ ok: true, text: `${aIn} دكاترة A` });
  const per = new Map<string, number>(); for (const i of items) per.set(i.doctor_id, (per.get(i.doctor_id) || 0) + 1);
  const cRep = items.filter(i => i.cls === "C" && (per.get(i.doctor_id) || 0) > 1).map(i => i.doctor_id);
  if (new Set(cRep).size) out.push({ ok: false, text: `${new Set(cRep).size} أطباء C متكررين` });
  const empty = days.filter(d => !items.some(i => i.date === d));
  if (empty.length) out.push({ ok: false, text: `${empty.map(d => DAY_AR[weekday(d)]).join(" و")} ${empty.length > 1 ? "فاضيين" : "فاضي"}` });
  const dup = items.some((i, k) => items.findIndex(j => j.doctor_id === i.doctor_id && j.date === i.date) !== k);
  out.push(dup ? { ok: false, text: "طبيب متكرر في نفس اليوم" } : { ok: true, text: "مفيش تكرار في نفس اليوم" });
  const heavy = days.filter(d => items.filter(i => i.date === d).length > 10);
  if (heavy.length) out.push({ ok: false, text: `${heavy.map(d => DAY_AR[weekday(d)]).join(" و")} فيه أكتر من 10 زيارات` });
  return out;
}
