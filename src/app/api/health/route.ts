import { NextResponse } from "next/server";
import { query } from "@/lib/db";
export async function GET() {
  try {
    await query("SELECT 1");
    return NextResponse.json({ ok: true, db: "up" });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
