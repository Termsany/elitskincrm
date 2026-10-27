import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/session', () => ({ getCurrentUser: mocks.session }));
vi.mock('@/lib/db', () => ({ query: mocks.query }));
vi.mock('@/lib/plan-reminders', () => ({ riyadhDateParts: () => ({ date: '2026-10-26' }) }));

import { GET } from '@/app/api/admin/visits/overview/route';

// The per-rep daily breakdown table (and its backing query) was removed:
// it duplicated the coverage/compliance numbers already shown in detail on
// the Reports and Plans screens, and was the source of a real "Invalid
// Date" bug (its date column came back unaliased). This route now runs one
// fewer query per rep and no longer returns a `daily` field.
describe('admin visits overview', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ role: 'admin' });
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'rep-1', name: 'Rep', email: 'rep@example.com' }] })
      .mockResolvedValueOnce({ rows: [{ total: 0, completed: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0, done: 0 }] });
  });

  it('succeeds without a daily-breakdown query, and the response carries no daily field', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    // 2 lookup queries (frequencies, reps) + 4 per-rep queries (visits, byClass, doctors, planned) = 6.
    expect(mocks.query).toHaveBeenCalledTimes(6);
    const body = await res.json();
    expect(body.reps[0]).not.toHaveProperty('daily');
  });
});
