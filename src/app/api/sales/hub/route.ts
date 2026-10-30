import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { salesHub } from "@/lib/sales-hub";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const nowYear = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date()).slice(0, 4));
  const y = Number(sp.get("year")); const year = y >= 2020 && y <= nowYear + 1 ? y : nowYear;
  const rep = sp.get("repId");
  return NextResponse.json(await salesHub(u, year, rep && UUID_RE.test(rep) ? rep : null));
}
