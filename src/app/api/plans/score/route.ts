import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { riyadhToday } from "@/lib/riyadh-day";
import { PARTS, repScores } from "@/lib/rep-score";

const MONTH = /^20\d\d-(0[1-9]|1[0-2])$/;

/** Monthly rep scores. Admin: everyone; a rep: only their own row. */
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = riyadhToday(), m = new URL(req.url).searchParams.get("month") || "";
  const month = MONTH.test(m) && m <= today.slice(0, 7) ? m : today.slice(0, 7);
  if (u.role === "admin") return NextResponse.json(await repScores(month, today));
  if (u.role !== "sales_rep") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await repScores(month, today, u.id));
}

/** Admin: score weights (0–100 each, at least one above 0). */
export async function PUT(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const w = PARTS.map(k => Math.round(Number(b?.[k])));
  if (w.some(x => !Number.isFinite(x) || x < 0 || x > 100) || !w.some(x => x > 0)) return NextResponse.json({ error: "الأوزان من 0 لـ 100" }, { status: 400 });
  await query(`INSERT INTO rep_score_weights(id, plan, coverage, sales, quality, discipline, updated_at) VALUES(1,$1,$2,$3,$4,$5,now())
    ON CONFLICT (id) DO UPDATE SET plan=$1, coverage=$2, sales=$3, quality=$4, discipline=$5, updated_at=now()`, w);
  return NextResponse.json({ ok: true });
}
