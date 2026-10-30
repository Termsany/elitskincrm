import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { addPlanItem, DAY_RE, UUID_RE } from "@/lib/agenda";

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null) as { date?: string; doctorId?: string; productId?: string; repId?: string; note?: string } | null;
  if (!b || !DAY_RE.test(b.date || "") || !UUID_RE.test(b.doctorId || "")) return NextResponse.json({ error: "اختر الطبيب واليوم" }, { status: 400 });
  const owner = u.role === "admin" ? (b.repId || "") : u.id;
  if (!UUID_RE.test(owner)) return NextResponse.json({ error: "اختر المندوب" }, { status: 400 });
  const r = await addPlanItem(u, owner, b.date!, b.doctorId!, b.productId && UUID_RE.test(b.productId) ? b.productId : null, String(b.note || "").slice(0, 300));
  const { status, ...body } = r; return NextResponse.json(body, { status });
}
