import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { purgeItem, restoreItem } from "@/lib/library-trash";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { status, ...body } = await restoreItem(u, (await params).id); return NextResponse.json(body, { status });
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { status, ...body } = await purgeItem(u, (await params).id); return NextResponse.json(body, { status });
}
