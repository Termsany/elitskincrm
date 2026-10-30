import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { deleteItems } from "@/lib/library-trash";

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null) as { items?: Array<{ src?: string; id?: string }> } | null;
  const items = (b?.items || []).map(x => ({ src: String(x.src || ""), id: String(x.id || "") })).filter(x => x.src && x.id);
  if (!items.length) return NextResponse.json({ error: "اختار ملف" }, { status: 400 });
  const r = await deleteItems(u, items);
  return NextResponse.json(r, { status: r.deleted.length ? 200 : 403 });
}
