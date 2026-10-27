import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/session', () => ({ getCurrentUser: mocks.session }));
vi.mock('@/lib/db', () => ({ query: mocks.query }));
vi.mock('@/lib/plan-reminders', () => ({ riyadhDateParts: () => ({ date: '2026-10-26' }) }));

import { GET } from '@/app/api/admin/visits/overview/route';

describe('admin visits overview SQL', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ role: 'admin' });
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'rep-1', name: 'Rep', email: 'rep@example.com' }] })
      .mockResolvedValueOnce({ rows: [{ total: 0, completed: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0, done: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
  });

  it('uses non-reserved aliases in the daily aggregation query', async () => {
    expect((await GET()).status).toBe(200);
    const dailySql = String(mocks.query.mock.calls.at(-1)?.[0]);
    expect(dailySql).toContain('AS visit_day');
    expect(dailySql).toContain('AS plan_day');
    expect(dailySql).not.toMatch(/::date\s+day\b/);
    expect(dailySql).not.toMatch(/planned_date\s+day\b/);
    // Regression: the query must alias its date column as "day" — the
    // frontend (AdminVisitsOverview) reads `d.day` to render each row's
    // date, and silently got `undefined` (-> "Invalid Date") when this
    // column came back unaliased as the implicit "day_value".
    expect(dailySql).toMatch(/day_value::date\s+AS\s+day\b/i);
  });

  it('returns daily rows shaped so the frontend can build a valid Date from each one', async () => {
    mocks.query.mockReset();
    mocks.session.mockResolvedValue({ role: 'admin' });
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'rep-1', name: 'Rep', email: 'rep@example.com' }] })
      .mockResolvedValueOnce({ rows: [{ total: 0, completed: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0, done: 0 }] })
      .mockResolvedValueOnce({ rows: [{ day: '2026-10-26', visits: 1, planned: 2 }] });
    const res = await GET();
    const body = await res.json();
    const [row] = body.reps[0].daily;
    expect(row.day).toBe('2026-10-26');
    expect(Number.isNaN(new Date(`${row.day}T12:00:00`).getTime())).toBe(false);
  });
});
