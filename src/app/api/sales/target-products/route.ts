import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { targetProducts } from "@/lib/sales-admin";

/** The rep's own targets per product (set by the admin): units and amounts for the year and each month. */
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const y = Number(new URL(req.url).searchParams.get("year")) || Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date()).slice(0, 4));
  return NextResponse.json({ year: y, lines: u.role === "sales_rep" ? await targetProducts(y, u.id) : [] });
}
