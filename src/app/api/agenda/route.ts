import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { agenda, DAY_RE, UUID_RE } from "@/lib/agenda";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") || "", to = sp.get("to") || "";
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) return NextResponse.json({ error: "التاريخ غير صحيح" }, { status: 400 });
  if ((Date.parse(to) - Date.parse(from)) / 864e5 > 62) return NextResponse.json({ error: "الفترة طويلة" }, { status: 400 });
  const repId = sp.get("repId");
  return NextResponse.json(await agenda(u, from, to, repId && UUID_RE.test(repId) ? repId : null));
}
