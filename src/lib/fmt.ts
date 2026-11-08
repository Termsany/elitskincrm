/** Small shared helpers used across the CRM — one definition each, safe in the browser and on the server. */
export { riyadhToday } from "@/lib/riyadh-day";

/** Any canonical UUID text (8-4-4-4-12 hex), as accepted by PostgreSQL's uuid type. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** YYYY-MM-DD plus n days (calendar days, no time-zone drift). */
export const addDays = (d: string, n: number) => { const t = new Date(`${d.slice(0, 10)}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

/** Whole riyals: 12,400 ر.س (— when empty). */
export const sar = (n: number | null | undefined) => n === null || n === undefined || !Number.isFinite(n) ? "—" : `${Math.round(n).toLocaleString("en-US")} ر.س`;
