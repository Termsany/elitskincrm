import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE } from "@/lib/fmt";

export const dynamic = "force-dynamic";
/** One visit for the review drawer: details, attachments and the full history. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params; if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const [v, att, hist, ck] = await Promise.all([
    query(`SELECT v.id, v.notes, v.status::text status, v.visited_at, v.created_at, v.lat, v.lng, v.accuracy_m, v.follow_up_at::text follow_up_at, u.name rep, d.name doctor, COALESCE(d.clinic_name,'') clinic, COALESCE(d.city,'') city,
        COALESCE((SELECT json_agg(json_build_object('name', p.name, 'reaction', vp.reaction)) FROM visit_presented_products vp JOIN products p ON p.id=vp.product_id WHERE vp.visit_id=v.id), '[]'::json) presented
      FROM visits v JOIN users u ON u.id=v.sales_rep_id JOIN doctors d ON d.id=v.doctor_id WHERE v.id=$1`, [id]),
    query(`SELECT id::text id, file_name, mime_type FROM visit_attachments WHERE visit_id=$1 ORDER BY created_at`, [id]),
    query(`SELECT e.action, e.detail, e.at, COALESCE(u.name,'') who FROM visit_edits e LEFT JOIN users u ON u.id=e.user_id WHERE e.visit_id=$1 ORDER BY e.at`, [id]),
    query(`SELECT a.created_at at, COALESCE(u.name,'') who FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.entity='visit' AND a.entity_id::text=$1 AND a.action='update' ORDER BY a.created_at`, [id]).catch(() => ({ rows: [] })),
  ]);
  if (!v.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const row = v.rows[0] as { created_at: string; rep: string };
  const t = (x: unknown) => new Date(x as string).getTime();
  const edits = (hist.rows as Array<{ action: string; at: string }>).filter(h => h.action === "edited").map(h => t(h.at));
  // older edits only exist in the audit log; newer ones are in visit_edits (skip the audit copy of those)
  const audit = (ck.rows as Array<{ at: string; who: string }>).filter(a => !edits.some(e => Math.abs(e - t(a.at)) < 10000)).map(a => ({ action: "edited", detail: "", at: a.at, who: a.who }));
  const history = [{ action: "created", detail: "", at: row.created_at, who: row.rep }, ...audit, ...(hist.rows as Array<{ action: string; detail: string; at: string; who: string }>)].sort((a, b) => t(a.at) - t(b.at));
  return NextResponse.json({ visit: row, attachments: att.rows, history });
}
