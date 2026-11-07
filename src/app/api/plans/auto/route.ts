import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { buildAutoPlans } from "@/lib/auto-plan";
import { riyadhToday } from "@/lib/visit-intel";

const cronOk = (req: Request) => { const s = process.env.CRON_SECRET?.trim(); if (!s) return false; const a = Buffer.from(req.headers.get("authorization") ?? ""), e = Buffer.from(`Bearer ${s}`); return a.length === e.length && timingSafeEqual(a, e); };

/** Thursday job: draft next week's plan for every rep that has none. */
export async function GET(req: Request) {
  if (!cronOk(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await buildAutoPlans(riyadhToday()));
}

/** Rep: draft my next week. Admin: draft for every rep that has no plan. */
export async function POST() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (u.role !== "sales_rep" && u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const r = await buildAutoPlans(riyadhToday(), u.role === "sales_rep" ? { repId: u.id } : {});
  return NextResponse.json(r);
}
