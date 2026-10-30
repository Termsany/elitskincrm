import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), connect: vi.fn(), query: vi.fn(() => { throw new Error('query bypasses transaction'); }) }));
vi.mock('@/lib/session', () => ({ getCurrentUser: mocks.session }));
vi.mock('@/lib/db', () => ({ pool: { connect: mocks.connect }, query: mocks.query }));
import { PATCH } from '@/app/api/admin/orders/[id]/route';

const id = '00000000-0000-4000-8000-000000000001';
const rep = '00000000-0000-4000-8000-000000000002';
const admin = '00000000-0000-4000-8000-000000000003';
const request = (status: string, note = '') => new Request('http://localhost/api/admin/orders/' + id, { method: 'PATCH', body: JSON.stringify({ status, note }) });
const patch = (status: string, note = '', target = id) => PATCH(request(status, note), { params: Promise.resolve({ id: target }) });
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
};

// An in-memory PostgreSQL row lock and transaction: uncommitted writes are private,
// the next SELECT waits for COMMIT/ROLLBACK, and notification failures abort the unit.
function database(options: { failNotification?: boolean; holdNotification?: ReturnType<typeof deferred> } = {}) {
  const state = { status: 'pending', note: '', notifications: [] as Array<{ user: string; id: string; kind: string; message: string }> };
  const queries: string[] = [];
  let lock = Promise.resolve();
  let releaseLock: (() => void) | undefined;
  const enteredNotification = deferred();
  mocks.connect.mockImplementation(async () => {
    let pending: { status: string; note: string } | undefined;
    let notification: (typeof state.notifications)[number] | undefined;
    let unlock: (() => void) | undefined;
    let released = false;
    return {
      query: async (sql: string, args: unknown[] = []) => {
        queries.push(sql);
        if (sql === 'BEGIN') return { rows: [] };
        if (/SELECT\b/i.test(sql)) {
          if (!/FOR UPDATE\b/i.test(sql)) throw new Error('missing row lock');
          const prior = lock;
          lock = new Promise<void>(r => { releaseLock = r; });
          const ownUnlock = releaseLock;
          await prior;
          unlock = ownUnlock;
          return { rows: [{ approval_status: state.status, sales_rep_id: rep, product_name: 'منتج' }] };
        }
        if (/^UPDATE visit_items\b/i.test(sql)) {
          if (!unlock) throw new Error('update without lock');
          pending = { status: String(args[0]), note: String(args[1]) };
          return { rowCount: 1, rows: [] };
        }
        if (/^INSERT INTO task_notifications\b/i.test(sql)) {
          enteredNotification.resolve();
          if (options.holdNotification) await options.holdNotification.promise;
          if (options.failNotification) throw new Error('notification failed');
          notification = { user: String(args[0]), id: String(args[1]), kind: String(args[2]), message: String(args[3]) };
          return { rowCount: 1, rows: [] };
        }
        if (sql === 'COMMIT' || sql === 'ROLLBACK') {
          if (sql === 'COMMIT') {
            if (pending) Object.assign(state, pending);
            if (notification) state.notifications.push(notification);
          }
          unlock?.();
          unlock = undefined;
          return { rows: [] };
        }
        throw new Error('unexpected SQL: ' + sql);
      },
      release: () => { released = true; },
      get released() { return released; },
    };
  });
  return { state, queries, enteredNotification };
}

describe('atomic admin order approval', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ id: admin, role: 'admin' });
  });

  it('commits decision and representative notification together, preserving response and note', async () => {
    const db = database();
    const response = await patch('rejected', 'نفد المخزون');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(db.state).toMatchObject({ status: 'rejected', note: 'نفد المخزون' });
    expect(db.state.notifications).toEqual([{ user: rep, id, kind: 'order_rejected', message: 'تم رفض طلب منتج: نفد المخزون' }]);
    expect(db.queries[0]).toBe('BEGIN');
    expect(db.queries.at(-1)).toBe('COMMIT');
    expect(mocks.connect.mock.results.length).toBe(1);
    expect((await mocks.connect.mock.results[0].value).released).toBe(true);
  });

  it('waits for the first transaction and rejects a contradictory second approval with 409', async () => {
    const holdNotification = deferred();
    const db = database({ holdNotification });
    const first = patch('approved');
    await db.enteredNotification.promise;
    const second = patch('rejected');
    // The second transaction must not mutate while the first holds the row lock.
    await vi.waitFor(() => expect(db.queries.filter(q => /SELECT\b/i.test(q))).toHaveLength(2));
    expect(db.state.status).toBe('pending');
    expect(db.state.notifications).toHaveLength(0);
    holdNotification.resolve();
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(409);
    expect(db.state.status).toBe('approved');
    expect(db.state.notifications).toHaveLength(1);
    expect(db.queries.filter(q => /^UPDATE visit_items\b/i.test(q))).toHaveLength(1);
  });

  it('rolls back the order update if notification insertion fails', async () => {
    const db = database({ failNotification: true });
    const response = await patch('approved');
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(db.state.status).toBe('pending');
    expect(db.state.notifications).toHaveLength(0);
    expect(db.queries.at(-1)).toBe('ROLLBACK');
    expect((await mocks.connect.mock.results[0].value).released).toBe(true);
  });

  it('rejects non-admin and malformed IDs before opening a transaction', async () => {
    database();
    mocks.session.mockResolvedValueOnce({ id: rep, role: 'sales_rep' });
    expect((await patch('approved')).status).toBe(403);
    expect((await patch('approved', '', 'not-a-uuid')).status).toBe(400);
    expect((await patch('approved', '', '00000000-0000-0000-0000-000000000000')).status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('validates body without opening a transaction', async () => {
    database();
    expect((await patch('pending')).status).toBe(400);
    expect((await PATCH(new Request('http://localhost', { method: 'PATCH', body: '{' }), { params: Promise.resolve({ id }) })).status).toBe(400);
    expect((await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: 'approved', note: 123 }) }), { params: Promise.resolve({ id }) })).status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
