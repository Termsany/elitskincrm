import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { review, ExpenseError } from "@/lib/expenses";

/** POST { ids: uuid[], action: "approve"|"reject"|"reimburse", note?, payment_ref? } */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as { ids?: unknown; action?: unknown; note?: unknown; payment_ref?: unknown } | null;
  if (!b || !Array.isArray(b.ids) || !["approve", "reject", "reimburse"].includes(String(b.action))) return NextResponse.json({ error: "طلب غير صحيح" }, { status: 400 });
  try {
    return NextResponse.json(await review(user.id, b.ids.map(String), b.action as "approve" | "reject" | "reimburse", typeof b.note === "string" ? b.note : "", typeof b.payment_ref === "string" ? b.payment_ref : ""));
  } catch (e) {
    if (e instanceof ExpenseError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("expense review", e); return NextResponse.json({ error: "تعذر حفظ القرار" }, { status: 500 });
  }
}
