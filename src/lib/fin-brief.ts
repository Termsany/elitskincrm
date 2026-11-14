import { query } from "@/lib/db";
import { daftraConfigured } from "@/lib/daftra";
import { computeFinance, loadInput } from "@/lib/finance";
import { ADVISOR_SYSTEM, advisorContext, prevKpi, prevRange } from "@/lib/fin-ai";
import { financeLink } from "@/lib/fin-link";
import { loadAi, streamAnswer } from "@/lib/ai-provider";

const BRIEF_Q = `اكتب ملخص الصبح لصاحب الشركة عن الشهر الحالي (this_month_link)، في 4 سطور بالظبط من غير مقدمة:
- سطر 1: المبيعات لحد النهارده وهتقفل على كام، وده قد إيه من هدف الشهر ومن الخطة.
- سطر 2: التحصيل: المتأخر عند العملاء، وأهم عميل يتكلم النهارده ومبلغه.
- سطر 3 و4: أهم حاجتين يعملهم النهارده، كل واحدة محددة (مين/أنهي منتج/كام).
لو الأهداف أو الخطة مش موجودين، خلي واحد من الحاجتين إنه يعملهم.`;

/**
 * Daily AI money brief for admins, sent with the morning summary: one AI call, one notification per admin per day.
 * Skipped quietly when Daftra or the AI provider isn't connected. Never throws.
 */
export async function sendFinanceBrief(today: string, force = false): Promise<{ sent: number; skipped?: string }> {
  try {
    if (!daftraConfigured()) return { sent: 0, skipped: "daftra" };
    const cfg = await loadAi(); if (!cfg) return { sent: 0, skipped: "ai" };
    const admins = (await query<{ id: string }>(`SELECT u.id FROM users u WHERE u.role='admin' AND u.active
      ${force ? "" : "AND NOT EXISTS (SELECT 1 FROM task_notifications n WHERE n.user_id=u.id AND n.kind='finance_brief' AND n.notification_date=$1::date)"}`, force ? [] : [today])).rows;
    if (!admins.length) return { sent: 0, skipped: "done" };
    const inp = await loadInput(today);
    const from = `${today.slice(0, 7)}-01`;
    const fin = computeFinance(inp, from, today);
    const pr = prevRange(fin.period.from, today, fin.books_start);
    const prev = pr ? prevKpi(computeFinance(inp, pr[0], pr[1]), pr[0], pr[1]) : null;
    const data = `أرقام الشركة (JSON):\n${JSON.stringify({ ...advisorContext(fin, prev, today), this_month_link: await financeLink(inp, today) })}`;
    let text = "";
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 90_000);
    try { await streamAnswer(cfg, ADVISOR_SYSTEM, data, [{ role: "user", content: BRIEF_Q }], t => { text += t; }, ctl.signal); } finally { clearTimeout(timer); }
    text = text.trim();
    if (text.length < 20) return { sent: 0, skipped: "empty" };
    const msg = `💡 ملخص المستشار المالي:\n${text.slice(0, 1200)}`;
    for (const a of admins)
      await query("INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,notification_date) VALUES($1,NULL,'finance_brief',$2,'/sales',$3::date)", [a.id, msg, today]);
    return { sent: admins.length };
  } catch (e) { console.error("finance brief", e); return { sent: 0, skipped: "error" }; }
}
