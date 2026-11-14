import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { riyadhToday } from "@/lib/riyadh-day";
import { AiError, loadAi, streamAnswer, type ChatMsg } from "@/lib/ai-provider";
import { hitRateLimitDb } from "@/lib/rate-limit";
import { MONEY_VIEWS, parseHub, reportHub, VIEWS, type View } from "@/lib/report-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM = `إنت مستشار إدارة لشركة توزيع منتجات طبية/تجميل في السعودية، بتشرح التقارير لصاحب الشركة.
- اتكلم بالعامية المصرية وباختصار، بنقط واضحة.
- استخدم الأرقام اللي في البيانات بس، وما تخترعش أرقام. لو حاجة مش موجودة قول كده.
- ابدأ بالأهم: إيه اللي بيحصل، ليه (من الأرقام)، وإيه القرار أو الخطوة الجاية (مين يعمل إيه ولإمتى).
- المبالغ بالريال قبل الضريبة. prev = الفترة اللي قبلها بنفس الطول.`;
const trim = (v: unknown): unknown => Array.isArray(v) ? v.slice(0, 20).map(trim) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x)])) : v;

/** "Explain this report" / free questions, answered from the report's own numbers (streamed). */
export async function POST(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const cfg = await loadAi(); if (!cfg) return NextResponse.json({ error: "اربط المستشار بالذكاء الاصطناعي الأول" }, { status: 503 });
  const b = await req.json().catch(() => null) as { view?: string; from?: string; to?: string; repId?: string; city?: string; messages?: Array<{ role?: string; content?: string }> } | null;
  const view = (VIEWS.includes(b?.view as View) ? b!.view : "summary") as View;
  if (u.manager && MONEY_VIEWS.includes(view)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const messages: ChatMsg[] = (b?.messages || []).slice(-20).filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map(m => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 4000) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") return NextResponse.json({ error: "اكتب سؤالك" }, { status: 400 });
  const rl = await hitRateLimitDb(`report-ai:${u.id}`, 40, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "أسئلة كتير في ساعة واحدة — جرّب بعد شوية" }, { status: 429 });
  const today = riyadhToday();
  const f = parseHub(new URLSearchParams(Object.entries({ from: b?.from || "", to: b?.to || "", repId: b?.repId || "", city: b?.city || "" })), today);
  const views: View[] = view === "summary" ? (u.manager ? ["summary", "reps"] : ["summary", "sales", "reps"]) : [view];
  const data: Record<string, unknown> = { today, filters: f };
  for (const v of views) data[v] = trim(await reportHub(v, f, today, !!u.manager).catch(() => null));
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      try { await streamAnswer(cfg, SYSTEM, `بيانات التقرير (JSON):\n${JSON.stringify(data)}`, messages, t => ctrl.enqueue(enc.encode(t)), req.signal); }
      catch (e) { if (!(e instanceof AiError)) console.error("report ai", e); ctrl.enqueue(enc.encode(`\n⚠ ${e instanceof AiError ? e.message : "حصل خطأ في المستشار الذكي"}`)); }
      finally { ctrl.close(); }
    },
  });
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
