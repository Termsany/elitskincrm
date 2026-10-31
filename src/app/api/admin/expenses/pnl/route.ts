import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { UUID_RE } from "@/lib/ids";
import { pnl, riyadhDate } from "@/lib/expenses";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const year = Number(sp.get("year") || riyadhDate().slice(0, 4));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return NextResponse.json({ error: "سنة غير صحيحة" }, { status: 400 });
  const repId = sp.get("repId") || undefined;
  if (repId && !UUID_RE.test(repId)) return NextResponse.json({ error: "مندوب غير صحيح" }, { status: 400 });
  return NextResponse.json(await pnl(year, repId));
}
