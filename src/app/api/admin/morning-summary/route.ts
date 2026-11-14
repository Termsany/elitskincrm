import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { inbox } from "@/lib/admin-dashboard";
import { morningSummary, morningText } from "@/lib/morning-summary";
import { riyadhToday } from "@/lib/visit-intel";
import { sendFinanceBrief } from "@/lib/fin-brief";

const cronOk = (req: Request) => { const s = process.env.CRON_SECRET?.trim(); if (!s) return false; const a = Buffer.from(req.headers.get("authorization") ?? ""), e = Buffer.from(`Bearer ${s}`); return a.length === e.length && timingSafeEqual(a, e); };

/** Daily 8 AM summary for admins as a notification (once per day; ?force=1 by an admin re-sends). */
export async function GET(req: Request) {
  const viaCron = cronOk(req);
  const u = viaCron ? null : await getCurrentUser();
  if (!viaCron && (!u || u.role !== "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const today = riyadhToday();
  const pending = (await inbox()).reduce((s, g) => s + g.count, 0);
  const m = await morningSummary(today, pending);
  const text = morningText(m);
  const force = !!u && new URL(req.url).searchParams.get("force") === "1";
  const admins = (await query<{ id: string }>("SELECT id FROM users WHERE role='admin' AND active")).rows;
  let sent = 0;
  for (const a of admins) {
    const exists = (await query("SELECT 1 FROM task_notifications WHERE user_id=$1 AND kind='morning_summary' AND notification_date=$2::date LIMIT 1", [a.id, today])).rowCount;
    if (exists && !force) continue;
    await query("INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,notification_date) VALUES($1,NULL,'morning_summary',$2,'/admin',$3::date)", [a.id, text, today]);
    sent++;
  }
  // the AI money brief rides on the same daily job (skipped when Daftra or the AI provider isn't connected)
  // runs in the background so the timer's request returns right away (the AI answer can take a minute)
  void sendFinanceBrief(today, force);
  return NextResponse.json({ ok: true, sent, text, summary: m, brief: "started" });
}
