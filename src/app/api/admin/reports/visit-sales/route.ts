import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { visitSales } from "@/lib/visit-sales";

const D = /^\d{4}-\d{2}-\d{2}$/;
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams, from = sp.get("from") || "", to = sp.get("to") || "", rep = sp.get("repId") || "";
  if (!D.test(from) || !D.test(to) || from > to) return NextResponse.json({ error: "الفترة غير صحيحة" }, { status: 400 });
  if (rep && !/^[0-9a-f-]{36}$/i.test(rep)) return NextResponse.json({ error: "مندوب غير صحيح" }, { status: 400 });
  return NextResponse.json(await visitSales(from, to, rep || null));
}
