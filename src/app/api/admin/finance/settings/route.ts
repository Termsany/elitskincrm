import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

export async function PUT(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as { target_gross_margin?: unknown; target_net_margin?: unknown } | null;
  const g = Number(b?.target_gross_margin), n = Number(b?.target_net_margin);
  if (!(g >= 5 && g <= 90) || !(n >= 0 && n <= 60) || n >= g) return NextResponse.json({ error: "قيم غير منطقية (صافي الربح لازم يكون أقل من مجمل الربح)" }, { status: 400 });
  await query("UPDATE fin_settings SET target_gross_margin=$1, target_net_margin=$2, updated_at=now() WHERE id=1", [g, n]);
  return NextResponse.json({ ok: true });
}
