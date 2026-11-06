import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { auditWithReviews } from "@/lib/fin-cfo";

const DAY = /^20\d\d-\d\d-\d\d$/;
const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const sp = new URL(req.url).searchParams; const from = sp.get("from") || "", to = sp.get("to") || "";
  if (!DAY.test(from) || !DAY.test(to) || from > to) return NextResponse.json({ error: "فترة غير صحيحة" }, { status: 400 });
  const inp = await loadInput(riyadhToday());
  return NextResponse.json(await auditWithReviews(inp, computeFinance(inp, from, to), from, to));
}

/** Mark a finding reviewed / fixed / ignored (CRM only). */
export async function POST(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const b = await req.json().catch(() => null) as { key?: unknown; status?: unknown; note?: unknown } | null;
  const key = String(b?.key || "").slice(0, 300), status = String(b?.status || ""), note = String(b?.note || "").trim().slice(0, 500);
  if (!key || !["ok", "fixed", "ignored"].includes(status)) return NextResponse.json({ error: "طلب غير صحيح" }, { status: 400 });
  if (status === "ignored" && note.length < 3) return NextResponse.json({ error: "اكتب سبب التجاهل في الملاحظة" }, { status: 400 });
  await query(`INSERT INTO fin_audit_reviews(key, status, note, reviewed_by) VALUES($1,$2,$3,$4)
    ON CONFLICT (key) DO UPDATE SET status=EXCLUDED.status, note=EXCLUDED.note, reviewed_by=EXCLUDED.reviewed_by, reviewed_at=now()`, [key, status, note, u.id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const key = new URL(req.url).searchParams.get("key") || "";
  if (!key) return NextResponse.json({ error: "طلب غير صحيح" }, { status: 400 });
  await query("DELETE FROM fin_audit_reviews WHERE key=$1", [key]);
  return NextResponse.json({ ok: true });
}
