import type { PoolClient } from "pg";
import { pool, query } from "@/lib/db";
import { clinicPairs, doctorPairs, type MClinic, type MDoctor, type Pair } from "@/lib/merge-match";

/**
 * Merge duplicate clinics / doctors. Everything that points at the dropped record moves to the one kept, inside one
 * transaction; the dropped record is kept inactive with merged_into, and every merge is written to merge_log.
 */
export class MergeError extends Error {}

const DOCTOR_TABLES = ["visits", "tasks", "plan_items", "doctor_requests", "calendar_events", "doctor_followups", "detailing_sessions", "expenses"] as const;

async function clientsOf(c: PoolClient, clinicId: string) {
  const r = await c.query<{ k: string }>(`SELECT b.client_id k FROM daftra_client_branches b WHERE b.clinic_id=$1
    UNION SELECT l.client_id FROM daftra_client_links l WHERE l.clinic_id=$1 UNION SELECT cc.daftra_client_id FROM clinics cc WHERE cc.id=$1 AND cc.daftra_client_id IS NOT NULL`, [clinicId]);
  return r.rows.map(x => Number(x.k));
}

async function mergeDoctorsTx(c: PoolClient, keep: string, drop: string, by: string) {
  if (keep === drop) throw new MergeError("اختار طبيبين مختلفين");
  const r = await c.query<{ id: string; name: string; status: string; merged_into: string | null }>("SELECT id, name, status, merged_into FROM doctors WHERE id = ANY($1::uuid[]) FOR UPDATE", [[keep, drop]]);
  const k = r.rows.find(x => x.id === keep), d = r.rows.find(x => x.id === drop);
  if (!k || !d) throw new MergeError("الطبيب مش موجود");
  if (k.merged_into || d.merged_into) throw new MergeError("واحد منهم اتدمج قبل كده");
  const moved: Record<string, number> = {};
  for (const t of DOCTOR_TABLES) moved[t] = (await c.query(`UPDATE ${t} SET doctor_id=$1 WHERE doctor_id=$2`, [keep, drop])).rowCount || 0;
  await c.query(`DELETE FROM doctor_month_pauses p WHERE p.doctor_id=$2 AND EXISTS (SELECT 1 FROM doctor_month_pauses q WHERE q.doctor_id=$1 AND q.rep_id=p.rep_id AND q.month=p.month)`, [keep, drop]);
  moved.doctor_month_pauses = (await c.query("UPDATE doctor_month_pauses SET doctor_id=$1 WHERE doctor_id=$2", [keep, drop])).rowCount || 0;
  // fill what the kept record is missing (phone only when it can't clash with the unique name+clinic+phone)
  await c.query(`UPDATE doctors k SET email = CASE WHEN btrim(k.email)='' THEN d.email ELSE k.email END,
      specialty = CASE WHEN btrim(k.specialty)='' THEN d.specialty ELSE k.specialty END,
      classification = CASE WHEN btrim(k.classification)='' THEN d.classification ELSE k.classification END
    FROM doctors d WHERE k.id=$1 AND d.id=$2`, [keep, drop]);
  await c.query(`UPDATE doctors k SET phone=d.phone FROM doctors d WHERE k.id=$1 AND d.id=$2 AND btrim(k.phone)='' AND btrim(d.phone)<>''
    AND NOT EXISTS (SELECT 1 FROM doctors x WHERE x.id<>k.id AND x.name=k.name AND x.clinic_name=k.clinic_name AND x.phone=d.phone)`, [keep, drop]);
  await c.query("UPDATE doctors SET status='inactive', merged_into=$1 WHERE id=$2", [keep, drop]);
  await c.query("UPDATE doctors SET merged_into=$1 WHERE merged_into=$2", [keep, drop]);
  await c.query("INSERT INTO merge_log(kind, keep_id, drop_id, details, merged_by) VALUES('doctor',$1,$2,$3,$4)", [keep, drop, JSON.stringify({ name: d.name, kept: k.name, moved }), by]);
  return moved;
}

async function tx<T>(fn: (c: PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try { await c.query("BEGIN"); const out = await fn(c); await c.query("COMMIT"); return out; }
  catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
  finally { c.release(); }
}

export const mergeDoctors = (keep: string, drop: string, by: string) => tx(c => mergeDoctorsTx(c, keep, drop, by));

export function mergeClinics(keep: string, drop: string, by: string) {
  return tx(async c => {
    if (keep === drop) throw new MergeError("اختار عيادتين مختلفين");
    const r = await c.query<{ id: string; name: string; city: string; active: boolean; merged_into: string | null; daftra_client_id: string | null }>(
      "SELECT id, name, city, active, merged_into, daftra_client_id FROM clinics WHERE id = ANY($1::uuid[]) FOR UPDATE", [[keep, drop]]);
    const k = r.rows.find(x => x.id === keep), d = r.rows.find(x => x.id === drop);
    if (!k || !d) throw new MergeError("العيادة مش موجودة");
    if (k.merged_into || d.merged_into) throw new MergeError("واحدة منهم اتدمجت قبل كده");
    const kc = await clientsOf(c, keep), dc = await clientsOf(c, drop);
    if (kc.length && dc.length && !kc.some(x => dc.includes(x))) throw new MergeError("العيادتين مربوطين بعملاء مختلفين في دفترة — دول غالباً فرعين مختلفين، مش مكرر");
    if (k.daftra_client_id && d.daftra_client_id && k.daftra_client_id !== d.daftra_client_id) throw new MergeError("العيادتين ليهم عميلين مختلفين في دفترة");
    // the same doctor in both clinics (same name + phone) becomes one doctor first, so the move can't clash
    const twins = (await c.query<{ dd: string; kd: string }>(`SELECT dd.id dd, kd.id kd FROM doctors dd JOIN doctors kd ON kd.id<>dd.id AND kd.name=dd.name AND kd.phone=dd.phone AND kd.clinic_name=$1 AND kd.merged_into IS NULL
      WHERE dd.clinic_id=$2 AND dd.merged_into IS NULL`, [k.name, drop])).rows;
    for (const t of twins) await mergeDoctorsTx(c, t.kd, t.dd, by);
    const doctors = (await c.query("UPDATE doctors SET clinic_id=$1, clinic_name=$2, clinic_link_manual=true WHERE clinic_id=$3 AND merged_into IS NULL", [keep, k.name, drop])).rowCount || 0;
    await c.query("UPDATE doctors SET clinic_id=$1 WHERE clinic_id=$2", [keep, drop]); // merged leftovers
    await c.query("UPDATE daftra_client_links SET clinic_id=$1 WHERE clinic_id=$2", [keep, drop]);
    if ((await c.query("SELECT 1 FROM daftra_client_branches WHERE clinic_id=$1", [keep])).rowCount) await c.query("DELETE FROM daftra_client_branches WHERE clinic_id=$1", [drop]);
    else await c.query("UPDATE daftra_client_branches SET clinic_id=$1 WHERE clinic_id=$2", [keep, drop]);
    if (d.daftra_client_id && !k.daftra_client_id) {
      await c.query("UPDATE clinics SET daftra_client_id=NULL WHERE id=$1", [drop]);
      await c.query("UPDATE clinics SET daftra_client_id=$1 WHERE id=$2", [d.daftra_client_id, keep]);
    }
    // planning tables: where both have a row for the same key, the kept clinic's row wins
    await c.query(`DELETE FROM forecast_prices p WHERE p.clinic_id=$2 AND EXISTS (SELECT 1 FROM forecast_prices q WHERE q.clinic_id=$1 AND q.month=p.month AND q.product_id=p.product_id)`, [keep, drop]);
    await c.query(`DELETE FROM forecast_targets p WHERE p.clinic_id=$2 AND EXISTS (SELECT 1 FROM forecast_targets q WHERE q.clinic_id=$1 AND q.month=p.month AND q.rep_id=p.rep_id AND q.product_id=p.product_id)`, [keep, drop]);
    await c.query(`DELETE FROM forecast_lines p WHERE p.clinic_id=$2 AND EXISTS (SELECT 1 FROM forecast_lines q WHERE q.clinic_id=$1 AND q.version_id=p.version_id AND q.product_id=p.product_id)`, [keep, drop]);
    await c.query(`DELETE FROM rep_target_lines p WHERE p.clinic_id=$2 AND EXISTS (SELECT 1 FROM rep_target_lines q WHERE q.clinic_id=$1 AND q.version_id=p.version_id AND q.product_id=p.product_id)`, [keep, drop]);
    for (const t of ["forecast_prices", "forecast_targets", "forecast_lines", "rep_target_lines", "forecast_sales"]) await c.query(`UPDATE ${t} SET clinic_id=$1 WHERE clinic_id=$2`, [keep, drop]);
    if (!k.city.trim() && d.city.trim()) await c.query("UPDATE clinics SET city=$1 WHERE id=$2", [d.city, keep]);
    await c.query("UPDATE clinics SET active=false, merged_into=$1 WHERE id=$2", [keep, drop]);
    await c.query("UPDATE clinics SET merged_into=$1 WHERE merged_into=$2", [keep, drop]);
    const details = { name: d.name, kept: k.name, doctors, doctors_merged: twins.length };
    await c.query("INSERT INTO merge_log(kind, keep_id, drop_id, details, merged_by) VALUES('clinic',$1,$2,$3,$4)", [keep, drop, JSON.stringify(details), by]);
    return details;
  });
}

export type ClinicSide = MClinic & { linked: boolean };
export type DoctorSide = MDoctor & { city: string; classification: string; last_visit: string | null };

/** Suggestions screen: likely duplicates not dismissed, with what each side carries (so the admin keeps the richer one). */
export async function mergeSuggestions() {
  const [cl, dr, dis] = await Promise.all([
    query<{ id: string; name: string; city: string; clients: string[] | null; doctors: number; visits: number }>(`SELECT c.id, c.name, c.city,
        ARRAY(SELECT b.client_id::text FROM daftra_client_branches b WHERE b.clinic_id=c.id UNION SELECT l.client_id::text FROM daftra_client_links l WHERE l.clinic_id=c.id
          UNION SELECT c.daftra_client_id::text WHERE c.daftra_client_id IS NOT NULL) clients,
        (SELECT count(*) FROM doctors d WHERE d.clinic_id=c.id AND d.merged_into IS NULL AND COALESCE(d.status,'active')='active')::int doctors,
        (SELECT count(*) FROM visits v JOIN doctors d ON d.id=v.doctor_id WHERE d.clinic_id=c.id)::int visits
      FROM clinics c WHERE c.active AND c.merged_into IS NULL`),
    query<DoctorSide>(`SELECT d.id, d.name, d.clinic_id, d.clinic_name, d.city, d.phone, d.classification,
        (SELECT count(*) FROM visits v WHERE v.doctor_id=d.id)::int visits, (SELECT max(v.visited_at)::date::text FROM visits v WHERE v.doctor_id=d.id) last_visit
      FROM doctors d WHERE COALESCE(d.status,'active')='active' AND d.merged_into IS NULL`),
    query<{ kind: string; a: string; b: string }>("SELECT kind, a, b FROM merge_dismissals"),
  ]);
  const off = new Set(dis.rows.map(x => `${x.kind}:${[x.a, x.b].sort().join(":")}`));
  const clinics: ClinicSide[] = cl.rows.map(x => ({ ...x, clients: (x.clients || []).map(Number), linked: !!x.clients?.length }));
  const live = clinics.filter(x => x.doctors > 0 || x.linked || x.visits > 0);
  const keep = (p: Pair, kind: string) => !off.has(`${kind}:${[p.a, p.b].sort().join(":")}`);
  return {
    clinics: clinicPairs(live).filter(p => keep(p, "clinic")).map(p => ({ ...p, sides: [live.find(x => x.id === p.a)!, live.find(x => x.id === p.b)!] })),
    doctors: doctorPairs(dr.rows).filter(p => keep(p, "doctor")).map(p => ({ ...p, sides: [dr.rows.find(x => x.id === p.a)!, dr.rows.find(x => x.id === p.b)!] }))
      .sort((x, y) => (x.strength === "strong" ? 0 : 1) - (y.strength === "strong" ? 0 : 1)),
  };
}
