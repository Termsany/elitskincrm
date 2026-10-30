import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listTrash, TRASH_DAYS } from "@/lib/library-trash";

export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ items: await listTrash(u), days: TRASH_DAYS });
}
