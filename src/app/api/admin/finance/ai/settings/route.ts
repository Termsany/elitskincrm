import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { AiError, PROVIDERS, aiStatus, encryptKey, listModels, loadAi, resolveBase, type ProviderId } from "@/lib/ai-provider";

export const runtime = "nodejs";
async function admin() { const u = await getCurrentUser(); return u && u.role === "admin" && !u.manager ? u : null; }
const isProvider = (x: unknown): x is ProviderId => PROVIDERS.some(p => p.id === x);
type Body = { provider?: unknown; base_url?: unknown; api_key?: unknown; model?: unknown };

/** Provider + key from the request; an empty key means "the one already saved" (same provider only). */
async function fromBody(b: Body | null) {
  if (!b || !isProvider(b.provider)) return { err: "اختار المزوّد" };
  const base = resolveBase(b.provider, String(b.base_url || ""));
  if (base === null) return { err: "عنوان المزوّد لازم يبدأ بـ https:// ويكون عنوان عام" };
  let key = String(b.api_key || "").trim();
  if (!key) { const cur = await loadAi(); if (cur && cur.provider === b.provider && cur.base_url === base) key = cur.api_key; }
  if (key.length < 8 || key.length > 400) return { err: "اكتب مفتاح الـ API" };
  return { provider: b.provider, base_url: base, api_key: key };
}

/** Current choice (never the key itself). */
export async function GET() {
  if (!await admin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ status: await aiStatus(), providers: PROVIDERS }, { headers: { "cache-control": "no-store" } });
}

/** Test a key and list the models it can use. */
export async function POST(req: Request) {
  if (!await admin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const c = await fromBody(await req.json().catch(() => null));
  if ("err" in c) return NextResponse.json({ error: c.err }, { status: 400 });
  try { return NextResponse.json({ ok: true, models: await listModels(c) }); }
  catch (e) { return NextResponse.json({ error: e instanceof AiError ? e.message : "تعذر اختبار المفتاح" }, { status: 400 }); }
}

/** Save provider, key and model. */
export async function PUT(req: Request) {
  const u = await admin(); if (!u) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as Body | null;
  const c = await fromBody(b);
  if ("err" in c) return NextResponse.json({ error: c.err }, { status: 400 });
  const model = String(b?.model || "").trim();
  if (!model || model.length > 120) return NextResponse.json({ error: "اختار الموديل" }, { status: 400 });
  await query(`INSERT INTO ai_settings(id, provider, base_url, model, api_key_enc, key_hint, updated_by, updated_at) VALUES(1,$1,$2,$3,$4,$5,$6,now())
    ON CONFLICT (id) DO UPDATE SET provider=$1, base_url=$2, model=$3, api_key_enc=$4, key_hint=$5, updated_by=$6, updated_at=now()`,
    [c.provider, c.base_url, model, encryptKey(c.api_key), `…${c.api_key.slice(-4)}`, u.id]);
  await query("INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'update','ai_settings','1',$2)", [u.id, JSON.stringify({ provider: c.provider, model })]);
  return NextResponse.json({ ok: true, status: await aiStatus() });
}

/** Disconnect: forget the saved key. */
export async function DELETE() {
  const u = await admin(); if (!u) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await query("DELETE FROM ai_settings WHERE id=1");
  await query("INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'delete','ai_settings','1','{}')", [u.id]);
  return NextResponse.json({ ok: true, status: await aiStatus() });
}
