import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { brokenPromises, reorderDue, salesPace } from "@/lib/smart";
import { backfillInsights } from "@/lib/visit-insights";
import { riyadhToday } from "@/lib/visit-intel";

const cronOk = (req: Request) => { const s = process.env.CRON_SECRET?.trim(); if (!s) return false; const a = Buffer.from(req.headers.get("authorization") ?? ""), e = Buffer.from(`Bearer ${s}`); return a.length === e.length && timingSafeEqual(a, e); };
const k = (n: number) => Math.round(n).toLocaleString("en-US");

/** Daily (07:55 Riyadh): analyse new visit notes, and tell each rep about due reorders, broken payment promises and a slow month pace. Once per rep per day. */
export async function GET(req: Request) {
  const viaCron = cronOk(req); const u = viaCron ? null : await getCurrentUser();
  if (!viaCron && (!u || u.role !== "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const today = riyadhToday(), wd = new Date(`${today}T12:00:00Z`).getUTCDay();
  const analysed = await backfillInsights(1000);
  if (wd === 5 || wd === 6) return NextResponse.json({ ok: true, analysed, sent: 0, weekend: true });
  const reps = (await query<{ id: string }>("SELECT id FROM users WHERE role='sales_rep' AND active")).rows;
  const pace = await salesPace(today);
  let sent = 0;
  for (const r of reps) {
    const done = (await query("SELECT 1 FROM task_notifications WHERE user_id=$1 AND kind='smart_daily' AND notification_date=$2::date LIMIT 1", [r.id, today])).rowCount;
    if (done) continue;
    const hidden = new Set((await query<{ kind: string; ref: string }>("SELECT kind, ref FROM smart_dismissals WHERE user_id=$1 AND until >= $2::date", [r.id, today])).rows.map(x => `${x.kind}:${x.ref}`));
    const [due0, prom0] = await Promise.all([reorderDue(today, { repId: r.id, ahead: 5 }), brokenPromises(today, r.id)]);
    const due = due0.filter(x => !hidden.has(`reorder:${x.clinic_id}`)), prom = prom0.filter(x => !hidden.has(`promise:${x.client_id}`));
    const p = pace.find(x => x.rep_id === r.id);
    const parts = [
      due.length ? `${due.length} عيادة قرّب ميعاد طلبها (${due.slice(0, 2).map(d => d.clinic_name).join("، ")})` : null,
      prom.length ? `${prom.length} وعد سداد عدّى ميعاده` : null,
      p?.behind ? `على السرعة دي هتقفل الشهر على ${k(p.projected)} من ${k(p.target)} (${p.pct}%)` : null,
    ].filter(Boolean);
    if (!parts.length) continue;
    await query("INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,notification_date) VALUES($1,NULL,'smart_daily',$2,'/',$3::date)", [r.id, `💡 النهارده: ${parts.join(" · ")}`, today]);
    sent++;
  }
  return NextResponse.json({ ok: true, analysed, sent });
}
