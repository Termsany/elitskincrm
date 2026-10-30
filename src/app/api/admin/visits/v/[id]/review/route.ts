import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE } from "@/lib/visit-intel";

/** Manager coaching: a 1–5 rating + comment the rep receives as a notification. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const b = await req.json().catch(() => ({})) as { rating?: number; comment?: string };
  const rating = Math.round(Number(b.rating)); const comment = String(b.comment || "").trim().slice(0, 600);
  if (!UUID_RE.test(id) || !(rating >= 1 && rating <= 5)) return NextResponse.json({ error: "اختار تقييم من 1 لـ 5" }, { status: 400 });
  const v = (await query(`SELECT v.sales_rep_id::text rep, d.name doctor FROM visits v JOIN doctors d ON d.id=v.doctor_id WHERE v.id=$1`, [id])).rows[0];
  if (!v) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const existed = (await query(`SELECT 1 FROM visit_reviews WHERE visit_id=$1`, [id])).rowCount;
  await query(`INSERT INTO visit_reviews(visit_id,reviewer_id,rating,comment) VALUES($1,$2,$3,$4) ON CONFLICT (visit_id) DO UPDATE SET rating=$3, comment=$4, reviewer_id=$2, updated_at=now()`, [id, u.id, rating, comment]);
  await query(`INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,entity_type,entity_id) VALUES($1,NULL,'visit_review',$2,'/visits','visit',$3)`,
    [v.rep, `${"★".repeat(rating)}${"☆".repeat(5 - rating)} ${existed ? "المدير عدّل تقييم" : "المدير قيّم"} زيارتك لـ ${v.doctor}${comment ? `: ${comment.slice(0, 140)}` : ""}`, id]);
  return NextResponse.json({ ok: true });
}
