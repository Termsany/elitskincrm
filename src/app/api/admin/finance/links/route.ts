import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE } from "@/lib/ids";
import { riyadhToday } from "@/lib/finance";
import { clientLinks } from "@/lib/collections";

/** Admin: which rep (and clinic) owns each Daftra customer — drives the reps' collection lists. CRM only. */
async function admin() { const u = await getCurrentUser(); return u && u.role === "admin" ? u : null; }
export async function GET() {
  if (!await admin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await clientLinks(riyadhToday()));
}
export async function PUT(req: Request) {
  const u = await admin(); if (!u) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as { client_id?: unknown; rep_id?: unknown; clinic_id?: unknown } | null;
  const cid = Number(b?.client_id); if (!Number.isSafeInteger(cid) || cid <= 0) return NextResponse.json({ error: "عميل غير صحيح" }, { status: 400 });
  const rep = b?.rep_id ? String(b.rep_id) : null, clinic = b?.clinic_id ? String(b.clinic_id) : null;
  if ((rep && !UUID_RE.test(rep)) || (clinic && !UUID_RE.test(clinic))) return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
  if (rep && !(await query("SELECT 1 FROM users WHERE id=$1 AND role='sales_rep'", [rep])).rows[0]) return NextResponse.json({ error: "المندوب غير موجود" }, { status: 400 });
  if (!rep && !clinic) await query("DELETE FROM daftra_client_links WHERE client_id=$1", [cid]);
  else await query(`INSERT INTO daftra_client_links(client_id, rep_id, clinic_id, updated_by, updated_at) VALUES($1,$2,$3,$4,now())
    ON CONFLICT (client_id) DO UPDATE SET rep_id=EXCLUDED.rep_id, clinic_id=EXCLUDED.clinic_id, updated_by=EXCLUDED.updated_by, updated_at=now()`, [cid, rep, clinic, u.id]);
  return NextResponse.json({ ok: true });
}
/** POST {action:"auto"} — accept every automatic suggestion for customers that are not linked yet. */
export async function POST(req: Request) {
  const u = await admin(); if (!u) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as { action?: string } | null;
  if (b?.action !== "auto") return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  const { clients } = await clientLinks(riyadhToday());
  let n = 0;
  // clinic-only suggestions are linked too: the clinic page and the slowdown alerts need them even without a rep
  for (const c of clients) {
    if (!c.linked && c.suggestion) { await query("INSERT INTO daftra_client_links(client_id, rep_id, clinic_id, updated_by) VALUES($1,$2,$3,$4) ON CONFLICT (client_id) DO NOTHING", [c.client_id, c.suggestion.rep_id, c.suggestion.clinic_id, u.id]); n++; }
    // linked to an empty duplicate clinic → move to the matching clinic that has the doctors (keep a chosen rep)
    else if (c.better) { await query("UPDATE daftra_client_links SET clinic_id=$2, rep_id=COALESCE(rep_id,$3), updated_by=$4, updated_at=now() WHERE client_id=$1", [c.client_id, c.better.clinic_id, c.better.rep_id, u.id]); n++; }
  }
  return NextResponse.json({ ok: true, linked: n });
}
