export function fmtDate(d: string | Date) {
  const dt = new Date(d);
  return dt.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}
export function fmtDateTime(d: string | Date) {
  const dt = new Date(d);
  return dt.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
}
export const statusLabel: Record<string, string> = {
  planned: "مجدولة",
  completed: "مكتملة",
  cancelled: "ملغاة",
  follow_up: "متابعة",
};
export const statusColor: Record<string, string> = {
  planned: "bg-amber-100 text-amber-800 border-amber-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  follow_up: "bg-sky-100 text-sky-800 border-sky-200",
};
