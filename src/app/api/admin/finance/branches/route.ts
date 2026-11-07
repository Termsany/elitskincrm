import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE } from "@/lib/ids";
import { branchClients } from "@/lib/clinic-groups";

/** Admin: which CRM clinics are branches of each Daftra customer. */
async function admin() { const u = await getCurrentUser(); return u && u.role === "admin" ? u : null; }
export async function GET() {
  if (!await admin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await branchClients());
}
/** PUT {client_id, clinic_id, on}: add / remove one branch. A clinic moves from its previous customer. */
export async function PUT(req: Request) {
  const u = await admin(); if (!u) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as { client_id?: unknown; clinic_id?: unknown; on?: unknown } | null;
  const cid = Number(b?.client_id), clinic = String(b?.clinic_id || "");
  if (!Number.isSafeInteger(cid) || cid <= 0 || !UUID_RE.test(clinic)) return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
  if (b?.on) await query(`INSERT INTO daftra_client_branches(client_id, clinic_id, updated_by) VALUES($1,$2,$3) ON CONFLICT (clinic_id) DO UPDATE SET client_id=EXCLUDED.client_id, updated_by=EXCLUDED.updated_by, created_at=now()`, [cid, clinic, u.id]);
  else await query("DELETE FROM daftra_client_branches WHERE client_id=$1 AND clinic_id=$2", [cid, clinic]);
  await query("INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,$2,'clinic',$3,$4)", [u.id, b?.on ? "branch_link" : "branch_unlink", clinic, JSON.stringify({ client_id: cid })]).catch(() => null);
  return NextResponse.json({ ok: true });
}
/** POST {action:"accept", client_id?}: accept the suggested branches (of one customer, or all). */
export async function POST(req: Request) {
  const u = await admin(); if (!u) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as { action?: string; client_id?: number } | null;
  if (b?.action !== "accept") return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  const { clients } = await branchClients(); let n = 0;
  for (const c of clients) { if (b.client_id && c.client_id !== Number(b.client_id)) continue;
    for (const s of c.suggestions.filter(x => !x.weak)) { const r = await query("INSERT INTO daftra_client_branches(client_id, clinic_id, updated_by) VALUES($1,$2,$3) ON CONFLICT (clinic_id) DO NOTHING", [c.client_id, s.id, u.id]); n += r.rowCount || 0; } }
  return NextResponse.json({ ok: true, linked: n });
}
