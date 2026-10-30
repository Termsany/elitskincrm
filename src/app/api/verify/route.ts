import { NextResponse } from "next/server";
import { verify } from "@/lib/verify";

const hits = new Map<string, { n: number; t: number }>();
export async function GET(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "?").split(",")[0].trim();
  const now = Date.now(); const h = hits.get(ip);
  if (h && now - h.t < 60_000) { if (++h.n > 30) return NextResponse.json({ error: "محاولات كتير — جرّب بعد دقيقة" }, { status: 429 }); } else hits.set(ip, { n: 1, t: now });
  if (hits.size > 5000) hits.clear();
  const sp = new URL(req.url).searchParams;
  const r = await verify(String(sp.get("ref") || "").slice(0, 20), String(sp.get("hash") || "").slice(0, 64));
  return NextResponse.json(r, { headers: { "cache-control": "no-store" } });
}
