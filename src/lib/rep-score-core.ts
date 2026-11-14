/**
 * Monthly rep score out of 100 (pure part, safe for the browser), from five parts the admin can weigh:
 * plan (planned visits done that week), coverage (required visits by class in the rep's area, prorated to today; A doctors count half),
 * sales (own-product sales vs. the month target to date), quality (completed visits with a result) and discipline (cancellations, idle work days).
 * A part with nothing to measure is left out and the others are scaled up.
 */
export const PARTS = ["plan", "coverage", "sales", "quality", "discipline"] as const;
export type Part = typeof PARTS[number];
export type Weights = Record<Part, number>;
export const DEFAULT_WEIGHTS: Weights = { plan: 30, coverage: 25, sales: 25, quality: 10, discipline: 10 };
export const PART_AR: Record<Part, string> = { plan: "الالتزام بالخطة", coverage: "تغطية المنطقة", sales: "المبيعات", quality: "جودة الزيارات", discipline: "الانضباط" };

export type Raw = {
  planned: number; planDone: number;
  required: number; covered: number; aRequired: number; aCovered: number;
  target: number; expected: number; mtd: number;
  completed: number; productive: number;
  total: number; cancelled: number; workDays: number; idleDays: number;
};
const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** Pure: each part as 0..1 (null = nothing to measure). */
export function parts(r: Raw): Record<Part, number | null> {
  const cov = r.required > 0 ? clamp(r.covered / r.required) : null, aCov = r.aRequired > 0 ? clamp(r.aCovered / r.aRequired) : null;
  return {
    plan: r.planned > 0 ? clamp(r.planDone / r.planned) : null,
    coverage: cov === null ? null : aCov === null ? cov : (cov + aCov) / 2,
    sales: r.expected > 0 ? clamp(r.mtd / r.expected) : null,
    quality: r.completed > 0 ? clamp(r.productive / r.completed) : null,
    discipline: r.total > 0 || r.workDays > 0 ? clamp(1 - 0.5 * (r.total ? r.cancelled / r.total : 0) - 0.5 * (r.workDays ? r.idleDays / r.workDays : 0)) : null,
  };
}

/** Pure: weighted score 0..100 and the part that would lift it most. */
export function score(p: Record<Part, number | null>, w: Weights) {
  let got = 0, max = 0, lift: Part | null = null, loss = 0;
  for (const k of PARTS) {
    const v = p[k]; if (v === null || !w[k]) continue;
    got += w[k] * v; max += w[k];
    if (w[k] * (1 - v) > loss) { loss = w[k] * (1 - v); lift = k; }
  }
  return { score: max ? Math.round(got / max * 100) : null, lift: loss >= 2 ? lift : null, liftPts: max ? Math.round(loss / max * 100) : 0 };
}
