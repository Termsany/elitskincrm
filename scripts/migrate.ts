import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pool } from '../src/lib/db';
async function main() {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const name of readdirSync(resolve('migrations')).filter(x => x.endsWith('.sql')).sort()) {
    const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name]);
    if (exists.rowCount) continue;
    const client = await pool.connect();
    try { await client.query('BEGIN'); await client.query(readFileSync(resolve('migrations', name), 'utf8')); await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]); await client.query('COMMIT'); console.log(`applied ${name}`); }
    catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
