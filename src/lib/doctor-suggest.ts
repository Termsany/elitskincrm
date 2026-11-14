import { hubDoctors, type HubDoctor } from "@/lib/doctors-hub";
import { clinicBalances, type ClinicBalance } from "@/lib/clinic-balances";
import { priority, type Prio } from "@/lib/doctor-priority";

export type Ranked = HubDoctor & { prio: Prio };

/**
 * One ranking for "who to visit next" (follow-ups, overdue by class, interested without an order, clinic reorder due, never visited).
 * Used by the doctors page, the week board, plan suggestions, the calendar, the rep home and the Thursday auto-plan,
 * so a doctor gets the same reason and the same place everywhere.
 */
export async function rankedDoctors(repId: string, today: string, balances?: ClinicBalance[]): Promise<Ranked[]> {
  const [rows, bals] = await Promise.all([hubDoctors({ id: repId, role: "sales_rep" }, 90, null), balances ? Promise.resolve(balances) : clinicBalances(today, repId).catch(() => [] as ClinicBalance[])]);
  const byId = new Map(bals.map(b => [b.id, b])), byName = new Map(bals.map(b => [b.name.trim().toLowerCase(), b]));
  const bal = (d: HubDoctor) => (d.clinic_id && byId.get(d.clinic_id)) || byName.get((d.clinic_name || "").trim().toLowerCase()) || null;
  return rows.map(d => ({ ...d, prio: priority(d, bal(d), today) })).sort((a, b) => b.prio.score - a.prio.score);
}
