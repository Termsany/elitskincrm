import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/session', () => ({ getCurrentUser: mocks.session }));
vi.mock('@/lib/db', () => ({ query: mocks.query }));
import { GET } from '@/app/api/admin/home/route';

const ids = Array.from({ length: 10 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);

describe('admin home', () => {
  beforeEach(() => vi.resetAllMocks());

  it('rejects missing and non-admin sessions without querying', async () => {
    mocks.session.mockResolvedValueOnce(null).mockResolvedValueOnce({ role: 'sales_rep' });
    expect((await GET()).status).toBe(401);
    expect((await GET()).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('returns one coherent uncached snapshot with all actionable orders beyond preview', async () => {
    mocks.session.mockResolvedValue({ role: 'admin' });
    const queue = ids.map((id) => ({ id, kind: 'pendingOrders', title: `طلب ${id}`, owner: 'مندوب', created_at: '2026-10-28T00:00:00Z', href: `#order-${id}`, rep_id: ids[0] }));
    const row = {
      today: '2026-10-28', generated_at: '2026-10-28T00:00:00Z',
      visits: [{ rep_id: ids[0], rep_name: 'مندوب', total: 2, last_visit_at: '2026-10-27T22:00:00Z' }],
      counts: { pendingOrders: 10, pendingDoctorRequests: 0, activeServiceRequests: 0, pendingPlans: 0, overdueTasks: 0, overdueFollowups: 0 },
      queue,
    };
    mocks.query.mockResolvedValue({ rows: [row] });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({ ...row, queueLimit: 8 });
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).not.toMatch(/\bLIMIT\s+(?:8|\$\d+)/i);
    expect(sql).toContain('Asia/Riyadh');
    expect(params).toEqual([]);
  });

  it('points task and follow-up rows at an exact record rather than a redirect or unanchored profile', async () => {
    mocks.session.mockResolvedValue({ role: 'admin' });
    mocks.query.mockResolvedValue({ rows: [{ today: '2026-10-28', generated_at: '2026-10-28T00:00:00Z', visits: [], counts: {}, queue: [] }] });
    await GET();
    const sql = mocks.query.mock.calls[0][0] as string;
    expect(sql).toContain("'/tasks?view=full&task='");
    expect(sql).toContain("'?followup=' || f.id::text || '#followup-' || f.id::text");
  });

  it('prioritizes overdue work and gives orders enough context to decide safely', async () => {
    mocks.session.mockResolvedValue({ role: 'admin' });
    mocks.query.mockResolvedValue({ rows: [{ today: '2026-10-28', generated_at: '2026-10-28T00:00:00Z', visits: [], counts: {}, queue: [] }] });
    await GET();
    const sql = mocks.query.mock.calls[0][0] as string;
    expect(sql).toContain('vi.quantity');
    expect(sql).toContain('doc.name');
    expect(sql).toMatch(/ORDER BY CASE WHEN kind IN \('overdueTasks','overdueFollowups'\)/);
  });

  it('does not call a future planned visit the last completed visit', async () => {
    mocks.session.mockResolvedValue({ role: 'admin' });
    mocks.query.mockResolvedValue({ rows: [{ today: '2026-10-28', generated_at: '2026-10-28T00:00:00Z', visits: [], counts: {}, queue: [] }] });
    await GET();
    const sql = mocks.query.mock.calls[0][0] as string;
    expect(sql).toContain("max(v.visited_at) FILTER (WHERE v.visited_at <= c.generated_at AND v.status IN ('completed','follow_up')) AS last_visit_at");
  });

  it('provides an exact visit detail link for an order before approval', async () => {
    mocks.session.mockResolvedValue({ role: 'admin' });
    mocks.query.mockResolvedValue({ rows: [{ today: '2026-10-28', generated_at: '2026-10-28T00:00:00Z', visits: [], counts: {}, queue: [] }] });
    await GET();
    const sql = mocks.query.mock.calls[0][0] as string;
    expect(sql).toContain("'/visits?repId=' || u.id::text");
    expect(sql).toContain("'&visit=' || v.id::text || '&order=' || vi.id::text");
    expect(sql).toContain("'detail_href',detail_href");
  });

  it('does not report misleading zeros or leak errors on database or session failures', async () => {
    mocks.session.mockResolvedValue({ role: 'admin' });
    mocks.query.mockRejectedValue(new Error('secret SQL detail'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('counts');
    mocks.session.mockRejectedValue(new Error('secret session detail'));
    expect((await GET()).status).toBe(503);
  });
});
