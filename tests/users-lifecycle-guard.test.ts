import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const db = vi.hoisted(() => {
  const client = { query: vi.fn(), release: vi.fn() };
  return { client, connect: vi.fn(async () => client) };
});
vi.mock('@/lib/db', () => ({ pool: { connect: db.connect }, query: (...args: [string, ...unknown[]]) => db.client.query(...args) }));
vi.mock('@/lib/session', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'admin-1', role: 'admin' })) }));
vi.mock('@/lib/auth', () => ({ hashPassword: vi.fn(async () => 'hash') }));
import { PATCH, DELETE } from '@/app/api/admin/users/[id]/route';

const params = { params: Promise.resolve({ id: 'rep-1' }) };
const request = (body: object) => new Request('http://localhost/api/admin/users/rep-1', { method: 'PATCH', body: JSON.stringify(body) });
const statements = () => db.client.query.mock.calls.map(call => String(call[0]));
beforeEach(() => {
  db.client.query.mockReset(); db.client.release.mockReset(); db.connect.mockClear();
  db.client.query.mockImplementation(async (sql: string) => sql.includes('SELECT role') ? { rows: [{ role: 'sales_rep', assigned_product_id: '11111111-1111-4111-8111-111111111111', active: true }] } : { rows: [] });
});

describe('user route lifecycle guards', () => {
  it('never deletes a user or dependent records through DELETE', async () => {
    const response = await DELETE(new Request('http://localhost/api/admin/users/rep-1', { method: 'DELETE' }), params);
    expect(response.status).toBe(405);
    expect(statements().join('\n')).not.toMatch(/DELETE FROM users/i);
  });
  it('revokes sessions in the same transaction as deactivation and audit', async () => {
    const response = await PATCH(request({ active: false }), params);
    expect(response.status).toBe(200);
    expect(statements().join('\n')).toMatch(/DELETE FROM sessions WHERE user_id=/i);
    expect(statements()).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']));
    expect(statements().indexOf('DELETE FROM sessions WHERE user_id=$1')).toBeLessThan(statements().indexOf('COMMIT'));
    expect(db.client.release).toHaveBeenCalledOnce();
  });
  it('rolls back both account and session changes if revocation fails', async () => {
    db.client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT role')) return { rows: [{ role: 'sales_rep', assigned_product_id: '11111111-1111-4111-8111-111111111111', active: true }] };
      if (sql.includes('DELETE FROM sessions')) throw new Error('session failure');
      return { rows: [] };
    });
    const response = await PATCH(request({ active: false }), params);
    expect(response.status).toBe(500);
    expect(statements()).toContain('ROLLBACK');
    expect(statements()).not.toContain('COMMIT');
  });
  it('revokes sessions if the role changes away from sales representative', async () => {
    const response = await PATCH(request({ role: 'admin' }), params);
    expect(response.status).toBe(200);
    expect(statements().join('\n')).toMatch(/DELETE FROM sessions WHERE user_id=/i);
  });
  it('preserves profile updates without revoking sessions', async () => {
    const response = await PATCH(request({ name: 'New Name' }), params);
    expect(response.status).toBe(200);
    expect(statements().join('\n')).not.toMatch(/DELETE FROM sessions/i);
  });
});

describe('rep client lifecycle and performance refresh', () => {
  it('routes the account toggle through the lifecycle endpoint and reloads authoritative metrics after save', () => {
    const source = readFileSync('src/app/admin/reps/RepsClient.tsx', 'utf8');
    expect(source).toContain('/api/admin/reps/${rep.id}/lifecycle');
    expect(source).toContain('window.location.reload()');
    expect(source).not.toContain('setRows((fresh.users||[])');
  });
});
