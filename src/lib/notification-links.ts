export type NotificationLink = {
  kind: string;
  action_url?: string | null;
  task_id?: string | null;
  plan_id?: string | null;
};

export function notificationHref(notification: NotificationLink, role: string): string {
  const explicit = notification.action_url;
  const allowed = ['/requests', '/admin/requests', '/plans', '/tasks', '/admin/reps', '/calendar', '/library', '/visits', '/expenses'];
  if (explicit && explicit.startsWith('/') && !explicit.startsWith('//')) {
    const pathname = explicit.split('?')[0];
    if (allowed.includes(pathname)) return explicit;
  }
  if (notification.kind.startsWith('plan_change')) return '/calendar';
  if (notification.plan_id || notification.kind.startsWith('plan_')) return '/plans';
  if (notification.task_id || ['assigned', 'update', 'comment', 'reminder', 'overdue'].includes(notification.kind)) return '/tasks';
  return role === 'admin' ? '/admin/requests' : '/requests';
}
