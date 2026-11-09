import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { pool, query } from "@/lib/db";
import { riyadhToday } from "@/lib/riyadh-day";
import { UUID_RE } from "@/lib/fmt";
import { getRules, reviewRows } from "@/lib/visit-review";

export const dynamic = "force-dynamic";
const FIELDS = new Set(["gps", "notes", "products"]);
const FIELD_AR: Record<string, string> = { gps: "الموقع", notes: "الملاحظات", products: "المنتجات" };

/** Flagged visits for the review list. ?status=review|fix|ok|all &days= */
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams; const rules = await getRules();
  const rows = await reviewRows(riyadhToday(), rules, Number(sp.get("days")) || undefined);
  const st = sp.get("status") || "review";
  return NextResponse.json({ rules, counts: { review: rows.filter(r => r.status === "review").length, fix: rows.filter(r => r.status === "fix").length, ok: rows.filter(r => r.status === "ok").length },
    rows: st === "all" ? rows : rows.filter(r => r.status === st) }, { headers: { "cache-control": "private, no-store" } });
}

/** Approve visits, or send them back to the rep with a reason: { ids, action: "approve"|"correction", reason?, fields? } */
export async function POST(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as { ids?: unknown; action?: string; reason?: string; fields?: unknown } | null;
  const ids = Array.isArray(b?.ids) ? [...new Set(b!.ids.map(String))].filter(x => UUID_RE.test(x)).slice(0, 200) : [];
  if (!ids.length) return NextResponse.json({ error: "اختار زيارة واحدة على الأقل" }, { status: 400 });
  const action = b?.action === "correction" ? "correction" : b?.action === "approve" ? "approve" : "";
  if (!action) return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  const reason = String(b?.reason || "").trim().slice(0, 500);
  const fields = Array.isArray(b?.fields) ? [...new Set(b!.fields.map(String))].filter(f => FIELDS.has(f)) : [];
  if (action === "correction" && reason.length < 10) return NextResponse.json({ error: "اكتب السبب في 10 حروف على الأقل", field: "reason" }, { status: 400 });
  if (action === "correction" && !fields.length) return NextResponse.json({ error: "اختار حاجة واحدة على الأقل تتصحح", field: "fields" }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const vs = await client.query<{ id: string; rep: string; doctor: string }>(`SELECT v.id::text id, v.sales_rep_id::text rep, d.name doctor FROM visits v JOIN doctors d ON d.id=v.doctor_id WHERE v.id = ANY($1::uuid[]) FOR UPDATE OF v`, [ids]);
    for (const v of vs.rows) {
      await client.query(`INSERT INTO visit_checks(visit_id, status, reason, fields, checked_by, checked_at, resolved_at) VALUES ($1,$2,$3,$4,$5,now(),NULL)
        ON CONFLICT (visit_id) DO UPDATE SET status=EXCLUDED.status, reason=EXCLUDED.reason, fields=EXCLUDED.fields, checked_by=EXCLUDED.checked_by, checked_at=now(), resolved_at=NULL`, [v.id, action === "approve" ? "approved" : "correction", reason, fields, u.id]);
      await client.query(`INSERT INTO visit_edits(visit_id, user_id, action, detail) VALUES ($1,$2,$3,$4)`, [v.id, u.id, action === "approve" ? "approved" : "correction", action === "approve" ? "" : `${fields.map(f => FIELD_AR[f]).join("، ")}: ${reason}`]);
      if (action === "correction") await client.query(`INSERT INTO task_notifications(user_id, task_id, kind, message, action_url) VALUES ($1, NULL, 'visit_correction', $2, $3)`,
        [v.rep, `مطلوب تصحيح زيارة ${v.doctor} (${fields.map(f => FIELD_AR[f]).join("، ")}): ${reason}`, `/visits?visit=${v.id}`]);
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, done: vs.rows.length });
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); console.error("review", e); return NextResponse.json({ error: "تعذر الحفظ، حاول تاني" }, { status: 500 }); }
  finally { client.release(); }
}

/** Undo a decision made by the same admin in the last 15 minutes: { ids } */
export async function DELETE(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as { ids?: unknown } | null;
  const ids = Array.isArray(b?.ids) ? b!.ids.map(String).filter(x => UUID_RE.test(x)).slice(0, 200) : [];
  const r = await query<{ visit_id: string }>(`DELETE FROM visit_checks WHERE visit_id = ANY($1::uuid[]) AND checked_by=$2 AND checked_at > now() - interval '15 minutes' RETURNING visit_id::text`, [ids, u.id]);
  for (const x of r.rows) await query(`INSERT INTO visit_edits(visit_id, user_id, action) VALUES ($1,$2,'undo')`, [x.visit_id, u.id]);
  await query(`DELETE FROM task_notifications WHERE kind='visit_correction' AND created_at > now() - interval '15 minutes' AND action_url = ANY($1::text[])`, [r.rows.map(x => `/visits?visit=${x.visit_id}`)]).catch(() => {});
  return NextResponse.json({ ok: true, undone: r.rows.length });
}
