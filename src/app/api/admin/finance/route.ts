import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { syncIfStale, syncRunning } from "@/lib/daftra";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { financeLink } from "@/lib/fin-link";

const DAY = /^20\d\d-\d\d-\d\d$/;

/** Full finance picture for a period (admin only). Data is a read-only mirror of Daftra. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") || "", to = sp.get("to") || "";
  if (!DAY.test(from) || !DAY.test(to) || from > to) return NextResponse.json({ error: "فترة غير صحيحة" }, { status: 400 });
  await syncIfStale(60);
  const today = riyadhToday();
  const [inp, sync] = await Promise.all([loadInput(today), query("SELECT started_at, finished_at, ok, message, invoices FROM daftra_sync WHERE id=1")]);
  const fin = computeFinance(inp, from, to);
  const link = await financeLink(inp, today).catch(e => { console.error("finance link", e); return null; });
  const bs = fin.books_start || "";
  const docs = { total: inp.sales.length, before_start: bs ? inp.sales.filter(s => s.date < bs).length : 0, in_period: inp.sales.filter(s => s.date >= fin.period.from && s.date <= to).length };
  return NextResponse.json({ ...fin, docs, link, sync: { ...sync.rows[0], running: syncRunning() }, today });
}
