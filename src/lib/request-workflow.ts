export type RequestRole = 'admin' | 'sales_rep';
export type RequestStatus =
  | 'pending'
  | 'in_progress'
  | 'needs_info'
  | 'approved'
  | 'deferred'
  | 'completed'
  | 'rejected'
  | 'cancelled'
  | 'reopened'
  | 'closed';

export type WorkflowRequest = {
  requester_id: string;
  status: string;
  due_at: string | Date | null;
  assigned_to: string | null;
};

const adminTransitions: Record<string, RequestStatus[]> = {
  pending: ['in_progress', 'needs_info', 'approved', 'rejected', 'deferred'],
  reopened: ['in_progress', 'needs_info', 'approved', 'rejected', 'deferred'],
  in_progress: ['needs_info', 'approved', 'completed', 'rejected', 'deferred'],
  needs_info: ['in_progress', 'rejected', 'deferred'],
  approved: ['in_progress', 'completed', 'deferred'],
  deferred: ['in_progress', 'needs_info', 'approved', 'rejected'],
  completed: [],
};

const repTransitions: Record<string, RequestStatus[]> = {
  pending: ['cancelled'],
  in_progress: ['cancelled'],
  needs_info: ['pending', 'cancelled'],
  completed: ['reopened', 'closed'],
};

export function allowedRequestTransitions(role: RequestRole, from: string): RequestStatus[] {
  const map = role === 'admin' ? adminTransitions : repTransitions;
  return [...(map[from] || [])];
}

export function canTransitionRequest(role: RequestRole, from: string, to: string): boolean {
  return allowedRequestTransitions(role, from).includes(to as RequestStatus);
}

export function requestNeedsAction(request: WorkflowRequest, role: RequestRole, actorId: string): boolean {
  if (role === 'sales_rep') {
    return request.requester_id === actorId && request.status === 'needs_info';
  }
  return ['pending', 'reopened'].includes(request.status);
}

export function defaultRequestDueAt(priority: string, now = new Date()): Date {
  const hours: Record<string, number> = { urgent: 24, high: 48, normal: 72, low: 120 };
  return new Date(now.getTime() + (hours[priority] || hours.normal) * 60 * 60 * 1000);
}

export function requestSlaState(
  request: Pick<WorkflowRequest, 'status' | 'due_at'>,
  now = new Date(),
): 'none' | 'on_track' | 'due_soon' | 'overdue' | 'closed' {
  if (['completed', 'closed', 'cancelled', 'rejected'].includes(request.status)) return 'closed';
  if (!request.due_at) return 'none';
  const due = new Date(request.due_at).getTime();
  if (!Number.isFinite(due)) return 'none';
  const remaining = due - now.getTime();
  if (remaining < 0) return 'overdue';
  if (remaining <= 24 * 60 * 60 * 1000) return 'due_soon';
  return 'on_track';
}

export const requestStatusLabel: Record<RequestStatus, string> = {
  pending: 'جديد',
  in_progress: 'قيد المعالجة',
  needs_info: 'يحتاج معلومات',
  approved: 'معتمد',
  deferred: 'مؤجل',
  completed: 'مكتمل',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
  reopened: 'معاد فتحه',
  closed: 'مغلق',
};
