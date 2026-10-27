import { describe, expect, it } from 'vitest';
import {
  requestToWorkItem, riyadhDay, sortWorkItems, summarizeWorkItems, taskToWorkItem,
  type RequestRow, type TaskRow,
} from '../src/lib/work-items';

const now = new Date('2026-10-26T09:00:00.000Z');
const req = (over: Partial<RequestRow> = {}): RequestRow => ({
  id: 'r1', title: 'طلب', status: 'pending', priority: 'normal', due_at: '2026-10-28T09:00:00.000Z',
  requester_id: 'rep-1', assigned_to: null, assigned_name: null, requester_name: 'مندوب', updated_at: '2026-10-26T08:00:00.000Z', ...over,
});
const task = (over: Partial<TaskRow> = {}): TaskRow => ({
  id: 't1', title: 'مهمة', status: 'pending', priority: 'medium', due_date: '2026-10-26',
  assignee_names: null, creator_name: 'أدمن', updated_at: '2026-10-26T08:00:00.000Z', ...over,
});

describe('work items', () => {
  it('flags requests that need the rep or the admin', () => {
    expect(requestToWorkItem(req({ status: 'needs_info' }), 'sales_rep', 'rep-1', 0, now).needs_action).toBe(true);
    expect(requestToWorkItem(req({ status: 'pending' }), 'sales_rep', 'rep-1', 0, now).needs_action).toBe(false);
    expect(requestToWorkItem(req({ status: 'pending' }), 'admin', 'a1', 0, now).needs_action).toBe(true);
    expect(requestToWorkItem(req({ status: 'approved' }), 'admin', 'a1', 0, now).needs_action).toBe(false);
  });

  it('builds role-specific deep links', () => {
    expect(taskToWorkItem(task(), 'sales_rep', 0, now).href).toBe('/tasks?view=full');
    expect(requestToWorkItem(req(), 'admin', 'a1', 0, now).href).toBe('/admin/requests?request=r1');
    expect(requestToWorkItem(req(), 'sales_rep', 'rep-1', 0, now).href).toBe('/requests?request=r1');
  });

  it('marks overdue requests and tasks using Riyadh end of day', () => {
    expect(requestToWorkItem(req({ due_at: '2026-10-25T09:00:00.000Z' }), 'admin', 'a1', 0, now).overdue).toBe(true);
    expect(taskToWorkItem(task({ due_date: '2026-10-26' }), 'sales_rep', 0, now).overdue).toBe(false);
    expect(taskToWorkItem(task({ due_date: '2026-10-25' }), 'sales_rep', 0, now).overdue).toBe(true);
    expect(taskToWorkItem(task({ status: 'completed', due_date: '2026-10-01' }), 'sales_rep', 0, now).overdue).toBe(false);
  });

  it('keeps admin task rows as follow-up and rep task rows as action', () => {
    expect(taskToWorkItem(task(), 'admin', 0, now).needs_action).toBe(false);
    expect(taskToWorkItem(task(), 'sales_rep', 0, now).needs_action).toBe(true);
  });

  it('sorts overdue first, then needs-action, then priority and due date', () => {
    const items = [
      requestToWorkItem(req({ id: 'a', status: 'approved', priority: 'low' }), 'admin', 'a1', 0, now),
      requestToWorkItem(req({ id: 'b', status: 'pending', priority: 'urgent' }), 'admin', 'a1', 0, now),
      requestToWorkItem(req({ id: 'c', status: 'approved', due_at: '2026-10-20T00:00:00.000Z' }), 'admin', 'a1', 0, now),
    ];
    expect(sortWorkItems(items).map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });

  it('summarizes the full list including due today in Riyadh', () => {
    const items = [
      taskToWorkItem(task({ id: 'x', due_date: '2026-10-26' }), 'sales_rep', 0, now),
      requestToWorkItem(req({ id: 'y', status: 'needs_info', due_at: '2026-10-24T00:00:00.000Z' }), 'sales_rep', 'rep-1', 0, now),
      requestToWorkItem(req({ id: 'z', status: 'pending' }), 'sales_rep', 'rep-1', 0, now),
    ];
    expect(summarizeWorkItems(items, now)).toEqual({ overdue: 1, needs_action: 2, due_today: 1, waiting: 1, total: 3 });
    expect(riyadhDay('2026-10-26T22:00:00.000Z')).toBe('2026-10-27');
  });
});
