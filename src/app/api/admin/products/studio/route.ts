import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { studioProducts } from "@/lib/product-studio";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ products: await studioProducts() });
}
