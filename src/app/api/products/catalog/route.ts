import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { repCatalog } from "@/lib/product-studio";

export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ products: await repCatalog() });
}
