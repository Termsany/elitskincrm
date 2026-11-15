import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

/** One search box for the accounts page: customers, suppliers and invoice numbers from the Daftra mirror. */
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin" || u.manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ clients: [], suppliers: [], invoices: [] });
  const like = `%${q.replace(/[%_\\]/g, m => `\\${m}`)}%`;
  const [clients, suppliers, invoices] = await Promise.all([
    query(`SELECT client_name name, count(*)::int n, sum(unpaid) FILTER (WHERE payment_status IN (0,1))::float8 unpaid, max(invoice_date)::text last FROM daftra_invoices WHERE client_name ILIKE $1 GROUP BY client_name ORDER BY sum(total) DESC LIMIT 6`, [like]),
    query(`SELECT supplier_name name, count(*)::int n, sum(unpaid) FILTER (WHERE payment_status IN (0,1))::float8 unpaid, max(invoice_date)::text last FROM daftra_purchases WHERE supplier_name ILIKE $1 GROUP BY supplier_name ORDER BY sum(total) DESC LIMIT 6`, [like]),
    query(`(SELECT 'sale' kind, id, no, invoice_date::text date, client_name party, total::float8 total, unpaid::float8 unpaid FROM daftra_invoices WHERE no ILIKE $1 ORDER BY invoice_date DESC LIMIT 5)
      UNION ALL (SELECT 'purchase' kind, id, no, invoice_date::text date, supplier_name party, total::float8 total, unpaid::float8 unpaid FROM daftra_purchases WHERE no ILIKE $1 ORDER BY invoice_date DESC LIMIT 5)`, [like]),
  ]);
  return NextResponse.json({ clients: clients.rows, suppliers: suppliers.rows, invoices: invoices.rows });
}
