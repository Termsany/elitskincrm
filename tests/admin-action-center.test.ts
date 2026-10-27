import { describe, it, expect } from 'vitest';
import { Client } from 'pg';
import { ACTION_CENTER_SQL, ACTION_CENTER_VALUES, ACTION_CARDS } from '@/lib/admin-action-center';

// Run DB integration via builder with PGHOST/PGUSER/PGPASSWORD/PGDATABASE (or DATABASE_URL).
// Plain unit-test runs without a configured DB explicitly skip this integration test.
describe.skipIf(!process.env.PGHOST && !process.env.DATABASE_URL)('admin action center query', () => {
  it('counts exact workflow states, excludes terminal/archived/null/today tasks, keeps full counts separate from queue limits', async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    try {
      await db.query('BEGIN');
      // Temporary tables shadow production tables on this connection only. No production writes.
      await db.query(`CREATE TEMP TABLE plans(id text,user_id text,status text,created_at timestamptz,period_start date,period_end date) ON COMMIT DROP;
        CREATE TEMP TABLE users(id text,name text) ON COMMIT DROP;
        CREATE TEMP TABLE doctor_requests(id text,requester_id text,status text,kind text,payload jsonb,created_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE service_requests(id text,requester_id text,status text,title text,created_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE tasks(id text,title text,status text,archived boolean,due_date date,created_at timestamptz) ON COMMIT DROP;
        INSERT INTO users VALUES ('rep','مندوب');
        INSERT INTO plans SELECT n::text,'rep','pending',now()-n*interval '1 minute',current_date,current_date FROM generate_series(1,12) n;
        INSERT INTO plans SELECT status,'rep',status,now(),current_date,current_date FROM unnest(ARRAY['draft','approved','rejected','needs_revision']) status;
        INSERT INTO doctor_requests SELECT status,'rep',status,'create','{"name":"طبيب"}',now() FROM unnest(ARRAY['pending','approved','rejected']) status;
        INSERT INTO service_requests SELECT status,'rep',status,status,now() FROM unnest(ARRAY['pending','in_progress','completed','rejected','cancelled']) status;
        INSERT INTO tasks SELECT status,status,status,false,(now() AT TIME ZONE 'Asia/Riyadh')::date-1,now() FROM unnest(ARRAY['pending','in_progress','completed','failed']) status;
        INSERT INTO tasks VALUES ('archive','archived','pending',true,(now() AT TIME ZONE 'Asia/Riyadh')::date-1,now()),('null','no due','pending',false,null,now()),('today','today','pending',false,(now() AT TIME ZONE 'Asia/Riyadh')::date,now());`);
      const {rows:[row]} = await db.query(ACTION_CENTER_SQL, [...ACTION_CENTER_VALUES]);
      expect(row.counts).toEqual({pendingPlans:12,pendingDoctorRequests:1,activeServiceRequests:2,overdueTasks:2});
      expect(row.queue).toHaveLength(6);
      expect(row.riyadh_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.queue.every((item:{kind:string})=>ACTION_CARDS.some(card=>card.key===item.kind))).toBe(true);
      expect(ACTION_CARDS.map(card=>card.href)).toEqual(['/plans?status=pending','/admin/requests','/admin/requests','/tasks']);
      await db.query('ROLLBACK');
    } finally { await db.end(); }
  });
});
