import type { Morning } from "./morning-summary";

/** Admin home "health": one 0-100 score from four real signals, plus the weakest area to look at first. */
export type HealthIn = {
  salesPct: number | null;      // month-to-date sales as % of the month target
  expectedPct: number | null;   // where that should be today (day / days in month)
  coverage: Array<{ total: number; visited: number }>;
  arOverdue: number; arTotal: number;
  quality: number | null;
};
export type HealthKey = "sales" | "visits" | "collect" | "quality";
export type Chip = { key: HealthKey; label: string; value: number; score: number };
const NAME: Record<HealthKey, string> = { sales: "المبيعات", visits: "تغطية الأطباء", collect: "التحصيل", quality: "جودة الزيارات" };
const W: Record<HealthKey, number> = { sales: 0.3, visits: 0.2, collect: 0.3, quality: 0.2 };
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function healthScore(i: HealthIn) {
  const chips: Chip[] = [];
  if (i.salesPct !== null) chips.push({ key: "sales", label: NAME.sales, value: clamp(i.salesPct), score: clamp(i.expectedPct && i.expectedPct > 0 ? i.salesPct / i.expectedPct * 100 : i.salesPct) });
  const tot = i.coverage.reduce((s, c) => s + c.total, 0);
  if (tot > 0) { const v = clamp(i.coverage.reduce((s, c) => s + c.visited, 0) / tot * 100); chips.push({ key: "visits", label: NAME.visits, value: v, score: v }); }
  if (i.arTotal > 0) { const v = clamp(100 - i.arOverdue / i.arTotal * 100); chips.push({ key: "collect", label: NAME.collect, value: v, score: v }); }
  if (i.quality !== null) chips.push({ key: "quality", label: NAME.quality, value: clamp(i.quality), score: clamp(i.quality) });
  if (!chips.length) return { score: null as number | null, chips, weakest: null as Chip | null, headline: "لسه مفيش بيانات كفاية", note: "ابدأ سجّل زيارات وفواتير وهتظهر الصورة" };
  const w = chips.reduce((s, c) => s + W[c.key], 0);
  const score = clamp(chips.reduce((s, c) => s + c.score * W[c.key], 0) / w);
  const weakest = [...chips].sort((a, b) => a.score - b.score)[0];
  const headline = score >= 80 ? "الصورة الكبيرة ممتازة" : score >= 60 ? "الصورة الكبيرة كويسة" : score >= 40 ? "محتاجين نشتغل على كام حاجة" : "في حاجات مهمة محتاجة تدخل";
  const note = weakest.score < 70 ? `محتاج انتباه في ${weakest.label}` : "كل المؤشرات ماشية كويس";
  return { score, chips, weakest, headline, note };
}
export const toneOf = (s: number) => s >= 75 ? "#1aa865" : s >= 50 ? "#e9a23b" : "#d64545";

export type Action = { id: string; icon: string; tone: "red" | "amber" | "blue"; prio: number; title: string; sub: string; cta: string; href?: string; run?: "autoplan" };
export type ActionIn = {
  manager: boolean; arOverdue: number; arInvoices: number; ar60: number;
  reps: number; withPlan: number | null; pendingTotal: number;
  insights: Array<{ tone: string; title: string; text: string; href: string }>; morning: Morning | null;
};

/** The few things worth doing right now, most important first (max 3). Only real data — nothing is invented. */
export function startActions(i: ActionIn): Action[] {
  const out: Action[] = [];
  const red = i.insights.find(x => x.tone === "red");
  if (red) out.push({ id: "red", icon: "flag", tone: "red", prio: 95, title: red.title, sub: red.text, cta: "راجعها", href: red.href });
  if (i.withPlan !== null && i.reps > 0 && i.withPlan < i.reps) { const m = i.reps - i.withPlan; out.push({ id: "plans", icon: "plans", tone: "amber", prio: 90, title: `${m} ${m === 1 ? "مندوب" : "مناديب"} مفيش عندهم خطة الأسبوع الجاي`, sub: "تجهيز الخطط بيقترح الأطباء الأهم لكل مندوب وبيبعتها للاعتماد", cta: "جهّز الخطط", run: "autoplan" }); }
  const m = i.morning;
  if (m?.visits.idle.length) out.push({ id: "idle", icon: "reps", tone: "amber", prio: 60, title: `${m.visits.idle.length} من غير زيارات إمبارح`, sub: m.visits.idle.join("، "), cta: "المناديب", href: "/visits" });
  if (m && m.followupsToday > 0) out.push({ id: "fu", icon: "time", tone: "blue", prio: 50, title: `${m.followupsToday} متابعة مع أطباء النهارده`, sub: "مواعيد متابعة اتحددت في زيارات", cta: "افتحها", href: "/visits?tab=visits" });
  return out.sort((a, b) => b.prio - a.prio).slice(0, 3);
}
