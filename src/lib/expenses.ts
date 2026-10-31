import { query, pool } from "@/lib/db";
import { UUID_RE } from "@/lib/ids";

export const VAT_RATE = 0.15;
export const MAX_AGE_DAYS = 60;
export type ExpenseStatus = "pending" | "approved" | "rejected" | "reimbursed";
export const STATUS_LABEL: Record<ExpenseStatus, string> = { pending: "بانتظار الاعتماد", approved: "معتمد", rejected: "مرفوض", reimbursed: "تم الصرف" };

export type Category = { id: string; code: string; name: string; icon: string; monthly_cap: number | null; receipt_required_above: number; allows_doctor: boolean; active: boolean; sort: number };
export type ExpenseRow = {
  id: string; rep_id: string; rep_name: string; category_id: string; category_code: string; category_name: string; category_icon: string;
  expense_date: string; amount: number; vat_amount: number; merchant: string; description: string; doctor_id: string | null; doctor_name: string | null;
  status: ExpenseStatus; review_note: string; reviewer_name: string | null; reviewed_at: string | null; reimbursed_at: string | null; payment_ref: string;
  created_at: string; receipts: Array<{ id: string; file_name: string; mime_type: string }>;
  flags: string[];
};

export class ExpenseError extends Error { constructor(message: string, public status = 400) { super(message); } }

/** Riyadh calendar date (YYYY-MM-DD). */
export function riyadhDate(d = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(d); }
const DAY = /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const validDay = (s: string) => DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const money = (v: unknown) => { const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };

export type ExpenseInput = { category_id: string; expense_date: string; amount: number; vat_amount: number; merchant: string; description: string; doctor_id: string | null };

/** Validates a rep's expense payload against policy. `today` is injectable for tests. */
export function parseExpense(body: unknown, cats: Category[], today = riyadhDate()): ExpenseInput {
  if (!body || typeof body !== "object") throw new ExpenseError("بيانات غير صحيحة");
  const b = body as Record<string, unknown>;
  const cat = cats.find(c => c.id === b.category_id && c.active);
  if (!cat) throw new ExpenseError("اختر بند المصروف");
  const amount = money(b.amount);
  if (!(amount > 0) || amount > 100000) throw new ExpenseError("المبلغ لازم يكون أكبر من صفر وأقل من 100,000");
  const date = String(b.expense_date ?? "");
  if (!validDay(date)) throw new ExpenseError("تاريخ غير صحيح");
  if (date > today) throw new ExpenseError("ما ينفع تسجل مصروف بتاريخ في المستقبل");
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 864e5;
  if (age > MAX_AGE_DAYS) throw new ExpenseError(`المصروفات الأقدم من ${MAX_AGE_DAYS} يوم ما تُقبل`);
  const taxInvoice = b.tax_invoice === true || b.tax_invoice === "true";
  const vat = taxInvoice ? Math.round((amount * VAT_RATE / (1 + VAT_RATE)) * 100) / 100 : 0;
  const merchant = String(b.merchant ?? "").trim().slice(0, 120);
  const description = String(b.description ?? "").trim().slice(0, 500);
  if (description.length < 3) throw new ExpenseError("اكتب وصف بسيط للمصروف");
  let doctor: string | null = null;
  if (b.doctor_id) {
    if (!cat.allows_doctor) throw new ExpenseError("هذا البند ما يرتبط بطبيب");
    if (typeof b.doctor_id !== "string" || !UUID_RE.test(b.doctor_id)) throw new ExpenseError("طبيب غير صحيح");
    doctor = b.doctor_id;
  }
  return { category_id: cat.id, expense_date: date, amount, vat_amount: vat, merchant, description, doctor_id: doctor };
}

export async function categories(all = false): Promise<Category[]> {
  const r = await query(`SELECT id, code, name, icon, monthly_cap::float8 monthly_cap, receipt_required_above::float8 receipt_required_above, allows_doctor, active, sort FROM expense_categories ${all ? "" : "WHERE active"} ORDER BY sort, name`);
  return r.rows as Category[];
}

type ListFilter = { repId?: string; status?: string; from?: string; to?: string; categoryId?: string; limit?: number };
export async function listExpenses(f: ListFilter): Promise<ExpenseRow[]> {
  const where: string[] = []; const vals: unknown[] = [];
  const add = (sql: string, v: unknown) => { vals.push(v); where.push(sql.replace("?", `$${vals.length}`)); };
  if (f.repId) add("e.rep_id=?", f.repId);
  if (f.status && f.status !== "all") add("e.status=?", f.status);
  if (f.from) add("e.expense_date>=?::date", f.from);
  if (f.to) add("e.expense_date<=?::date", f.to);
  if (f.categoryId) add("e.category_id=?", f.categoryId);
  vals.push(Math.min(Math.max(f.limit ?? 300, 1), 2000));
  const r = await query(`
    SELECT e.id, e.rep_id, u.name rep_name, e.category_id, c.code category_code, c.name category_name, c.icon category_icon,
           e.expense_date::text expense_date, e.amount::float8 amount, e.vat_amount::float8 vat_amount, e.merchant, e.description,
           e.doctor_id, d.name doctor_name, e.status, e.review_note, rv.name reviewer_name, e.reviewed_at, e.reimbursed_at, e.payment_ref, e.created_at,
           COALESCE((SELECT json_agg(json_build_object('id', r.id, 'file_name', r.file_name, 'mime_type', r.mime_type) ORDER BY r.created_at) FROM expense_receipts r WHERE r.expense_id=e.id), '[]') receipts,
           c.receipt_required_above::float8 receipt_required_above, c.monthly_cap::float8 monthly_cap,
           (SELECT COALESCE(sum(x.amount),0)::float8 FROM expenses x WHERE x.rep_id=e.rep_id AND x.category_id=e.category_id AND x.status<>'rejected'
              AND date_trunc('month', x.expense_date)=date_trunc('month', e.expense_date)) month_used,
           EXISTS(SELECT 1 FROM expenses x WHERE x.id<>e.id AND x.rep_id=e.rep_id AND x.amount=e.amount AND x.expense_date=e.expense_date AND x.status<>'rejected') dup
    FROM expenses e JOIN users u ON u.id=e.rep_id JOIN expense_categories c ON c.id=e.category_id
    LEFT JOIN doctors d ON d.id=e.doctor_id LEFT JOIN users rv ON rv.id=e.reviewer_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY e.expense_date DESC, e.created_at DESC LIMIT $${vals.length}`, vals);
  return (r.rows as Array<ExpenseRow & { receipt_required_above: number; monthly_cap: number | null; month_used: number; dup: boolean }>).map(x => {
    const flags: string[] = [];
    if (!x.receipts.length && x.amount > x.receipt_required_above) flags.push("بدون إيصال");
    if (x.monthly_cap !== null && x.month_used > x.monthly_cap) flags.push(`تعدّى سقف البند (${Math.round(x.month_used)} / ${Math.round(x.monthly_cap)})`);
    if (x.dup) flags.push("مكرر محتمل");
    const { receipt_required_above: _a, monthly_cap: _b, month_used: _c, dup: _d, ...row } = x; void _a; void _b; void _c; void _d;
    return { ...row, flags };
  });
}

/** Admin decision on many expenses at once, atomically. */
export async function review(actor: string, ids: string[], action: "approve" | "reject" | "reimburse", note: string, paymentRef: string) {
  if (!ids.length || ids.length > 200 || ids.some(i => !UUID_RE.test(i))) throw new ExpenseError("اختيار غير صحيح");
  if (action === "reject" && note.trim().length < 3) throw new ExpenseError("اكتب سبب الرفض");
  const from = action === "reimburse" ? "approved" : "pending";
  const to = action === "approve" ? "approved" : action === "reject" ? "rejected" : "reimbursed";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rows = await client.query("SELECT id, rep_id, status, amount::float8 amount FROM expenses WHERE id = ANY($1::uuid[]) FOR UPDATE", [ids]);
    if (rows.rowCount !== ids.length) throw new ExpenseError("بعض المصروفات غير موجودة", 404);
    const wrong = rows.rows.filter((r: { status: string }) => r.status !== from);
    if (wrong.length) throw new ExpenseError(action === "reimburse" ? "الصرف للمصروفات المعتمدة فقط" : "بعض المصروفات تمت مراجعتها بالفعل", 409);
    if (action === "reimburse") await client.query("UPDATE expenses SET status='reimbursed', reimbursed_by=$2, reimbursed_at=now(), payment_ref=$3, updated_at=now() WHERE id = ANY($1::uuid[])", [ids, actor, paymentRef.slice(0, 120)]);
    else await client.query("UPDATE expenses SET status=$2, reviewer_id=$3, reviewed_at=now(), review_note=$4, updated_at=now() WHERE id = ANY($1::uuid[])", [ids, to, actor, note.slice(0, 500)]);
    // one notification per rep summarising the decision
    const byRep = new Map<string, { n: number; sum: number }>();
    for (const r of rows.rows as Array<{ rep_id: string; amount: number }>) { const x = byRep.get(r.rep_id) || { n: 0, sum: 0 }; x.n++; x.sum += r.amount; byRep.set(r.rep_id, x); }
    const verb = to === "approved" ? "تم اعتماد" : to === "rejected" ? "تم رفض" : "تم صرف";
    for (const [rep, x] of byRep) await client.query("INSERT INTO task_notifications(user_id, kind, message, action_url, entity_type) VALUES($1,$2,$3,'/expenses','expense')",
      [rep, `expense_${to}`, `${verb} ${x.n} مصروف بقيمة ${x.sum.toLocaleString("en-US")} ريال${to === "rejected" && note ? `: ${note}` : ""}`]);
    await client.query("INSERT INTO audit_logs(actor_id, action, entity, entity_id, details) VALUES($1,$2,'expense',$3,$4)", [actor, action, ids[0], JSON.stringify({ ids, note, paymentRef }).slice(0, 2000)]);
    await client.query("COMMIT");
    return { updated: ids.length };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}

export type PnlRow = { rep_id: string; rep_name: string; month: number; revenue: number; expenses: number; pending: number; visits: number };
/** Per-rep, per-month revenue (approved signed sales) vs approved/reimbursed expenses for a calendar year. */
export async function pnl(year: number, repId?: string) {
  const vals: unknown[] = [`${year}-01-01`, `${year + 1}-01-01`]; let repCond = "";
  if (repId) { vals.push(repId); repCond = "AND u.id=$3"; }
  const r = await query(`
    WITH m AS (SELECT generate_series(1,12) AS month),
    reps AS (SELECT u.id, u.name FROM users u WHERE u.role='sales_rep' ${repCond}),
    rev AS (SELECT fs.rep_id, extract(month FROM fs.month)::int AS month, sum((CASE WHEN fs.kind='return' THEN -1 ELSE fs.direction END) * fs.quantity * fs.unit_price)::float8 v
            FROM forecast_sales fs WHERE fs.status='approved' AND fs.month >= $1::date AND fs.month < $2::date GROUP BY 1,2),
    exp AS (SELECT e.rep_id, extract(month FROM e.expense_date)::int AS month,
              sum(e.amount) FILTER (WHERE e.status IN ('approved','reimbursed'))::float8 v, sum(e.amount) FILTER (WHERE e.status='pending')::float8 p
            FROM expenses e WHERE e.expense_date >= $1::date AND e.expense_date < $2::date GROUP BY 1,2),
    vis AS (SELECT v.sales_rep_id rep_id, extract(month FROM (v.visited_at AT TIME ZONE 'Asia/Riyadh'))::int AS month, count(*)::int n
            FROM visits v WHERE v.status='completed' AND v.visited_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Riyadh') AND v.visited_at < ($2::date::timestamp AT TIME ZONE 'Asia/Riyadh') GROUP BY 1,2)
    SELECT reps.id rep_id, reps.name rep_name, m.month, COALESCE(rev.v,0) revenue, COALESCE(exp.v,0) expenses, COALESCE(exp.p,0) pending, COALESCE(vis.n,0) visits
    FROM reps CROSS JOIN m LEFT JOIN rev ON rev.rep_id=reps.id AND rev.month=m.month LEFT JOIN exp ON exp.rep_id=reps.id AND exp.month=m.month
    LEFT JOIN vis ON vis.rep_id=reps.id AND vis.month=m.month ORDER BY reps.name, m.month`, vals);
  const cats = await query(`SELECT c.name, c.code, sum(e.amount)::float8 v FROM expenses e JOIN expense_categories c ON c.id=e.category_id
    WHERE e.status IN ('approved','reimbursed') AND e.expense_date >= $1::date AND e.expense_date < $2::date ${repId ? "AND e.rep_id=$3" : ""} GROUP BY 1,2 ORDER BY 3 DESC`, vals);
  const docs = await query(`SELECT d.name, sum(e.amount)::float8 v, count(*)::int n FROM expenses e JOIN doctors d ON d.id=e.doctor_id
    WHERE e.status IN ('approved','reimbursed') AND e.expense_date >= $1::date AND e.expense_date < $2::date ${repId ? "AND e.rep_id=$3" : ""} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, vals);
  return { year, rows: r.rows as PnlRow[], byCategory: cats.rows as Array<{ name: string; code: string; v: number }>, byDoctor: docs.rows as Array<{ name: string; v: number; n: number }> };
}
