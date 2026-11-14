import { query } from "@/lib/db";
import { daftraConfigured } from "@/lib/daftra";
import { computeFinance, loadInput, type Input } from "@/lib/finance";
import { cleanPlan, computePlan, type CatalogRow, type PlanData } from "@/lib/plan";
import { repShares, syncPlan } from "@/lib/plan-link";
import { ADVISOR_SYSTEM } from "@/lib/fin-ai";
import { loadAi, streamAnswer } from "@/lib/ai-provider";

const k = (n: number) => Math.round(n).toLocaleString("en-US");
const lastDay = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const shift = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const mName = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1];

/** The saved plan for a month with Daftra's actual sales up to `to` filled in (null when no plan is saved). */
async function planWithActuals(inp: Input, month: string, to: string) {
  const saved = (await query<{ data: unknown }>("SELECT data FROM fin_plans WHERE month=$1", [month])).rows[0];
  if (!saved) return null;
  const M = computeFinance(inp, `${month}-01`, to);
  const catalog: CatalogRow[] = M.pricing.map(p => ({ key: p.key, name: p.name, avg_cost: p.avg_cost, last_cost: p.last_cost, price: p.realized_price, list_price: p.list_price, hist_qty: 0, stock: p.stock, d_qty: p.qty_sold, d_price: p.realized_price }));
  const plan = syncPlan(cleanPlan(saved.data) as PlanData, catalog, [], month, month);
  return computePlan(plan, catalog);
}

async function notify(userIds: string[], kind: string, msg: string, url: string, day: string) {
  for (const id of userIds) {
    const done = (await query("SELECT 1 FROM task_notifications WHERE user_id=$1 AND kind=$2 AND notification_date=$3::date LIMIT 1", [id, kind, day])).rowCount;
    if (!done) await query("INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,notification_date) VALUES($1,NULL,$2,$3,$4,$5::date)", [id, kind, msg, url, day]);
  }
}

/**
 * Daily check, run with the morning summary:
 * - on the 10th and 20th: if this month's sales are behind the plan's pace, tell the admins which items and reps are short, and tell each behind rep their numbers
 * - on the 1st: plan vs actual for the month that just ended, with three AI lessons when an AI provider is connected
 * Never throws.
 */
export async function sendPlanWatch(today: string, force = false) {
  const out: string[] = [];
  try {
    if (!daftraConfigured()) return ["daftra"];
    const day = Number(today.slice(8, 10)), month = today.slice(0, 7);
    const admins = (await query<{ id: string }>("SELECT id FROM users WHERE role='admin' AND active")).rows.map(r => r.id);
    if (!admins.length) return ["no admins"];
    const inp = await loadInput(today);

    if (force || day === 10 || day === 20) {
      const res = await planWithActuals(inp, month, today);
      if (res && res.t.plan_revenue > 0) {
        const days = Number(lastDay(month).slice(8, 10)), pace = day / days;
        const expected = res.t.plan_revenue * pace, actual = res.t.actual_revenue;
        if (actual < expected * 0.9) {
          const short = res.rows.filter(r => r.include && r.plan_qty > 0).map(r => ({ name: r.name, gap: (r.plan_qty * pace - (r.actual_qty ?? 0)) * r.price }))
            .filter(r => r.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 3);
          const reps = (await repShares(month, res.rows).catch(() => [])).filter(r => r.rep_id && r.target > 0 && r.actual < r.target * pace * 0.9);
          await notify(admins, "plan_behind", `⚠ خطة ${mName(month)}: اتباع ${k(actual)} من ${k(res.t.plan_revenue)} (${Math.round(actual / res.t.plan_revenue * 100)}%) والمفروض ${Math.round(pace * 100)}% النهارده — ناقص ${k(expected - actual)}.`
            + (short.length ? `\nأكتر أصناف متأخرة: ${short.map(s => `${s.name} (−${k(s.gap)})`).join("، ")}` : "")
            + (reps.length ? `\nمناديب متأخرين: ${reps.map(r => `${r.rep_name} ${Math.round(r.actual / r.target * 100)}%`).join("، ")}` : ""), "/sales?tab=plan", today);
          for (const r of reps)
            await notify([r.rep_id!], "plan_behind", `خطة ${mName(month)}: بعت ${k(r.actual)} من نصيبك ${k(r.target)} ر.س (${Math.round(r.actual / r.target * 100)}%) والمفروض ${Math.round(pace * 100)}% النهارده.\nركّز على: ${r.items.slice(0, 3).map(i => i.item).join("، ")}`, "/", today);
          out.push("behind");
        } else out.push("on pace");
      }
    }

    if (force || day === 1) {
      const prev = shift(month, -1);
      const res = await planWithActuals(inp, prev, lastDay(prev));
      if (res && res.t.plan_revenue > 0) {
        const t = res.t;
        const rows = res.rows.filter(r => r.include && r.plan_qty > 0).map(r => ({ name: r.name, plan: r.plan_revenue, actual: r.actual_revenue ?? 0 }));
        const worst = [...rows].sort((a, b) => (a.actual - a.plan) - (b.actual - b.plan)).slice(0, 3).filter(r => r.actual < r.plan);
        const best = [...rows].sort((a, b) => (b.actual - b.plan) - (a.actual - a.plan)).slice(0, 2).filter(r => r.actual > r.plan);
        let msg = `📋 مراجعة خطة ${mName(prev)}: المبيعات ${k(t.actual_revenue)} من ${k(t.plan_revenue)} (${Math.round(t.actual_revenue / t.plan_revenue * 100)}%) · الربح ${k(t.actual_profit)} من ${k(t.plan_profit)}.`
          + (worst.length ? `\nأكبر نقص: ${worst.map(r => `${r.name} (−${k(r.plan - r.actual)})`).join("، ")}` : "")
          + (best.length ? `\nفوق الخطة: ${best.map(r => `${r.name} (+${k(r.actual - r.plan)})`).join("، ")}` : "");
        const cfg = await loadAi().catch(() => null);
        if (cfg) {
          let lessons = ""; const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 90_000);
          try {
            await streamAnswer(cfg, ADVISOR_SYSTEM, `مراجعة خطة الشهر اللي فات (JSON):\n${JSON.stringify({ month: prev, totals: t, items: rows })}`,
              [{ role: "user", content: "اكتب 3 دروس قصيرة للشهر الجاي من مقارنة الخطة بالفعلي، كل درس في سطر بيبدأ بـ «- » ومحدد (أنهي صنف، كام، إيه اللي يتغير). من غير مقدمة." }], x => { lessons += x; }, ctl.signal);
          } catch { lessons = ""; } finally { clearTimeout(timer); }
          if (lessons.trim().length > 20) msg += `\n\nدروس للشهر الجاي:\n${lessons.trim().slice(0, 700)}`;
        }
        await notify(admins, "plan_review", msg, "/sales?tab=plan", today);
        out.push("review");
      }
    }
  } catch (e) { console.error("plan watch", e); out.push("error"); }
  return out;
}
