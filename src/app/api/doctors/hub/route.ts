import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { hubDoctors } from "@/lib/doctors-hub";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const days = [30, 90, 180, 365].includes(Number(sp.get("days"))) ? Number(sp.get("days")) : 90;
  const rep = sp.get("repId");
  return NextResponse.json({ days, doctors: await hubDoctors(u, days, rep && UUID_RE.test(rep) ? rep : null) });
}
