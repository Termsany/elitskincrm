import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { globalSearch } from "@/lib/admin-dashboard";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = (new URL(req.url).searchParams.get("q") || "").slice(0, 60);
  return NextResponse.json({ results: await globalSearch(q) });
}
