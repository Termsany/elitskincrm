import { query } from "@/lib/db";

/**
 * Employee requests (leave, exit & re-entry visa, salary advance, salary letter) stored in service_requests
 * with their own kinds. Leave balance follows Saudi labour law (21 days, 30 after five years of service);
 * unpaid leave and advance instalments are deducted from the monthly salary (salary ÷ 30 per day).
 */
export const HR_KINDS = ["leave", "exit_reentry", "advance", "salary_letter"] as const;
export type HrKind = (typeof HR_KINDS)[number];
export const isHrKind = (k: string): k is HrKind => (HR_KINDS as readonly string[]).includes(k);
export const LEAVE_TYPES = { annual: "إجازة سنوية", sick: "إجازة مرضية", unpaid: "إجازة بدون راتب" } as const;
export const VISA_TYPES = { single: "مفردة", multiple: "متعددة" } as const;
export const LETTER_TYPES = { bank: "للبنك", embassy: "للسفارة", other: "جهة أخرى" } as const;
export const KIND_LABEL: Record<HrKind, string> = { leave: "إجازة", exit_reentry: "خروج وعودة", advance: "سلفة", salary_letter: "تعريف بالراتب" };
/** Statuses where the request counts (balance used, salary deducted). */
export const GRANTED = ["approved", "completed", "closed"];
export const OPEN = ["pending", "in_progress", "needs_info", "reopened", "deferred"];

const DAY = 864e5;
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (n: number) => new Date(n).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
export const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(t(d)) && iso(t(d)) === d;

/** Calendar days from start to end, both included (0 when the range is backwards). */
export const daysBetween = (start: string, end: string) => Math.max(0, Math.round((t(end) - t(start)) / DAY) + 1);
/** Days of [start,end] that fall inside [from,to]. */
export function overlapDays(start: string, end: string, from: string, to: string) {
  const a = Math.max(t(start), t(from)), b = Math.min(t(end), t(to));
  return b < a ? 0 : Math.round((b - a) / DAY) + 1;
}
export const monthStart = (m: string) => `${m}-01`;
export const monthEnd = (m: string) => iso(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0));
export const addMonths = (m: string, n: number) => { const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)); return d.toISOString().slice(0, 7); };

/** Annual entitlement for a calendar year: override, else 21 days (30 once five years are completed), prorated in the hire year. */
export function annualEntitlement(hireDate: string | null, year: number, override: number | null = null) {
  if (override !== null && override !== undefined) return override;
  if (!hireDate || !isDate(hireDate)) return 21;
  const hire = t(hireDate), jan1 = Date.UTC(year, 0, 1), dec31 = Date.UTC(year, 11, 31);
  if (hire > dec31) return 0;
  const five = Date.UTC(new Date(hire).getUTCFullYear() + 5, new Date(hire).getUTCMonth(), new Date(hire).getUTCDate());
  const base = five <= jan1 ? 30 : 21;
  if (hire <= jan1) return base;
  const yearDays = Math.round((dec31 - jan1) / DAY) + 1;
  return Math.round(base * ((dec31 - hire) / DAY + 1) / yearDays);
}

/** Unpaid-leave deduction for one month: salary ÷ 30 × the leave days inside that month. */
export function unpaidDeduction(salary: number, start: string, end: string, month: string) {
  const days = overlapDays(start, end, monthStart(month), monthEnd(month));
  return { days, amount: r2((salary / 30) * days) };
}

/** Monthly advance repayment: equal instalments from the start month, the last one absorbs rounding. */
export function advanceInstallment(amount: number, installments: number, startMonth: string, month: string) {
  const n = Math.max(1, Math.round(installments || 1));
  const k = (Number(month.slice(0, 4)) - Number(startMonth.slice(0, 4))) * 12 + Number(month.slice(5, 7)) - Number(startMonth.slice(5, 7));
  if (k < 0 || k >= n) return 0;
  const each = Math.floor((amount / n) * 100) / 100;
  return k === n - 1 ? r2(amount - each * (n - 1)) : each;
}

export type HrRow = {
  id: string; requester_id: string; requester_name: string; kind: HrKind; hr_type: string | null; status: string;
  start_date: string | null; end_date: string | null; days: number | null; amount: number | null; installments: number | null;
  hr_details: Record<string, unknown>; title: string; body: string; response: string; created_at: string; updated_at: string;
  file_name: string | null; signed_file_name: string | null; salary?: number;
};

const COLS = `r.id, r.requester_id, u.name requester_name, r.kind, r.hr_type, r.status, r.start_date::text start_date, r.end_date::text end_date,
  r.days, r.amount::float8 amount, r.installments, r.hr_details, r.title, r.body, r.response, r.created_at, r.updated_at, r.file_name, r.signed_file_name`;

export async function hrRequests(opts: { userId?: string; since?: string }) {
  const vals: unknown[] = [HR_KINDS];
  let where = "r.kind = ANY($1::text[])";
  if (opts.userId) { vals.push(opts.userId); where += ` AND r.requester_id = $${vals.length}`; }
  if (opts.since) { vals.push(opts.since); where += ` AND (r.status = ANY('{${OPEN.join(",")}}'::text[]) OR r.created_at >= $${vals.length}::date OR r.end_date >= $${vals.length}::date)`; }
  return (await query<HrRow>(`SELECT ${COLS} FROM service_requests r JOIN users u ON u.id = r.requester_id WHERE ${where}
    ORDER BY CASE WHEN r.status = ANY('{${OPEN.join(",")}}'::text[]) THEN 0 ELSE 1 END, r.created_at DESC LIMIT 400`, vals)).rows;
}

export type Balance = { year: number; entitled: number; carryover: number; used: number; pending: number; remaining: number; override: number | null; hire_date: string | null };

/** Annual leave balance for several reps in one year. */
export async function leaveBalances(userIds: string[], year: number): Promise<Record<string, Balance>> {
  if (!userIds.length) return {};
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const [users, leaves] = await Promise.all([
    query<{ id: string; hire_date: string | null; annual_leave_days: number | null; leave_carryover: number }>(
      "SELECT id, hire_date::text hire_date, annual_leave_days, leave_carryover FROM users WHERE id = ANY($1::uuid[])", [userIds]),
    query<{ requester_id: string; status: string; start_date: string; end_date: string }>(
      `SELECT requester_id, status, start_date::text start_date, end_date::text end_date FROM service_requests
       WHERE kind='leave' AND hr_type='annual' AND requester_id = ANY($1::uuid[]) AND start_date <= $3::date AND end_date >= $2::date
         AND status = ANY($4::text[])`, [userIds, from, to, [...GRANTED, ...OPEN]]),
  ]);
  const out: Record<string, Balance> = {};
  for (const u of users.rows) {
    const mine = leaves.rows.filter(l => l.requester_id === u.id);
    const used = mine.filter(l => GRANTED.includes(l.status)).reduce((s, l) => s + overlapDays(l.start_date, l.end_date, from, to), 0);
    const pending = mine.filter(l => OPEN.includes(l.status)).reduce((s, l) => s + overlapDays(l.start_date, l.end_date, from, to), 0);
    const entitled = annualEntitlement(u.hire_date, year, u.annual_leave_days);
    out[u.id] = { year, entitled, carryover: u.leave_carryover || 0, used, pending, remaining: entitled + (u.leave_carryover || 0) - used, override: u.annual_leave_days, hire_date: u.hire_date };
  }
  return out;
}

export type PayLine = { rep_id: string; name: string; salary: number; unpaid_days: number; unpaid: number; advance: number; net: number; items: Array<{ id: string; label: string; amount: number }> };

/** Salary deductions for one month (YYYY-MM): unpaid leave days and advance instalments of granted requests. */
export async function payrollMonth(month: string, repId?: string): Promise<PayLine[]> {
  const vals: unknown[] = [monthStart(month), monthEnd(month), GRANTED];
  const repWhere = repId ? (vals.push(repId), `AND u.id = $${vals.length}`) : "";
  const [reps, reqs] = await Promise.all([
    query<{ id: string; name: string; salary: number }>(`SELECT u.id, u.name, COALESCE(u.salary,0)::float8 salary FROM users u WHERE u.role='sales_rep' AND (u.active OR EXISTS (
      SELECT 1 FROM service_requests r WHERE r.requester_id=u.id AND r.kind IN ('leave','advance') AND r.status = ANY($3::text[]) AND r.start_date <= $2::date AND COALESCE(r.end_date, $1::date) >= $1::date)) ${repWhere} ORDER BY u.name`, vals),
    query<{ id: string; requester_id: string; kind: string; hr_type: string | null; start_date: string; end_date: string | null; amount: number | null; installments: number | null }>(
      `SELECT r.id, r.requester_id, r.kind, r.hr_type, r.start_date::text start_date, r.end_date::text end_date, r.amount::float8 amount, r.installments
       FROM service_requests r WHERE r.status = ANY($3::text[]) AND ((r.kind='leave' AND r.hr_type='unpaid' AND r.start_date <= $2::date AND r.end_date >= $1::date)
         OR (r.kind='advance' AND r.start_date <= $2::date)) ${repId ? `AND r.requester_id = $4` : ""}`, vals),
  ]);
  return reps.rows.map(u => {
    const items: PayLine["items"] = [];
    let unpaidDays = 0, unpaid = 0, advance = 0;
    for (const r of reqs.rows.filter(x => x.requester_id === u.id)) {
      if (r.kind === "leave" && r.end_date) {
        const d = unpaidDeduction(u.salary, r.start_date, r.end_date, month);
        if (d.days) { unpaidDays += d.days; unpaid += d.amount; items.push({ id: r.id, label: `إجازة بدون راتب ${d.days} يوم`, amount: d.amount }); }
      } else if (r.kind === "advance" && r.amount) {
        const a = advanceInstallment(r.amount, r.installments || 1, r.start_date.slice(0, 7), month);
        if (a) { advance += a; items.push({ id: r.id, label: `قسط سلفة ${r.amount.toLocaleString("en-US")} ر.س`, amount: a }); }
      }
    }
    unpaid = r2(unpaid); advance = r2(advance);
    return { rep_id: u.id, name: u.name, salary: u.salary, unpaid_days: unpaidDays, unpaid, advance, net: r2(u.salary - unpaid - advance), items };
  });
}

const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
/** Human title for the request list and notifications. */
export function hrTitle(kind: HrKind, f: { hr_type?: string | null; start_date?: string | null; end_date?: string | null; days?: number | null; amount?: number | null; installments?: number | null; addressee?: string }) {
  if (kind === "leave") return `${LEAVE_TYPES[f.hr_type as keyof typeof LEAVE_TYPES] || "إجازة"} · ${f.days} يوم · ${dm(f.start_date!)} ← ${dm(f.end_date!)}`;
  if (kind === "exit_reentry") return `خروج وعودة (${VISA_TYPES[f.hr_type as keyof typeof VISA_TYPES] || ""}) · سفر ${dm(f.start_date!)}${f.end_date ? ` · عودة ${dm(f.end_date)}` : ""}`;
  if (kind === "advance") return `سلفة ${Number(f.amount).toLocaleString("en-US")} ر.س · ${f.installments} ${f.installments === 1 ? "قسط" : "أقساط"}`;
  return `تعريف بالراتب · ${f.addressee || LETTER_TYPES[f.hr_type as keyof typeof LETTER_TYPES] || ""}`;
}
