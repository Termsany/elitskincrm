import { query } from "@/lib/db";

export type ClinicBalance = { id: string; name: string; unpaid: number; overdue: number; shared: boolean };

/**
 * Open Daftra balance of every linked CRM clinic, in one query, for the clinic cards.
 * Same rules as the clinic account card: open = unpaid > 0 and status unpaid/partial; overdue = past its due date.
 * A branch shows its company's balance; `shared` = another clinic with doctors uses the same Daftra customer.
 */
export async function clinicBalances(today: string): Promise<ClinicBalance[]> {
  const r = await query<ClinicBalance>(`
    WITH m AS (SELECT c.id, c.name, k.client_id FROM clinics c CROSS JOIN LATERAL (
        SELECT b.client_id FROM daftra_client_branches b WHERE b.clinic_id=c.id
        UNION SELECT l.client_id FROM daftra_client_links l WHERE l.clinic_id=c.id AND l.client_id IS NOT NULL
        UNION SELECT c.daftra_client_id WHERE c.daftra_client_id IS NOT NULL) k),
    sh AS (SELECT client_id, count(DISTINCT m.id) FILTER (WHERE EXISTS (SELECT 1 FROM doctors d WHERE d.clinic_id=m.id)) n FROM m GROUP BY client_id),
    bal AS (SELECT i.client_id, sum(i.unpaid) unpaid, sum(i.unpaid) FILTER (WHERE i.invoice_date + COALESCE(i.due_days,0) < $1::date) overdue
      FROM daftra_invoices i WHERE i.unpaid > 0 AND i.payment_status IN (0,1) GROUP BY i.client_id)
    SELECT m.id, max(m.name) AS name, COALESCE(sum(bal.unpaid),0)::float8 unpaid, COALESCE(sum(bal.overdue),0)::float8 overdue, bool_or(sh.n > 1) shared
    FROM m JOIN sh USING (client_id) LEFT JOIN bal USING (client_id) GROUP BY m.id`, [today]);
  return r.rows.map(x => ({ ...x, unpaid: Math.round(x.unpaid), overdue: Math.round(x.overdue), shared: !!x.shared }));
}
