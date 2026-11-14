import { query } from "@/lib/db";
import { repWeek } from "@/lib/plan-week";
import { repScores } from "@/lib/rep-score";
import { addDays } from "@/lib/fmt";
import { weekday } from "@/lib/plan-week-core";

/** Pure: the rep's line for the week that just ended. */
export function repWrapText(w: { done: number; planned: number; aDone: number; aPlanned: number; missed: number }, score: number | null, lift: string | null) {
  const parts = [w.planned ? `نفذت ${w.done} من ${w.planned} زيارة في الخطة` : "ماكانش عندك خطة الأسبوع اللي فات"];
  if (w.aPlanned) parts.push(`A ${w.aDone}/${w.aPlanned}`);
  if (w.missed) parts.push(`${w.missed} فاتت واترحّلت للأسبوع ده`);
  if (score !== null) parts.push(`تقييمك الشهر ده ${score}/100${lift ? ` — ركّز على ${lift}` : ""}`);
  return `📊 أسبوعك: ${parts.join(" · ")}`;
}

/**
 * Sunday morning (with the morning summary): last week's wrap in the bell — each rep their own numbers and score,
 * the admins the team's execution with the strongest and weakest score this month. Once per person per day. Never throws.
 */
export async function sendWeekWrap(today: string, force = false) {
  try {
    if (weekday(today) !== 0 && !force) return { sent: 0 };
    const start = addDays(today, -7), month = today.slice(0, 7);
    const reps = (await query<{ id: string; name: string }>("SELECT id, name FROM users WHERE role='sales_rep' AND active ORDER BY name")).rows;
    if (!reps.length) return { sent: 0 };
    const scores = await repScores(month, today).catch(() => null);
    const { PART_AR } = await import("@/lib/rep-score-core");
    let sent = 0, done = 0, planned = 0;
    const put = async (uid: string, msg: string, url: string) => {
      const has = (await query("SELECT 1 FROM task_notifications WHERE user_id=$1 AND kind='week_wrap' AND notification_date=$2::date LIMIT 1", [uid, today])).rowCount;
      if (has && !force) return;
      await query("INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,notification_date) VALUES($1,NULL,'week_wrap',$2,$3,$4::date)", [uid, msg, url, today]); sent++;
    };
    for (const r of reps) {
      const w = await repWeek(r.id, start, today).catch(() => null); if (!w) continue;
      done += w.kpi.done; planned += w.kpi.planned;
      const s = scores?.rows.find(x => x.rep_id === r.id);
      await put(r.id, repWrapText({ done: w.kpi.done, planned: w.kpi.planned, aDone: w.kpi.aDone, aPlanned: w.kpi.aPlanned, missed: w.kpi.missed }, s?.score ?? null, s?.lift ? PART_AR[s.lift] : null), "/plans?tab=score");
    }
    const ranked = (scores?.rows || []).filter(x => x.score !== null);
    const top = ranked[0], low = ranked.length > 1 ? ranked[ranked.length - 1] : null;
    const msg = [`📊 الأسبوع اللي فات: تنفيذ الفريق ${planned ? Math.round(done / planned * 100) : 0}% (${done}/${planned})`,
      top && `الأعلى تقييمًا: ${top.name} (${top.score})`, low && `محتاج متابعة: ${low.name} (${low.score})${low.lift ? ` — ${PART_AR[low.lift]}` : ""}`].filter(Boolean).join(" · ");
    const admins = (await query<{ id: string }>("SELECT id FROM users WHERE role::text='admin' AND active")).rows;
    for (const a of admins) await put(a.id, msg, "/plans?tab=score");
    return { sent };
  } catch (e) { console.error("week wrap", e); return { sent: 0 }; }
}
