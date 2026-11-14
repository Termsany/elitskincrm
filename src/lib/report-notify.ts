import { query } from "@/lib/db";
import { hubSummary, type HubFilters } from "@/lib/report-hub";
import { decliningClients } from "@/lib/clinic-account";
import { sendWeekWrap } from "@/lib/plan-wrap";
import { addDays } from "@/lib/fmt";
import { weekday } from "@/lib/plan-week-core";

/**
 * Reports that come to the bell on their own (run with the daily morning job, never throw):
 * - Sunday: last week's report for the admins and sales managers (+ each rep's own wrap)
 * - the 1st: last month's report with a link to the full PDF
 * - any day: an instant alert when sales of the last 7 days fall 30% under the usual week, or a big customer stops ordering
 */
type Summary = Awaited<ReturnType<typeof hubSummary>>;
const sar = (n: number) => `${Math.round(n).toLocaleString("en-US")} ر.س`;
const ch = (a: number, b: number | null) => b ? ` (${a >= b ? "▲" : "▼"} ${Math.abs(Math.round((a - b) / Math.abs(b) * 100))}%)` : "";
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;

/** Pure: the report text from the summary (and the team's plan execution for the week). */
export function reportText(title: string, s: Summary, team?: { done: number; planned: number; top: { name: string; score: number } | null; low: { name: string; score: number; weakest: string | null } | null } | null) {
  const k = new Map(s.kpis.map(x => [x.id, x]));
  const line = (id: string, label?: string) => { const x = k.get(id); if (!x) return null; const v = x.unit === "sar" ? sar(x.value) : x.unit === "pct" ? `${x.value}%` : `${x.value}`; return `• ${label || x.label} ${v}${ch(x.value, x.prev)}`; };
  return [title, line("sales"), line("net"), line("collected"),
    [line("visits"), team?.planned ? `تنفيذ الخطة ${Math.round(team.done / team.planned * 100)}%` : null].filter(Boolean).join(" · "),
    line("a"), team?.top ? `• الأعلى تقييمًا ${team.top.name} (${team.top.score})${team.low ? ` · محتاج متابعة ${team.low.name} (${team.low.score}${team.low.weakest ? ` — ${team.low.weakest}` : ""})` : ""}` : null,
    s.decisions[0] ? `⚡ أهم قرار: ${s.decisions[0].text}` : null].filter(Boolean).join("\n");
}

/** Pure: sales of the last 7 days vs the average of the 4 weeks before; an alert when 30% or more below. */
export function salesDrop(last7: number, prev4: number[]) {
  const avg = prev4.length ? prev4.reduce((s, x) => s + x, 0) / prev4.length : 0;
  return avg > 0 && last7 <= avg * 0.7 ? { avg: Math.round(avg), drop: Math.round((1 - last7 / avg) * 100) } : null;
}

async function people() {
  return (await query<{ id: string; role: string }>("SELECT id, role::text role FROM users WHERE role::text IN ('admin','sales_manager') AND active")).rows;
}
async function put(uid: string, kind: string, msg: string, url: string, day: string, force = false) {
  const has = (await query("SELECT 1 FROM task_notifications WHERE user_id=$1 AND kind=$2 AND notification_date=$3::date LIMIT 1", [uid, kind, day])).rowCount;
  if (has && !force) return 0;
  await query("INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,notification_date) VALUES($1,NULL,$2,$3,$4,$5::date)", [uid, kind, msg, url, day]); return 1;
}
const qs = (f: HubFilters) => `from=${f.from}&to=${f.to}`;

export async function sendReports(today: string, force = false) {
  let sent = 0;
  try {
    const ppl = await people();
    // weekly (Sunday): Sunday–Saturday that just ended
    if (weekday(today) === 0 || force) {
      const wrap = await sendWeekWrap(today, force);
      const f: HubFilters = { from: addDays(today, -7), to: addDays(today, -1), repId: "", city: "" };
      for (const mgr of [false, true]) {
        const who = ppl.filter(p => (p.role === "sales_manager") === mgr); if (!who.length) continue;
        const s = await hubSummary(f, today, mgr);
        const msg = reportText(`📈 تقرير الأسبوع ${dm(f.from)}–${dm(f.to)}`, s, wrap.team);
        for (const p of who) sent += await put(p.id, "report_week", msg, `/admin/reports?${qs(f)}`, today, force);
      }
    }
    // monthly (1st): last month, with the full PDF
    if (Number(today.slice(8, 10)) === 1 || force) {
      const to = addDays(today, -1), f: HubFilters = { from: `${to.slice(0, 7)}-01`, to, repId: "", city: "" };
      for (const mgr of [false, true]) {
        const who = ppl.filter(p => (p.role === "sales_manager") === mgr); if (!who.length) continue;
        const s = await hubSummary(f, today, mgr);
        const msg = reportText(`🗓️ تقرير ${MONTHS[Number(to.slice(5, 7)) - 1]} — التقرير الشامل PDF في الرابط`, s);
        for (const p of who) sent += await put(p.id, "report_month", msg, `/admin/reports/print?view=summary&${qs(f)}`, today, force);
      }
    }
    sent += await instantAlerts(today, ppl);
  } catch (e) { console.error("reports notify", e); }
  return { sent };
}

async function instantAlerts(today: string, ppl: Array<{ id: string; role: string }>) {
  let sent = 0;
  const r = (await query<{ w: number; v: number }>(`SELECT ((($1::date - 1) - invoice_date) / 7)::int w, COALESCE(sum(value),0)::float8 v FROM daftra_sales_v
    WHERE invoice_date BETWEEN $1::date - 35 AND $1::date - 1 GROUP BY 1`, [today]).catch(() => ({ rows: [] }))).rows;
  const wk = (i: number) => r.find(x => x.w === i)?.v || 0;
  const drop = r.length ? salesDrop(wk(0), [1, 2, 3, 4].map(wk)) : null;
  if (drop) {
    // once a week at most
    const recent = (await query("SELECT 1 FROM task_notifications WHERE kind='report_drop' AND notification_date > $1::date - 7 LIMIT 1", [today])).rowCount;
    if (!recent) for (const p of ppl) sent += await put(p.id, "report_drop", `🚨 مبيعات آخر 7 أيام ${sar(wk(0))} — أقل بـ ${drop.drop}% من المعتاد (${sar(drop.avg)} في الأسبوع)`, `/admin/reports?view=sales&from=${addDays(today, -7)}&to=${addDays(today, -1)}`, today);
  }
  const stopped = (await decliningClients(null, today).catch(() => [])).filter(x => x.status === "stopped");
  if (stopped.length) {
    const big = [...stopped].sort((a, b) => b.monthly_avg - a.monthly_avg).filter(x => x.monthly_avg >= 3000).slice(0, 3);
    for (const x of big) {
      const seen = (await query("SELECT 1 FROM task_notifications WHERE kind='report_alert' AND message LIKE $1 AND notification_date > $2::date - 30 LIMIT 1", [`%${x.name}%`, today])).rowCount;
      if (seen) continue;
      const msg = `🚨 ${x.name} بطّل يطلب من ${x.days_since} يوم — كان بيطلب بمتوسط ${sar(x.monthly_avg)} في الشهر${x.rep_name ? ` (${x.rep_name})` : ""}`;
      for (const p of ppl) { await query("INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,notification_date) VALUES($1,NULL,'report_alert',$2,$3,$4::date)",
        [p.id, msg, x.doctor_id ? `/doctors/${x.doctor_id}` : "/admin/reports?view=market", today]); sent++; }
    }
  }
  return sent;
}
