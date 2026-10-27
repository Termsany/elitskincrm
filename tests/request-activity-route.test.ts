import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn(), connect: vi.fn() }));
vi.mock('@/lib/session', () => ({ getCurrentUser: mocks.session }));
vi.mock('@/lib/db', () => ({ query: mocks.query, pool: { connect: mocks.connect } }));

import { GET, POST } from '@/app/api/requests/[id]/activity/route';

const params = { params: Promise.resolve({ id: 'request-1' }) };

describe('request activity authorization and lifecycle', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires authentication before reading activity', async () => {
    mocks.session.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost/api/requests/request-1/activity'), params);
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('requires authentication before posting activity', async () => {
    mocks.session.mockResolvedValue(null);
    const response = await POST(new Request('http://localhost/api/requests/request-1/activity', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'hello' }),
    }), params);
    expect(response.status).toBe(401);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('lets the owning rep confirm closure after completion', async () => {
    mocks.session.mockResolvedValue({ id: 'rep-1', role: 'sales_rep', name: 'Rep' });
    const client = { query: vi.fn(), release: vi.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ requester_id: 'rep-1', title: 'طلب', status: 'completed', assigned_to: null }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});
    mocks.connect.mockResolvedValue(client);

    const response = await POST(new Request('http://localhost/api/requests/request-1/activity', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'تم استلام النتيجة', close: true }),
    }), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: 'closed' });
    expect(client.query.mock.calls.some(call => String(call[0]).includes('UPDATE service_requests') && call[1]?.[0] === 'closed')).toBe(true);
  });
});
