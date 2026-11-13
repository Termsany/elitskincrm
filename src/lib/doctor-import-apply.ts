import type { Plan } from "./doctor-sync";

type Q = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

// A doctor with any of these is archived (status 'inactive') instead of deleted, so history stays intact.
export const HISTORY = ["visits", "plan_items", "doctor_followups", "doctor_month_pauses", "tasks", "doctor_requests", "calendar_events", "detailing_sessions", "expenses"];
const COLS = "id,name,clinic_name,city,specialty,classification,phone,email,status,created_at";

export type Snapshot = {
  updated: Array<{ id: string; before: Record<string, string>; status: string | null }>;
  added: string[];
  archived: string[];
  deleted: Array<Record<string, unknown>>;
};

/** Writes an import plan inside the caller's transaction and returns what is needed to undo it. */
export async function applyPlan(client: Q, plan: Plan, keepHistory: Set<string>) {
  const failed: Array<{ line: number; name: string }> = [];
  const snapshot: Snapshot = { updated: [], added: [], archived: [], deleted: [] };
  const addedRows: Array<{ name: string; clinic_name: string }> = [];
  for (const x of plan.update) {
    const sets: string[] = []; const vals: unknown[] = [x.id]; const before: Record<string, string> = {};
    for (const [f, [old, v]] of Object.entries(x.changes)) { vals.push(v); sets.push(`${f}=$${vals.length}`); before[f] = old; }
    if (x.reactivate) sets.push("status='active'");
    await client.query("SAVEPOINT r");
    try {
      await client.query(`UPDATE doctors SET ${sets.join(",")} WHERE id=$1`, vals); await client.query("RELEASE SAVEPOINT r");
      snapshot.updated.push({ id: x.id, before, status: x.reactivate ? "inactive" : null });
    } catch { await client.query("ROLLBACK TO SAVEPOINT r"); failed.push({ line: x.row.line, name: x.row.name }); }
  }
  for (const r of plan.add) {
    // A savepoint per row: a clash with another record skips that row instead of failing the whole import.
    await client.query("SAVEPOINT r");
    try {
      const ins = await client.query("INSERT INTO doctors(name,clinic_name,city,specialty,classification,phone,email,status) VALUES($1,$2,$3,$4,$5,$6,$7,'active') RETURNING id",
        [r.name, r.clinic_name, r.city, r.specialty, r.classification, r.phone, r.email]);
      await client.query("RELEASE SAVEPOINT r");
      snapshot.added.push(String(ins.rows[0].id)); addedRows.push({ name: r.name, clinic_name: r.clinic_name });
    } catch { await client.query("ROLLBACK TO SAVEPOINT r"); failed.push({ line: r.line, name: r.name }); }
  }
  const archive = plan.remove.filter(d => keepHistory.has(d.id)).map(d => d.id);
  const del = plan.remove.filter(d => !keepHistory.has(d.id)).map(d => d.id);
  if (archive.length) { await client.query("UPDATE doctors SET status='inactive' WHERE id=ANY($1::uuid[])", [archive]); snapshot.archived = archive; }
  if (del.length) {
    snapshot.deleted = (await client.query(`SELECT ${COLS} FROM doctors WHERE id=ANY($1::uuid[])`, [del])).rows;
    await client.query("DELETE FROM doctors WHERE id=ANY($1::uuid[])", [del]);
  }
  return { failed, snapshot, addedRows };
}

/** Reverses one import inside the caller's transaction. Doctors it added are deleted, or archived if they got history since. */
export async function undoSnapshot(client: Q, s: Snapshot) {
  const out = { restored: 0, reactivated: 0, reverted: 0, removed: 0, skipped: 0 };
  const step = async (fn: () => Promise<void>) => {
    await client.query("SAVEPOINT u");
    try { await fn(); await client.query("RELEASE SAVEPOINT u"); return true; } catch { await client.query("ROLLBACK TO SAVEPOINT u"); out.skipped++; return false; }
  };
  if (s.added?.length) {
    const hist = await client.query(`SELECT d.id FROM unnest($1::uuid[]) d(id) WHERE ${HISTORY.map(t => `EXISTS (SELECT 1 FROM ${t} x WHERE x.doctor_id=d.id)`).join(" OR ")}`, [s.added]);
    const keep = new Set(hist.rows.map(r => String(r.id)));
    const del = s.added.filter(id => !keep.has(id));
    if (keep.size) await client.query("UPDATE doctors SET status='inactive' WHERE id=ANY($1::uuid[])", [[...keep]]);
    if (del.length) await client.query("DELETE FROM doctors WHERE id=ANY($1::uuid[])", [del]);
    out.removed = s.added.length;
  }
  for (const u of s.updated || []) {
    const sets: string[] = []; const vals: unknown[] = [u.id];
    for (const [f, v] of Object.entries(u.before)) { if (!/^[a-z_]+$/.test(f)) continue; vals.push(v); sets.push(`${f}=$${vals.length}`); }
    if (u.status) { vals.push(u.status); sets.push(`status=$${vals.length}`); }
    if (sets.length && await step(async () => { await client.query(`UPDATE doctors SET ${sets.join(",")} WHERE id=$1`, vals); })) out.reverted++;
  }
  if (s.archived?.length) out.reactivated = (await client.query("UPDATE doctors SET status='active' WHERE id=ANY($1::uuid[]) AND status='inactive' AND merged_into IS NULL", [s.archived])).rowCount || 0;
  for (const d of s.deleted || []) {
    if (await step(async () => { await client.query(`INSERT INTO doctors(${COLS}) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [d.id, d.name, d.clinic_name, d.city, d.specialty, d.classification, d.phone, d.email, d.status || "active", d.created_at]); })) out.restored++;
  }
  return out;
}
