import { describe, expect, it } from 'vitest';
import {
  allowedRequestTransitions,
  canTransitionRequest,
  defaultRequestDueAt,
  requestNeedsAction,
  requestSlaState,
  type WorkflowRequest,
} from '@/lib/request-workflow';

const base: WorkflowRequest = {
  requester_id: 'rep-1',
  status: 'pending',
  due_at: '2026-10-27T09:00:00.000Z',
  assigned_to: null,
};

describe('service request workflow', () => {
  it('permits only role-appropriate status transitions', () => {
    expect(canTransitionRequest('sales_rep', 'pending', 'cancelled')).toBe(true);
    expect(canTransitionRequest('sales_rep', 'needs_info', 'pending')).toBe(true);
    expect(canTransitionRequest('sales_rep', 'completed', 'reopened')).toBe(true);
    expect(canTransitionRequest('sales_rep', 'pending', 'approved')).toBe(false);
    expect(canTransitionRequest('admin', 'pending', 'in_progress')).toBe(true);
    expect(canTransitionRequest('admin', 'in_progress', 'needs_info')).toBe(true);
    expect(canTransitionRequest('admin', 'approved', 'completed')).toBe(true);
    expect(canTransitionRequest('admin', 'cancelled', 'in_progress')).toBe(false);
    expect(allowedRequestTransitions('admin', 'pending')).toEqual(['in_progress', 'needs_info', 'approved', 'rejected', 'deferred']);
    expect(allowedRequestTransitions('admin', 'completed')).toEqual([]);
    expect(allowedRequestTransitions('sales_rep', 'completed')).toEqual(['reopened', 'closed']);
  });

  it('identifies the next actor without exposing other reps requests', () => {
    expect(requestNeedsAction({ ...base, status: 'needs_info' }, 'sales_rep', 'rep-1')).toBe(true);
    expect(requestNeedsAction({ ...base, status: 'needs_info' }, 'sales_rep', 'rep-2')).toBe(false);
    expect(requestNeedsAction(base, 'admin', 'admin-1')).toBe(true);
    expect(requestNeedsAction({ ...base, status: 'completed' }, 'admin', 'admin-1')).toBe(false);
  });

  it('sets a predictable response target from priority', () => {
    const now = new Date('2026-10-26T09:00:00.000Z');
    expect(defaultRequestDueAt('urgent', now).toISOString()).toBe('2026-10-27T09:00:00.000Z');
    expect(defaultRequestDueAt('normal', now).toISOString()).toBe('2026-10-29T09:00:00.000Z');
    expect(defaultRequestDueAt('low', now).toISOString()).toBe('2026-10-31T09:00:00.000Z');
  });

  it('classifies SLA state from the explicit due date', () => {
    const now = new Date('2026-10-27T08:00:00.000Z');
    expect(requestSlaState(base, now)).toBe('due_soon');
    expect(requestSlaState({ ...base, due_at: '2026-10-27T07:00:00.000Z' }, now)).toBe('overdue');
    expect(requestSlaState({ ...base, status: 'completed' }, now)).toBe('closed');
    expect(requestSlaState({ ...base, due_at: null }, now)).toBe('none');
  });
});
