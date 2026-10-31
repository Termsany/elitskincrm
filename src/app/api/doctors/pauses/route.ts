import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE } from "@/lib/ids";
import { allowedMonth, riyadhMonthStart } from "@/lib/doctor-pauses";

/** Doctors a rep marked "inactive" for a month (excluded from that rep's coverage). */
const MONTH = /^20\d\d-(0[1-9]|1[0-2])-01$/;
async function resolve(req: Request, body?: { repId?: unknown; month?: unknown }) {
  const u = await getCurrentUser(); if (!u) return { err: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const sp = new URL(req.url).searchParams;
  const month = String(body?.month ?? sp.get("month") ?? riyadhMonthStart());
  if (!MONTH.test(month)) return { err: NextResponse.json({ error: "شهر غير صحيح" }, { status: 400 }) };
  let rep = u.id;
  if (u.role === "admin") {
    const r = String(body?.repId ?? sp.get("repId") ?? "");
    if (!UUID_RE.test(r)) return { err: NextResponse.json({ error: "اختار المندوب الأول" }, { status: 400 }) };
    const ok = await query("SELECT 1 FROM users WHERE id=$1 AND role='sales_rep'", [r]);
    if (!ok.rows[0]) return { err: NextResponse.json({ error: "المندوب غير موجود" }, { status: 400 }) };
    rep = r;
  } else if (u.role !== "sales_rep") return { err: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { u, rep, month };
}

export async function GET(req: Request) {
  const x = await resolve(req); if ("err" in x) return x.err;
  const r = await query("SELECT doctor_id, reason, created_at FROM doctor_month_pauses WHERE rep_id=$1 AND month=$2", [x.rep, x.month]);
  return NextResponse.json({ month: x.month, rep_id: x.rep, pauses: r.rows });
}

/** body: { doctorIds: string[], paused: boolean, month?: 'YYYY-MM-01', reason?, repId? (admin) } */
export async function POST(req: Request) {
  const b = await req.json().catch(() => null) as { doctorIds?: unknown; paused?: unknown; month?: unknown; reason?: unknown; repId?: unknown } | null;
  const x = await resolve(req, b || {}); if ("err" in x) return x.err;
  const ids = Array.isArray(b?.doctorIds) ? [...new Set(b!.doctorIds.map(String))].filter(id => UUID_RE.test(id)).slice(0, 500) : [];
  if (!ids.length) return NextResponse.json({ error: "اختار طبيب واحد على الأقل" }, { status: 400 });
  if (x.u.role !== "admin" && !allowedMonth(x.month)) return NextResponse.json({ error: "تقدر توقف الطبيب للشهر الحالي أو الجاي بس" }, { status: 400 });
  if (b?.paused === false) {
    await query("DELETE FROM doctor_month_pauses WHERE rep_id=$1 AND month=$2 AND doctor_id = ANY($3::uuid[])", [x.rep, x.month, ids]);
  } else {
    const reason = String(b?.reason || "").slice(0, 200);
    await query(`INSERT INTO doctor_month_pauses(rep_id, doctor_id, month, reason, created_by)
      SELECT $1, d.id, $2::date, $3, $4 FROM doctors d WHERE d.id = ANY($5::uuid[]) ON CONFLICT (rep_id, doctor_id, month) DO UPDATE SET reason=EXCLUDED.reason`, [x.rep, x.month, reason, x.u.id, ids]);
  }
  await query("INSERT INTO audit_logs(actor_id, action, entity, entity_id, details) VALUES($1,$2,'doctor_month_pause',$3,$4)",
    [x.u.id, b?.paused === false ? "resume" : "pause", x.rep, `${ids.length} doctor(s) · ${x.month}`]).catch(() => undefined);
  const r = await query("SELECT count(*)::int n FROM doctor_month_pauses WHERE rep_id=$1 AND month=$2", [x.rep, x.month]);
  return NextResponse.json({ ok: true, month: x.month, paused_total: r.rows[0].n });
}
