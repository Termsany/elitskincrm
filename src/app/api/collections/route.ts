import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE } from "@/lib/ids";
import { riyadhToday } from "@/lib/finance";
import { collectionsFor, RESULTS } from "@/lib/collections";

/** Overdue Daftra invoices for the rep's own customers (admin: one rep or everyone). Follow-ups live in the CRM only. */
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = new URL(req.url).searchParams.get("repId");
  const rep = u.role === "admin" ? (r && UUID_RE.test(r) ? r : null) : u.id;
  return NextResponse.json(await collectionsFor(rep, riyadhToday()), { headers: { "cache-control": "private, no-store" } });
}
export async function POST(req: Request) {
  const u = await getCurrentUser(); if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null) as { client_id?: unknown; result?: unknown; promise_date?: unknown; amount?: unknown; note?: unknown } | null;
  const cid = Number(b?.client_id), result = String(b?.result || "");
  if (!Number.isSafeInteger(cid) || cid <= 0 || !RESULTS[result]) return NextResponse.json({ error: "اختار نتيجة المتابعة" }, { status: 400 });
  const link = (await query<{ rep_id: string | null }>("SELECT rep_id FROM daftra_client_links WHERE client_id=$1", [cid])).rows[0];
  if (u.role !== "admin" && link?.rep_id !== u.id) return NextResponse.json({ error: "العميل ده مش مربوط بيك" }, { status: 403 });
  const promise = b?.promise_date ? String(b.promise_date) : null;
  if (promise && !/^20\d\d-\d\d-\d\d$/.test(promise)) return NextResponse.json({ error: "تاريخ غير صحيح" }, { status: 400 });
  if (result === "promised" && !promise) return NextResponse.json({ error: "حدد ميعاد الدفع اللي وعد بيه" }, { status: 400 });
  const amount = b?.amount === undefined || b?.amount === null || b?.amount === "" ? null : Number(b.amount);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return NextResponse.json({ error: "المبلغ غير صحيح" }, { status: 400 });
  const rep = u.role === "admin" ? (link?.rep_id || u.id) : u.id;
  await query("INSERT INTO collection_followups(client_id, rep_id, result, promise_date, amount, note) VALUES($1,$2,$3,$4,$5,$6)", [cid, rep, result, promise, amount, String(b?.note || "").slice(0, 500)]);
  return NextResponse.json({ ok: true }, { status: 201 });
}
