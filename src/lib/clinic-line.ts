/**
 * One short wording for a clinic's Daftra account wherever it appears in a list or while starting a visit
 * (the full account lives on the doctor page). Money first, then the ordering rhythm.
 */
export type ClinicFacts = { overdue?: number; unpaid?: number; oldest?: number | null; status?: string | null; days_since?: number | null; change?: number | null; due?: boolean; top?: string[] };
export type ClinicLine = { tone: "bad" | "warn" | "info" | "ok"; text: string };
const sar = (n: number) => `${Math.round(n).toLocaleString("en-US")} ر.س`;

export function clinicLines(f: ClinicFacts): ClinicLine[] {
  const out: ClinicLine[] = [];
  if ((f.overdue || 0) > 0) out.push({ tone: "bad", text: `العيادة عليها ${sar(f.overdue!)} متأخرة${f.oldest && f.oldest > 0 ? ` من ${f.oldest} يوم` : ""} — اسأل عن السداد` });
  else if ((f.unpaid || 0) > 0) out.push({ tone: "info", text: `العيادة عليها ${sar(f.unpaid!)} لسه ما استحقش` });
  if (f.status === "stopped") out.push({ tone: "warn", text: `العيادة وقفت طلب من ${f.days_since} يوم` });
  else if (f.status === "declining") out.push({ tone: "warn", text: `طلب العيادة قلّ ${Math.abs(Math.round(f.change ?? 0))}%` });
  else if (f.due) out.push({ tone: "warn", text: "العيادة جه ميعاد طلبها" });
  else if (f.days_since !== null && f.days_since !== undefined) out.push({ tone: "ok", text: `آخر طلب للعيادة من ${f.days_since} يوم${f.top?.length ? ` · ${f.top.slice(0, 2).join("، ")}` : ""}` });
  return out;
}
export const LINE_TONE: Record<ClinicLine["tone"], string> = { bad: "bg-red-50 text-red-800 ring-red-200", warn: "bg-amber-50 text-amber-900 ring-amber-200", info: "bg-sky-50 text-sky-900 ring-sky-200", ok: "bg-emerald-50 text-emerald-800 ring-emerald-200" };
export const LINE_TEXT: Record<ClinicLine["tone"], string> = { bad: "text-red-700", warn: "text-amber-700", info: "text-sky-800", ok: "text-emerald-700" };
