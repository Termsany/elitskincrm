export type OrderApprovalStatus = "pending" | "approved" | "rejected";

export function canTransitionOrder(current: OrderApprovalStatus, next: OrderApprovalStatus, role: string) {
  if (role !== "admin") return false;
  if (current !== "pending") return false;
  return next === "approved" || next === "rejected";
}

export function orderStatusLabel(status: OrderApprovalStatus) {
  return ({ pending: "بانتظار الموافقة", approved: "تمت الموافقة", rejected: "مرفوض" } as const)[status];
}
