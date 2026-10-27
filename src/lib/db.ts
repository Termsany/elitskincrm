import { Pool, type QueryResultRow } from 'pg';
const globalForDb = globalThis as unknown as { pool?: Pool };
export const pool = globalForDb.pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool;
export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) { return pool.query<T>(text, values); }
