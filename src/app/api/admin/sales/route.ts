import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { UUID_RE } from "@/lib/ids";
import { adminSalesView, arabicError, setProductTarget, syncDaftraClinics } from "@/lib/sales-admin";
import { riyadhToday } from "@/lib/fmt";

/** Admin sales & targets console (admin only). Approvals reuse /api/admin/forecast and /api/admin/forecast/targets. */
async function admin() { const u = await getCurrentUser(); return u && u.role === "admin" ? u : null; }
const nowParts = () => riyadhToday();
export async function GET(req: Request) {
  if (!await admin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams, today = nowParts();
  const year = Number(sp.get("year")) || Number(today.slice(0, 4));
  const month = /^20\d\d-(0[1-9]|1[0-2])$/.test(sp.get("month") || "") ? sp.get("month")! : today.slice(0, 7);
  try { return NextResponse.json(await adminSalesView(year, month), { headers: { "cache-control": "private, no-store" } }); }
  catch (e) { return NextResponse.json({ error: arabicError(e) }, { status: 400 }); }
}
export async function POST(req: Request) {
  const u = await admin(); if (!u) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  try {
    if (b?.action === "set_target") {
      if (!UUID_RE.test(String(b.rep_id))) throw new Error("اختار المندوب");
      return NextResponse.json(await setProductTarget(u.id, { rep_id: String(b.rep_id), period: String(b.period), lines: b.lines as never }));
    }
    if (b?.action === "set_product_price") {
      const price = Number(b.unit_price); if (!UUID_RE.test(String(b.product_id)) || !Number.isFinite(price) || price <= 0 || price > 1e7) throw new Error("سعر غير صحيح");
      await query("UPDATE products SET unit_price=$2 WHERE id=$1", [b.product_id, Math.round(price * 100) / 100]);
      return NextResponse.json({ ok: true });
    }
    if (b?.action === "sync_clinics") return NextResponse.json({ ok: true, clinics: await syncDaftraClinics() });
    throw new Error("إجراء غير معروف");
  } catch (e) { return NextResponse.json({ error: arabicError(e) }, { status: 400 }); }
}
