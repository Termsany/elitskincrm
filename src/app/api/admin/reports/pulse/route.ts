import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { UUID_RE } from "@/lib/ids";
import { riyadhToday } from "@/lib/finance";
import { systemPulse } from "@/lib/system-pulse";

const DAY = /^20\d\d-\d\d-\d\d$/;
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams, from = sp.get("from") || "", to = sp.get("to") || "", repId = sp.get("repId") || "";
  if (!DAY.test(from) || !DAY.test(to) || from > to || (repId && !UUID_RE.test(repId))) return NextResponse.json({ error: "فترة غير صحيحة" }, { status: 400 });
  return NextResponse.json(await systemPulse(from, to, repId || null, riyadhToday()), { headers: { "cache-control": "private, no-store" } });
}
