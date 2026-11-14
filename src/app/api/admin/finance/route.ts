import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { syncIfStale, syncRunning } from "@/lib/daftra";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { prevKpi, prevRange } from "@/lib/fin-ai";
import { aiStatus } from "@/lib/ai-provider";
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
  const [inp, sync] = await Promise.all([loadInput(today), query("SELECT started_at, finished_at, ok, message FROM daftra_sync WHERE id=1")]);
  const fin = computeFinance(inp, from, to);
  // same-length period right before this one, for "better or worse than last time"
  const pr = prevRange(fin.period.from, to, fin.books_start);
  const prev = pr ? prevKpi(computeFinance(inp, pr[0], pr[1]), pr[0], pr[1]) : null;
  const link = await financeLink(inp, today).catch(e => { console.error("finance link", e); return null; });
  return NextResponse.json({ ...fin, prev, link, ai: (await aiStatus()).configured, sync: { ...sync.rows[0], running: syncRunning() }, today });
}
