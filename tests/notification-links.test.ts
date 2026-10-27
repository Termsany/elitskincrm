import { describe, expect, it } from 'vitest';
import { notificationHref } from '@/lib/notification-links';

describe('notification deep links', () => {
  it('uses an explicit safe request URL when present', () => {
    expect(notificationHref({ kind: 'service_request_updated', action_url: '/requests?request=req-1' }, 'sales_rep')).toBe('/requests?request=req-1');
    expect(notificationHref({ kind: 'service_request_created', action_url: '/admin/requests?request=req-1' }, 'admin')).toBe('/admin/requests?request=req-1');
  });

  it('rejects external URLs and falls back by role', () => {
    expect(notificationHref({ kind: 'service_request_updated', action_url: 'https://evil.example' }, 'sales_rep')).toBe('/requests');
    expect(notificationHref({ kind: 'service_request_updated', action_url: '//evil.example' }, 'admin')).toBe('/admin/requests');
    expect(notificationHref({ kind: 'service_request_updated', action_url: '/unexpected' }, 'admin')).toBe('/admin/requests');
  });

  it('preserves existing plan and task destinations', () => {
    expect(notificationHref({ kind: 'plan_approved', plan_id: 'plan-1' }, 'sales_rep')).toBe('/plans');
    expect(notificationHref({ kind: 'assigned', task_id: 'task-1' }, 'sales_rep')).toBe('/tasks');
  });
});
