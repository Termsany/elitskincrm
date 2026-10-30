import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createSignRequest, listSignRequests } from "@/lib/sign-requests";

export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ requests: await listSignRequests(u) });
}
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null) as { items?: Array<{ src?: string; id?: string }>; src?: string; id?: string; note?: string; want?: string } | null;
  const items = (b?.items?.length ? b.items : [{ src: b?.src, id: b?.id }]).map(x => ({ src: String(x.src || ""), id: String(x.id || "") })).filter(x => x.src && x.id).slice(0, 10);
  if (!items.length) return NextResponse.json({ error: "اختار ملف" }, { status: 400 });
  const out = []; for (const it of items) out.push({ ...it, ...(await createSignRequest(u, it.src, it.id, String(b?.note || "").trim(), String(b?.want || "signature"))) });
  const ok = out.filter(x => x.status === 201).length;
  return NextResponse.json({ created: ok, results: out }, { status: ok ? 201 : (out[0]?.status || 400) });
}
