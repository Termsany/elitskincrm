export type PlanWorkspaceTab = { id: "overview" | "review" | "builder" | "plans" | "execution"; label: string; hint: string };

export function planWorkspaceTabs(isAdmin: boolean): PlanWorkspaceTab[] {
  const shared: PlanWorkspaceTab[] = [
    { id: "overview", label: "نظرة عامة", hint: "المؤشرات والأولويات" },
    { id: "builder", label: isAdmin ? "إنشاء خطة" : "رتّب خطتك", hint: "التقويم والأطباء" },
    { id: "plans", label: "كل الخطط", hint: "بحث وتصفية" },
    { id: "execution", label: "التنفيذ", hint: "المخطط والمنفذ" },
  ];
  if (isAdmin) shared.splice(1, 0, { id: "review", label: "مراجعة الخطط", hint: "الاعتماد والتعديل" });
  return shared;
}

export function planTargetProgress(items: number, target: number | null | undefined): number {
  if (!target || target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((items / target) * 100)));
}

export function isPlanWorkspacePayload(value: unknown): value is { plans: unknown[]; summary: Record<string, unknown>; templates?: unknown[]; repSummary?: unknown[] } {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return Array.isArray(row.plans) && !!row.summary && typeof row.summary === "object";
}

export function representativeCanReceivePlan(active: unknown): boolean {
  return active === true;
}
