import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { ADVISOR_SYSTEM, advisorContext, prevKpi, prevRange } from "@/lib/fin-ai";
import { hitRateLimitDb } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DAY = /^20\d\d-\d\d-\d\d$/;
const MODEL = process.env.ANTHROPIC_ADVISOR_MODEL?.trim() || "claude-opus-5-5";

/** AI financial advisor: answers the admin's question from the period's Daftra numbers, streamed as plain text. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return NextResponse.json({ error: "المستشار الذكي مش مفعّل على السيرفر (ANTHROPIC_API_KEY)" }, { status: 503 });
  const b = await req.json().catch(() => null) as { from?: string; to?: string; messages?: Array<{ role?: string; content?: string }> } | null;
  const from = b?.from || "", to = b?.to || "";
  if (!DAY.test(from) || !DAY.test(to) || from > to) return NextResponse.json({ error: "فترة غير صحيحة" }, { status: 400 });
  const messages: Anthropic.MessageParam[] = (b?.messages || []).slice(-20)
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
  const data = JSON.stringify(advisorContext(fin, prev, today));

  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: MODEL, max_tokens: 16000,
    output_config: { effort: "medium" },
    // a declined request is retried on a fallback model inside the same call instead of failing
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    system: [
      { type: "text", text: ADVISOR_SYSTEM },
      { type: "text", text: `أرقام الشركة (JSON):\n${data}`, cache_control: { type: "ephemeral" } },
    ],
    messages,
  }, { signal: req.signal });

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      try {
        stream.on("text", t => ctrl.enqueue(enc.encode(t)));
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") ctrl.enqueue(enc.encode("\nمش قادر أجاوب على السؤال ده. جرّب تصيغه بشكل تاني."));
        else if (final.stop_reason === "max_tokens") ctrl.enqueue(enc.encode("\n(الرد اتقطع عشان طويل — اطلب مني أكمّل)"));
      } catch (e) {
        const msg = e instanceof Anthropic.AuthenticationError ? "مفتاح الذكاء الاصطناعي على السيرفر مش صحيح."
          : e instanceof Anthropic.RateLimitError ? "خدمة الذكاء الاصطناعي مشغولة دلوقتي — جرّب بعد دقيقة."
          : e instanceof Anthropic.APIConnectionError ? "السيرفر مش قادر يوصل لخدمة الذكاء الاصطناعي."
          : e instanceof Anthropic.APIError ? `خدمة الذكاء الاصطناعي رجّعت خطأ (${e.status ?? "?"}).` : "حصل خطأ في المستشار الذكي.";
        if (!(e instanceof Anthropic.APIUserAbortError)) { console.error("finance ai", e); ctrl.enqueue(enc.encode(`\n⚠ ${msg}`)); }
      } finally { ctrl.close(); }
    },
    cancel() { stream.abort(); },
  });
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
