import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { riyadhToday } from "@/lib/riyadh-day";
import { AiError, loadAi, streamAnswer, type ChatMsg } from "@/lib/ai-provider";
import { hitRateLimitDb } from "@/lib/rate-limit";
import { repScores } from "@/lib/rep-score";
import { teamWeek } from "@/lib/plan-week";
import { currentWeekStart } from "@/lib/plan-week-core";
import { PLAN_ADVISOR_SYSTEM, planAdvisorContext } from "@/lib/plan-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** AI advisor for the team's plans and rep performance: answers from this month's scores and this week's execution, streamed. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const cfg = await loadAi();
  if (!cfg) return NextResponse.json({ error: "اربط المستشار بالذكاء الاصطناعي الأول" }, { status: 503 });
  const b = await req.json().catch(() => null) as { messages?: Array<{ role?: string; content?: string }> } | null;
  const messages: ChatMsg[] = (b?.messages || []).slice(-20)
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map(m => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 4000) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") return NextResponse.json({ error: "اكتب سؤالك" }, { status: 400 });
  const rl = await hitRateLimitDb(`plan-ai:${user.id}`, 40, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "أسئلة كتير في ساعة واحدة — جرّب بعد شوية" }, { status: 429 });

  const today = riyadhToday();
  const [scores, week] = await Promise.all([repScores(today.slice(0, 7), today), teamWeek(currentWeekStart(today), today)]);
  const data = `أرقام الفريق (JSON):\n${JSON.stringify(planAdvisorContext(scores, week, today))}`;
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      try { await streamAnswer(cfg, PLAN_ADVISOR_SYSTEM, data, messages, t => ctrl.enqueue(enc.encode(t)), req.signal); }
      catch (e) { if (!(e instanceof AiError)) console.error("plan ai", e); ctrl.enqueue(enc.encode(`\n⚠ ${e instanceof AiError ? e.message : "حصل خطأ في المستشار الذكي"}`)); }
      finally { ctrl.close(); }
    },
  });
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
