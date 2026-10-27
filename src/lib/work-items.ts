import { requestSlaState, requestStatusLabel, type RequestStatus } from './request-workflow';

export type WorkItemType = 'request' | 'task';
export type WorkItemPriority = 'low' | 'normal' | 'high' | 'urgent';
export type WorkTab = 'mine' | 'following' | 'all';

export type WorkItem = {
  key: string;
  type: WorkItemType;
  id: string;
  title: string;
  status: string;
  status_label: string;
  priority: WorkItemPriority;
  due_at: string | null;
  overdue: boolean;
  needs_action: boolean;
  owner_name: string | null;
  requester_name: string | null;
  unread: number;
  href: string;
  updated_at: string;
};

export type WorkSummary = { overdue: number; needs_action: number; due_today: number; waiting: number; total: number };

export type RequestRow = {
  id: string; title: string; status: string; priority: string; due_at: string | Date | null;
  requester_id: string; assigned_to: string | null; assigned_name: string | null; requester_name: string | null;
  updated_at: string | Date;
};
export type TaskRow = {
  id: string; title: string; status: string; priority: string; due_date: string | null;
  assignee_names: string | null; creator_name: string | null; updated_at: string | Date;
};

const taskStatusLabel: Record<string, string> = {
  pending: 'جديدة', in_progress: 'قيد التنفيذ', completed: 'مكتملة', failed: 'تعذر التنفيذ',
};
const priorityMap: Record<string, WorkItemPriority> = { low: 'low', medium: 'normal', normal: 'normal', high: 'high', urgent: 'urgent' };
const priorityRank: Record<WorkItemPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export const OPEN_REQUEST_STATUSES = ['pending', 'in_progress', 'needs_info', 'approved', 'deferred', 'reopened'];
export const OPEN_TASK_STATUSES = ['pending', 'in_progress'];

export function riyadhDay(value: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function requestToWorkItem(row: RequestRow, role: string, userId: string, unread = 0, now = new Date()): WorkItem {
  const dueAt = iso(row.due_at);
  const overdue = requestSlaState({ status: row.status, due_at: dueAt }, now) === 'overdue';
  const adminActs = ['pending', 'reopened'].includes(row.status) || (row.status === 'in_progress' && row.assigned_to === userId);
  const needsAction = role === 'admin' ? adminActs : row.requester_id === userId && row.status === 'needs_info';
  return {
    key: `request:${row.id}`, type: 'request', id: row.id, title: row.title, status: row.status,
    status_label: requestStatusLabel[row.status as RequestStatus] || row.status,
    priority: priorityMap[row.priority] || 'normal', due_at: dueAt, overdue, needs_action: needsAction,
    owner_name: row.assigned_name, requester_name: row.requester_name, unread,
    href: role === 'admin' ? `/admin/requests?request=${row.id}` : `/requests?request=${row.id}`,
    updated_at: iso(row.updated_at) || new Date(0).toISOString(),
  };
}

export function taskToWorkItem(row: TaskRow, role: string, unread = 0, now = new Date()): WorkItem {
  // due_date is a calendar date; it is overdue only after the end of that day in Riyadh.
  const dueAt = row.due_date ? new Date(`${String(row.due_date).slice(0, 10)}T23:59:59+03:00`).toISOString() : null;
  const open = OPEN_TASK_STATUSES.includes(row.status);
  const overdue = open && !!dueAt && new Date(dueAt).getTime() < now.getTime();
  return {
    key: `task:${row.id}`, type: 'task', id: row.id, title: row.title, status: row.status,
    status_label: taskStatusLabel[row.status] || row.status,
    priority: priorityMap[row.priority] || 'normal', due_at: dueAt, overdue,
    needs_action: role !== 'admin' && open,
    owner_name: row.assignee_names, requester_name: row.creator_name, unread,
    href: '/tasks?view=full', updated_at: iso(row.updated_at) || new Date(0).toISOString(),
  };
}

export function sortWorkItems(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.needs_action !== b.needs_action) return a.needs_action ? -1 : 1;
    if (priorityRank[a.priority] !== priorityRank[b.priority]) return priorityRank[a.priority] - priorityRank[b.priority];
    const ad = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const bd = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    return b.updated_at.localeCompare(a.updated_at);
  });
}

export function summarizeWorkItems(items: WorkItem[], now = new Date()): WorkSummary {
  const today = riyadhDay(now);
  return {
    overdue: items.filter((item) => item.overdue).length,
    needs_action: items.filter((item) => item.needs_action).length,
    due_today: items.filter((item) => !item.overdue && item.due_at && riyadhDay(item.due_at) === today).length,
    waiting: items.filter((item) => !item.needs_action).length,
    total: items.length,
  };
}
