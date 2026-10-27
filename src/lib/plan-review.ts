export function planDateOnly(value: unknown): string {
  if (value instanceof Date) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    const get = (type: string) => parts.find(part => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  const raw = String(value ?? "");
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? planDateOnly(parsed) : "";
}

export function canAdminReviewPlan(status: unknown): boolean {
  return status === "pending";
}
