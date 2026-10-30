import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { signDocument, type Placement } from "@/lib/library-sign";

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null) as { src?: string; id?: string; placements?: Placement[]; footer?: boolean; visibility?: string; request_id?: string } | null;
  if (!b?.src || !b.id || !Array.isArray(b.placements)) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const placements = b.placements.map(p => ({ asset_id: String(p.asset_id || ""), page: Number(p.page), x: Number(p.x), y: Number(p.y), w: Number(p.w), h: Number(p.h), allPages: !!p.allPages }));
  const r = await signDocument(u, b.src, b.id, placements, { footer: b.footer !== false, visibility: String(b.visibility || "private"), requestId: b.request_id ? String(b.request_id) : undefined });
  const { status, ...body } = r; return NextResponse.json(body, { status });
}
