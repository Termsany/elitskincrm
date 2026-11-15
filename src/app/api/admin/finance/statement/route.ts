import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { statement } from "@/lib/fin-books";

/** Account statement for one Daftra customer or supplier (all time): documents, payments and the running balance. */
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin" || u.manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind") === "supplier" ? "supplier" : "client", name = (sp.get("name") || "").trim().slice(0, 300);
  if (!name) return NextResponse.json({ error: "اختار عميل أو مورد" }, { status: 400 });
  const t = kind === "client" ? { table: "daftra_invoices", id: "client_id", name: "client_name" } : { table: "daftra_purchases", id: "supplier_id", name: "supplier_name" };
  const docs = (await query<{ id: string; no: string; date: string; due_days: number; party_id: string | null; status: number; total: number; paid: number; unpaid: number; refund: number }>(
    `SELECT id, no, invoice_date::text date, due_days, ${t.id} party_id, payment_status status, total::float8, paid::float8, unpaid::float8, refund::float8 FROM ${t.table} WHERE ${t.name}=$1 ORDER BY invoice_date, id`, [name])).rows;
  const ids = [...new Set(docs.map(d => d.party_id).filter(Boolean))];
  const pays = kind === "client" && ids.length ? (await query<{ id: string; date: string; amount: number; invoice_id: string | null; method: string }>(
    "SELECT id, pay_date::text date, amount::float8, invoice_id, method FROM daftra_client_payments WHERE client_id = ANY($1::bigint[]) ORDER BY pay_date, id", [ids])).rows : [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  return NextResponse.json({ kind, name, ...statement(kind, docs.map(d => ({ ...d, id: Number(d.id) })), pays.map(p => ({ ...p, id: Number(p.id), invoice_id: p.invoice_id ? Number(p.invoice_id) : null })), today) });
}
