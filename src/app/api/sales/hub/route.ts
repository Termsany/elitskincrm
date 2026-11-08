import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { salesHub } from "@/lib/sales-hub";
import { UUID_RE, riyadhToday } from "@/lib/fmt";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const nowYear = Number(riyadhToday().slice(0, 4));
  const y = Number(sp.get("year")); const year = y >= 2020 && y <= nowYear + 1 ? y : nowYear;
  const rep = sp.get("repId");
  return NextResponse.json(await salesHub(u, year, rep && UUID_RE.test(rep) ? rep : null));
}
