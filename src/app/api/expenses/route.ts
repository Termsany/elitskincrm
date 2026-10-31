import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE } from "@/lib/ids";
import { categories, listExpenses, parseExpense, ExpenseError } from "@/lib/expenses";

const DAY = /^20\d\d-\d\d-\d\d$/;
const err = (e: unknown) => e instanceof ExpenseError ? NextResponse.json({ error: e.message }, { status: e.status }) : (console.error("expenses", e), NextResponse.json({ error: "حدث خطأ، حاول مرة ثانية" }, { status: 500 }));

/** Rep: own expenses. Admin: everyone's, with filters. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const repId = user.role === "admin" ? sp.get("repId") || undefined : user.id;
  if (repId && !UUID_RE.test(repId)) return NextResponse.json({ error: "مندوب غير صحيح" }, { status: 400 });
  const from = sp.get("from") || undefined, to = sp.get("to") || undefined;
  if ((from && !DAY.test(from)) || (to && !DAY.test(to))) return NextResponse.json({ error: "تاريخ غير صحيح" }, { status: 400 });
  const categoryId = sp.get("categoryId") || undefined;
  if (categoryId && !UUID_RE.test(categoryId)) return NextResponse.json({ error: "بند غير صحيح" }, { status: 400 });
  try {
    const [items, cats] = await Promise.all([listExpenses({ repId, status: sp.get("status") || undefined, from, to, categoryId }), categories()]);
    return NextResponse.json({ expenses: items, categories: cats });
  } catch (e) { return err(e); }
}

/** Rep submits a new expense (receipts are uploaded right after to /api/expenses/:id/receipts). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "sales_rep") return NextResponse.json({ error: "تسجيل المصروفات للمناديب" }, { status: 403 });
  try {
    const body = await req.json().catch(() => null);
    const x = parseExpense(body, await categories());
    if (x.doctor_id && !(await query("SELECT 1 FROM doctors WHERE id=$1", [x.doctor_id])).rowCount) throw new ExpenseError("الطبيب غير موجود");
    const r = await query(`INSERT INTO expenses(rep_id, category_id, expense_date, amount, vat_amount, merchant, description, doctor_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [user.id, x.category_id, x.expense_date, x.amount, x.vat_amount, x.merchant, x.description, x.doctor_id]);
    const id = r.rows[0].id as string;
    const admins = await query("SELECT id FROM users WHERE role='admin' AND active=true");
    for (const a of admins.rows) await query("INSERT INTO task_notifications(user_id, kind, message, action_url, entity_type, entity_id) VALUES($1,'expense_pending',$2,'/expenses','expense',$3)", [a.id, `${user.name} سجّل مصروف ${x.amount.toLocaleString("en-US")} ريال ويحتاج اعتماد`, id]);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) { return err(e); }
}
