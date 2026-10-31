import { NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { getCurrentUser } from "@/lib/session";
import { query, pool } from "@/lib/db";
import { badId, validIds } from "@/lib/ids";
import { categories, parseExpense, ExpenseError } from "@/lib/expenses";

const err = (e: unknown) => e instanceof ExpenseError ? NextResponse.json({ error: e.message }, { status: e.status }) : (console.error("expense", e), NextResponse.json({ error: "حدث خطأ، حاول مرة ثانية" }, { status: 500 }));

/** The owning rep can edit an expense only while it is still pending. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validIds(await params)) return badId();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const x = parseExpense(await req.json().catch(() => null), await categories());
    const r = await query(`UPDATE expenses SET category_id=$3, expense_date=$4, amount=$5, vat_amount=$6, merchant=$7, description=$8, doctor_id=$9, updated_at=now()
      WHERE id=$1 AND rep_id=$2 AND status='pending' RETURNING id`, [id, user.id, x.category_id, x.expense_date, x.amount, x.vat_amount, x.merchant, x.description, x.doctor_id]);
    if (!r.rowCount) throw new ExpenseError("ما تقدر تعدّل هذا المصروف (اتراجع أو مش لك)", 409);
    return NextResponse.json({ ok: true });
  } catch (e) { return err(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validIds(await params)) return badId();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const client = await pool.connect(); let files: string[] = [];
  try {
    await client.query("BEGIN");
    const e = await client.query("SELECT rep_id, status FROM expenses WHERE id=$1 FOR UPDATE", [id]);
    if (!e.rows[0]) { await client.query("ROLLBACK"); return NextResponse.json({ error: "غير موجود" }, { status: 404 }); }
    if (e.rows[0].rep_id !== user.id || e.rows[0].status !== "pending") { await client.query("ROLLBACK"); return NextResponse.json({ error: "تقدر تحذف مصروفاتك اللي لسه بانتظار الاعتماد بس" }, { status: 409 }); }
    files = (await client.query("SELECT file_path FROM expense_receipts WHERE expense_id=$1", [id])).rows.map((r: { file_path: string }) => r.file_path);
    await client.query("DELETE FROM expenses WHERE id=$1", [id]);
    await client.query("INSERT INTO audit_logs(actor_id, action, entity, entity_id) VALUES($1,'delete','expense',$2)", [user.id, id]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); return err(e); } finally { client.release(); }
  await Promise.all(files.map(f => unlink(f).catch(() => undefined)));
  return NextResponse.json({ ok: true });
}
