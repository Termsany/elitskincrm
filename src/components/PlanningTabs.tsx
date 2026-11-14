import Link from "next/link";

export type PlanTab = "week" | "area" | "score" | "team" | "map" | "calendar";

/** Planning lives in one place: the week, the area, the monthly score and the calendar. */
export default function PlanningTabs({ active, isAdmin }: { active: PlanTab; isAdmin: boolean }) {
  const tabs: Array<[PlanTab, string, string]> = isAdmin
    ? [["team", "/plans", "الفريق"], ["map", "/plans?tab=map", "التغطية"], ["score", "/plans?tab=score", "التقييم"], ["calendar", "/calendar", "التقويم"]]
    : [["week", "/plans", "أسبوعي"], ["area", "/plans?tab=area", "منطقتي"], ["score", "/plans?tab=score", "تقييمي"], ["calendar", "/calendar", "التقويم"]];
  return <nav aria-label="الخطة" className="mb-4 flex gap-1 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white p-1.5">
    {tabs.map(([k, href, label]) => <Link key={k} href={href} aria-current={active === k ? "page" : undefined}
      className={`flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-xl px-4 text-sm font-extrabold transition ${active === k ? "bg-[var(--navy)] text-white shadow" : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--navy)]"}`}>{label}</Link>)}
  </nav>;
}
