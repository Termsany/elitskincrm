import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { aiProductSummary, productVoice } from "@/lib/visit-sales";

const D = /^\d{4}-\d{2}-\d{2}$/;
/** GET ?from&to: what doctors say per product. POST {product_id, from, to}: AI summary for one product (when the server has an AI key). */
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams, from = sp.get("from") || "", to = sp.get("to") || "";
  if (!D.test(from) || !D.test(to) || from > to) return NextResponse.json({ error: "الفترة غير صحيحة" }, { status: 400 });
  return NextResponse.json({ products: await productVoice(from, to), ai: !!process.env.ANTHROPIC_API_KEY?.trim() });
}
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as { product_id?: string; from?: string; to?: string } | null;
  if (!b?.product_id || !/^[0-9a-f-]{36}$/i.test(b.product_id) || !D.test(b.from || "") || !D.test(b.to || "")) return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
  const r = (await query<{ name: string; notes: string }>(`SELECT pr.name, v.notes FROM visit_presented_products pp JOIN visits v ON v.id=pp.visit_id JOIN products pr ON pr.id=pp.product_id
    WHERE pp.product_id=$1 AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $2 AND $3 AND length(coalesce(v.notes,'')) > 10 ORDER BY v.visited_at DESC LIMIT 60`, [b.product_id, b.from, b.to])).rows;
  if (!r.length) return NextResponse.json({ summary: null, error: "مفيش ملاحظات كفاية للمنتج ده في الفترة" });
  const summary = await aiProductSummary(r[0].name, r.map(x => x.notes));
  if (!summary) return NextResponse.json({ summary: null, error: process.env.ANTHROPIC_API_KEY ? "تعذر الاتصال بالذكاء الاصطناعي" : "الملخص الذكي محتاج مفتاح AI على السيرفر" });
  return NextResponse.json({ summary });
}
