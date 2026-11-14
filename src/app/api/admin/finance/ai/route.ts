import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { ADVISOR_SYSTEM, advisorContext, prevKpi, prevRange } from "@/lib/fin-ai";
import { AiError, loadAi, streamAnswer, type ChatMsg } from "@/lib/ai-provider";
import { hitRateLimitDb } from "@/lib/rate-limit";
import { financeLink } from "@/lib/fin-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DAY = /^20\d\d-\d\d-\d\d$/;

/** AI financial advisor: answers the admin's question from the period's Daftra numbers, streamed as plain text. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const cfg = await loadAi();
  if (!cfg) return NextResponse.json({ error: "اربط المستشار بالذكاء الاصطناعي الأول من الإعدادات" }, { status: 503 });
  const b = await req.json().catch(() => null) as { from?: string; to?: string; messages?: Array<{ role?: string; content?: string }> } | null;
  const from = b?.from || "", to = b?.to || "";
  if (!DAY.test(from) || !DAY.test(to) || from > to) return NextResponse.json({ error: "فترة غير صحيحة" }, { status: 400 });
  const messages: ChatMsg[] = (b?.messages || []).slice(-20)
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map(m => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 4000) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") return NextResponse.json({ error: "اكتب سؤالك" }, { status: 400 });
  const rl = await hitRateLimitDb(`fin-ai:${user.id}`, 40, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "أسئلة كتير في ساعة واحدة — جرّب بعد شوية" }, { status: 429 });

  const today = riyadhToday();
  const inp = await loadInput(today);
  const fin = computeFinance(inp, from, to);
  const pr = prevRange(fin.period.from, to, fin.books_start);
  const prev = pr ? prevKpi(computeFinance(inp, pr[0], pr[1]), pr[0], pr[1]) : null;
  const data = `أرقام الشركة (JSON):\n${JSON.stringify({ ...advisorContext(fin, prev, today), this_month_link: await financeLink(inp, today).catch(() => null) })}`;

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      try { await streamAnswer(cfg, ADVISOR_SYSTEM, data, messages, t => ctrl.enqueue(enc.encode(t)), req.signal); }
      catch (e) { if (!(e instanceof AiError)) console.error("finance ai", e); ctrl.enqueue(enc.encode(`\n⚠ ${e instanceof AiError ? e.message : "حصل خطأ في المستشار الذكي"}`)); }
      finally { ctrl.close(); }
    },
  });
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
