import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { syncIfStale, syncRunning } from "@/lib/daftra";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { cfoAdvice } from "@/lib/fin-cfo";

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
  // CFO layer: audit status + goal tracking go first in the advisor; never let it break the main page
  const cfo = await cfoAdvice(inp, fin, from, to).catch(() => null);
  const rank = { danger: 0, warn: 1, info: 2, good: 3 } as const;
  const advice = cfo ? [...cfo.advice, ...fin.advice].sort((a, b) => rank[a.level] - rank[b.level]) : fin.advice;
  return NextResponse.json({ ...fin, advice, audit: cfo?.audit ?? null, sync: { ...sync.rows[0], running: syncRunning() }, today });
}
