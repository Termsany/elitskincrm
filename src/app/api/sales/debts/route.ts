import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { riyadhToday } from "@/lib/fmt";

export type DebtCustomer = {
  client_id: number;
  name: string;
  clinic_id: string | null;
  clinic_name: string | null;
  unpaid: number;
  overdue: number;
  invoices: Array<{ id: number; no: string; date: string; due: string; unpaid: number; overdue_days: number }>;
};

/** All Daftra customers who bought the rep's products, with their open balance and overdue invoices. */
export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const repId = u.role === "sales_rep" ? u.id : null;
  if (!repId) return NextResponse.json({ error: "للمندوبين فقط" }, { status: 403 });
  const today = riyadhToday();

  const result = await query<{
    client_id: string; name: string; clinic_id: string | null; clinic_name: string | null;
    unpaid: string; overdue: string;
    inv_id: string | null; inv_no: string | null; inv_date: string | null; inv_due: string | null; inv_unpaid: string | null; overdue_days: string | null;
  }>(`
    WITH rep_clients AS (
      SELECT DISTINCT s.client_id
      FROM daftra_sales_v s
      WHERE s.rep_id = $1 AND s.client_id IS NOT NULL
    ),
    bal AS (
      SELECT i.client_id,
        sum(i.unpaid) unpaid,
        sum(i.unpaid) FILTER (WHERE i.invoice_date + COALESCE(i.due_days,0) < $2::date) overdue
      FROM daftra_invoices i
      JOIN rep_clients rc ON rc.client_id = i.client_id
      WHERE i.unpaid > 0 AND i.payment_status IN (0,1)
      GROUP BY i.client_id
    ),
    open_inv AS (
      SELECT i.client_id, i.id inv_id, i.no inv_no, i.invoice_date::text inv_date,
        (i.invoice_date + COALESCE(i.due_days,0))::text inv_due,
        i.unpaid::float8 inv_unpaid,
        GREATEST(0, $2::date - (i.invoice_date + COALESCE(i.due_days,0)))::int overdue_days
      FROM daftra_invoices i
      JOIN rep_clients rc ON rc.client_id = i.client_id
      WHERE i.unpaid > 0 AND i.payment_status IN (0,1)
    )
    SELECT rc.client_id, COALESCE(i.client_name, rc.client_id::text) name,
      l.clinic_id, c.name clinic_name,
      COALESCE(bal.unpaid,0)::float8 unpaid, COALESCE(bal.overdue,0)::float8 overdue,
      oi.inv_id::text, oi.inv_no, oi.inv_date, oi.inv_due, oi.inv_unpaid::text, oi.overdue_days::text
    FROM rep_clients rc
    LEFT JOIN LATERAL (SELECT client_name FROM daftra_invoices WHERE client_id = rc.client_id ORDER BY invoice_date DESC LIMIT 1) i ON true
    LEFT JOIN daftra_client_links l ON l.client_id = rc.client_id
    LEFT JOIN clinics c ON c.id = l.clinic_id
    LEFT JOIN bal ON bal.client_id = rc.client_id
    LEFT JOIN open_inv oi ON oi.client_id = rc.client_id
    WHERE bal.unpaid > 0
    ORDER BY bal.unpaid DESC NULLS LAST, oi.overdue_days DESC NULLS LAST
  `, [repId, today]);

  const map = new Map<number, DebtCustomer>();
  for (const r of result.rows) {
    const cid = Number(r.client_id);
    let c = map.get(cid);
    if (!c) {
      c = { client_id: cid, name: r.name, clinic_id: r.clinic_id, clinic_name: r.clinic_name, unpaid: Math.round(Number(r.unpaid)), overdue: Math.round(Number(r.overdue)), invoices: [] };
      map.set(cid, c);
    }
    if (r.inv_id) {
      const exists = c.invoices.some(x => x.id === Number(r.inv_id));
      if (!exists) {
        c.invoices.push({ id: Number(r.inv_id), no: r.inv_no || "", date: r.inv_date || "", due: r.inv_due || "", unpaid: Math.round(Number(r.inv_unpaid)), overdue_days: Number(r.overdue_days || 0) });
      }
    }
  }

  const customers = [...map.values()].sort((a, b) => b.unpaid - a.unpaid);
  const total = customers.reduce((s, c) => s + c.unpaid, 0);
  const totalOverdue = customers.reduce((s, c) => s + c.overdue, 0);
  return NextResponse.json({ customers, total, totalOverdue });
}
