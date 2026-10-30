import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { periodRange } from "@/lib/visit-intel";
import { reportData, buildWorkbook, saveReportToLibrary } from "@/lib/visit-report";

const cronOk = (req: Request) => { const s = process.env.CRON_SECRET?.trim(); if (!s) return false; const a = Buffer.from(req.headers.get("authorization") ?? ""), e = Buffer.from(`Bearer ${s}`); return a.length === e.length && timingSafeEqual(a, e); };

/** Weekly team report (Sun → today), saved to the library and announced to admins. Idempotent per week. */
export async function GET(req: Request) {
  const viaCron = cronOk(req);
  const u = viaCron ? null : await getCurrentUser();
  if (!viaCron && (!u || u.role !== "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const force = new URL(req.url).searchParams.get("force") === "1" && !!u;
  const { from, to } = periodRange("week");
  const key = `weekly:${from}`;
  const exists = (await query(`SELECT id FROM library_files WHERE source_kind='visit_report' AND source_id=$1 AND deleted_at IS NULL LIMIT 1`, [key])).rows[0];
  if (exists && !force) return NextResponse.json({ ok: true, id: exists.id, skipped: true });
  const owner = u?.id || (await query(`SELECT id FROM users WHERE role='admin' AND active ORDER BY created_at LIMIT 1`)).rows[0]?.id;
  if (!owner) return NextResponse.json({ error: "no admin" }, { status: 500 });
  const d = await reportData(from, to);
  const id = await saveReportToLibrary(owner, await buildWorkbook(d), `التقرير الأسبوعي للزيارات ${from} إلى ${to}.xlsx`, key);
  const admins = (await query(`SELECT id FROM users WHERE role='admin' AND active`)).rows as Array<{ id: string }>;
  const k = d.kpi;
  for (const a of admins) await query(`INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,entity_type,entity_id) VALUES($1,NULL,'visit_weekly_report',$2,$3,'library_file',$4)`,
    [a.id, `📊 التقرير الأسبوعي جاهز: ${k.visits} زيارة · جودة ${k.avgQuality}/100 · ${k.redFlags} تنبيه`, `/library?file=${id}`, id]);
  return NextResponse.json({ ok: true, id });
}
