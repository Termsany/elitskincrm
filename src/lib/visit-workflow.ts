export type VisitStatusTone = "success" | "info" | "danger" | "warn" | "neutral";
export type VisitStatusMeta = { label: string; tone: VisitStatusTone; icon: string };

const STATUS_META: Record<string, VisitStatusMeta> = {
  completed: { label: "مكتملة", tone: "success", icon: "✓" },
  planned: { label: "مجدولة", tone: "info", icon: "◷" },
  cancelled: { label: "ملغاة", tone: "danger", icon: "×" },
};

export function getVisitStatusMeta(status: string): VisitStatusMeta {
  return STATUS_META[status] || { label: "غير محددة", tone: "neutral", icon: "•" };
}

export function canEditVisit({
  isAdmin,
  userId,
  visit,
  now = Date.now(),
}: {
  isAdmin: boolean;
  userId: string;
  visit: { sales_rep_id: string; visited_at: string };
  now?: number;
}): boolean {
  if (isAdmin) return true;
  if (visit.sales_rep_id !== userId) return false;
  const age = now - new Date(visit.visited_at).getTime();
  return age >= 0 && age < 24 * 60 * 60 * 1000;
}

export function buildVisitQuery(filters: { q: string; repId: string; status: string; from: string; to: string }): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.repId) params.set("repId", filters.repId);
  if (filters.status) params.set("status", filters.status);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("limit", "100");
  return params.toString();
}
