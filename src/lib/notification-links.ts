export type NotificationLink = {
  kind: string;
  action_url?: string | null;
  task_id?: string | null;
  plan_id?: string | null;
};

/** Top-level sections of the app a notification may link to ('' is the home page). */
const APP_SECTIONS = new Set(['', 'admin', 'requests', 'plans', 'tasks', 'calendar', 'library', 'visits', 'expenses', 'doctors', 'daftra-sales', 'work', 'sales', 'products', 'forecast', 'account', 'my']);

export function notificationHref(notification: NotificationLink, role: string): string {
  const explicit = notification.action_url;
  // Any page of the app (by its first path segment), never an external or protocol-relative URL.
  if (explicit && explicit.startsWith('/') && !explicit.startsWith('//') && !explicit.includes('\\')) {
    const first = explicit.split(/[?#]/)[0].split('/')[1] ?? '';
    if (APP_SECTIONS.has(first)) return explicit;
  }
  if (notification.kind.startsWith('plan_change')) return '/calendar';
  if (notification.plan_id || notification.kind.startsWith('plan_')) return '/plans';
  if (notification.task_id || ['assigned', 'update', 'comment', 'reminder', 'overdue'].includes(notification.kind)) return '/tasks';
  return role === 'admin' ? '/admin/requests' : '/requests';
}
