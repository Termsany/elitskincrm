import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { UUID_RE } from "@/lib/ids";
import { riyadhToday } from "@/lib/finance";
import { clinicAccount, doctorClinic } from "@/lib/clinic-account";

/** Compact Daftra account of a doctor's clinic for the visit screen: balance + ordering status. No prices or suppliers. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser(); if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; if (!UUID_RE.test(id)) return NextResponse.json({ error: "طبيب غير صحيح" }, { status: 400 });
  const clinic = await doctorClinic(id);
  const a = clinic ? await clinicAccount(clinic.id, riyadhToday(), u.role === "admin" ? null : u.id) : null;
  if (!clinic || !a) return NextResponse.json({ linked: false });
  return NextResponse.json({ linked: true, clinic: clinic.name, status: a.status, balance: { unpaid: a.balance.unpaid, overdue: a.balance.overdue, oldest: a.balance.oldest },
    orders: { last: a.orders.last, days_since: a.orders.days_since, usual_gap: a.orders.usual_gap }, change: a.sales.change, top: a.products.slice(0, 3).map((p: { item: string }) => p.item) });
}
