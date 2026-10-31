import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { daftraSummary, syncIfStale } from "@/lib/daftra";

const DAY = /^20\d\d-\d\d-\d\d$/;
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") || "", to = sp.get("to") || "", branch = (sp.get("branch") || "").slice(0, 60) || undefined;
  if (!DAY.test(from) || !DAY.test(to) || from > to) return NextResponse.json({ error: "فترة غير صحيحة" }, { status: 400 });
  await syncIfStale(60);
  return NextResponse.json(await daftraSummary(from, to, branch));
}
